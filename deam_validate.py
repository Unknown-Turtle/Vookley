"""
DEAM validation — STAGE 2 (fast): does TRIBE predict human arousal, and does it
add anything a dumb audio baseline doesn't?

Run after deam_tribe_batch.py has produced tensors:

    venv_neuro/bin/python deam_validate.py
    venv_neuro/bin/python deam_validate.py --inspect   # just report readiness

The decisive test is INCREMENTAL VALIDITY, not a single correlation:
  * Model A: human_arousal ~ audio baseline (RMS, centroid, flux, ZCR, onset)
  * Model B: human_arousal ~ audio baseline + TRIBE features
If B's cross-validated R^2 doesn't beat A's, the neuro layer is decoration —
an expensive loudness meter. If it does, there's a real core worth building on.

No external deps beyond scipy/sklearn (already installed) + system ffmpeg:
audio is decoded with ffmpeg, so librosa is not required.
"""
import argparse
import subprocess
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import signal
from scipy.stats import pearsonr
from sklearn.linear_model import Ridge
from sklearn.model_selection import KFold, cross_val_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from deam_common import find_audio_files, load_static_annotations
# Reuse the exact Neurosynth surface maps the emotion pipeline built.
from emotion_map import SURF_DIR, TERMS, AROUSAL_TERMS, pattern_correlation, N_VERTICES

TENSOR_DIR = Path("data/DEAM/tribe_out")
OUT = Path("outputs")
AUDIO_FEATURES = ["rms", "centroid", "flux", "zcr", "onset_rate"]
TRIBE_FEATURES = ["tribe_mag", "tribe_arousal"]


# ----------------------------------------------------------------------
# audio baseline (ffmpeg decode + scipy) — the "is it just loudness?" model
# ----------------------------------------------------------------------
def load_audio(path, sr=22050):
    cmd = ["ffmpeg", "-v", "quiet", "-i", str(path), "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"]
    raw = subprocess.run(cmd, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64), sr


def audio_features(path):
    y, sr = load_audio(path)
    if y.size < sr:  # < 1s decoded -> unusable
        return None
    rms = float(np.sqrt(np.mean(y ** 2)))
    zcr = float(np.mean(np.abs(np.diff(np.sign(y))) > 0))

    f, _, Z = signal.stft(y, fs=sr, nperseg=2048, noverlap=1536)
    S = np.abs(Z)
    Ssum = S.sum(axis=0) + 1e-12
    centroid = float(np.mean((f[:, None] * S).sum(axis=0) / Ssum))
    flux_env = np.sqrt((np.diff(S, axis=1).clip(min=0) ** 2).sum(axis=0))
    flux = float(np.mean(flux_env))
    # onset rate: flux-envelope peaks per second
    if flux_env.size > 3:
        thr = flux_env.mean() + flux_env.std()
        peaks, _ = signal.find_peaks(flux_env, height=thr)
        onset_rate = float(len(peaks) / (y.size / sr))
    else:
        onset_rate = 0.0
    return {"rms": rms, "centroid": centroid, "flux": flux, "zcr": zcr, "onset_rate": onset_rate}


# ----------------------------------------------------------------------
# TRIBE features — RAW, cross-clip comparable (NOT the z-scored emotion axis)
# ----------------------------------------------------------------------
def build_arousal_contrast():
    surf = {}
    for n in TERMS:
        p = SURF_DIR / f"{n}.npy"
        if not p.exists():
            raise SystemExit(
                f"Missing cached surface map {p}. Run `emotion_map.py` once first "
                "so the Neurosynth term maps are cached."
            )
        surf[n] = np.load(p)
    baseline = np.mean([surf[n] for n in TERMS], axis=0)          # neutral baseline
    return np.mean([surf[t] for t in AROUSAL_TERMS], axis=0) - baseline


def tribe_features(tensor_path, arousal_contrast):
    T = np.load(tensor_path).astype(np.float64)
    if T.shape[1] != N_VERTICES:
        return None
    mag = float(np.abs(T).mean())                                # loudness-suspect
    arr = float(np.mean(pattern_correlation(T, arousal_contrast)))  # neuro arousal readout
    return {"tribe_mag": mag, "tribe_arousal": arr}


# ----------------------------------------------------------------------
def partial_corr(x, y, z):
    """Pearson r between x and y after linearly removing z from both."""
    x, y, z = map(np.asarray, (x, y, z))
    zc = np.c_[np.ones_like(z), z]
    rx = x - zc @ np.linalg.lstsq(zc, x, rcond=None)[0]
    ry = y - zc @ np.linalg.lstsq(zc, y, rcond=None)[0]
    return pearsonr(rx, ry)


def cv_r2(X, y, k=5):
    k = min(k, len(y))
    model = make_pipeline(StandardScaler(), Ridge(alpha=1.0))
    scores = cross_val_score(model, X, y, cv=KFold(k, shuffle=True, random_state=0), scoring="r2")
    return float(scores.mean())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--inspect", action="store_true", help="report readiness and exit")
    ap.add_argument("--max-id", type=int, default=2000,
                    help="exclude ids above this (match the 45s-excerpt batch).")
    args = ap.parse_args()

    audio = find_audio_files()
    ann = load_static_annotations().set_index("id")
    tensors = {int(p.stem.split("_")[0]): p for p in TENSOR_DIR.glob("*_brain.npy")}
    ready = sorted(i for i in (set(tensors) & set(ann.index) & set(audio)) if i <= args.max_id)
    print(f"audio={len(audio)}  annotations={len(ann)}  tensors={len(tensors)}  "
          f"usable (all three)={len(ready)}")
    if args.inspect:
        return
    if len(ready) < 8:
        raise SystemExit(f"Only {len(ready)} usable clips — run deam_tribe_batch.py with more --n first.")

    arousal_contrast = build_arousal_contrast()

    rows = []
    for i, sid in enumerate(ready, 1):
        af = audio_features(audio[sid])
        tf = tribe_features(tensors[sid], arousal_contrast)
        if af is None or tf is None:
            continue
        rows.append({"id": sid, "arousal": float(ann.loc[sid, "arousal"]),
                     "valence": float(ann.loc[sid, "valence"]), **af, **tf})
        print(f"[{i}/{len(ready)}] id={sid} extracted", flush=True)
    df = pd.DataFrame(rows)
    OUT.mkdir(exist_ok=True)
    df.to_csv(OUT / "deam_validation_features.csv", index=False)
    n = len(df)
    print(f"\nfeature table: {n} clips -> outputs/deam_validation_features.csv\n")

    y = df["arousal"].values
    print("=" * 60)
    print(f"UNIVARIATE  (Pearson r vs human arousal, n={n})")
    print("=" * 60)
    for feat in AUDIO_FEATURES + TRIBE_FEATURES:
        r, p = pearsonr(df[feat].values, y)
        tag = "  [TRIBE]" if feat in TRIBE_FEATURES else ""
        print(f"  {feat:12s} r={r:+.3f}  p={p:.3f}{tag}")

    # Is TRIBE's magnitude just loudness?
    r_ml, _ = pearsonr(df["tribe_mag"].values, df["rms"].values)
    print(f"\n  tribe_mag vs rms:  r={r_ml:+.3f}   "
          f"({'nearly identical -> loudness meter risk' if abs(r_ml) > 0.9 else 'not a pure loudness proxy'})")

    # Does TRIBE add signal beyond loudness? (partial correlation)
    pr, pp = partial_corr(df["tribe_arousal"].values, y, df["rms"].values)
    print(f"  tribe_arousal vs arousal | controlling rms:  r={pr:+.3f}  p={pp:.3f}")

    # The decider: incremental cross-validated R^2
    print("\n" + "=" * 60)
    print("INCREMENTAL VALIDITY  (5-fold CV R^2)")
    print("=" * 60)
    r2_audio = cv_r2(df[AUDIO_FEATURES].values, y)
    r2_both = cv_r2(df[AUDIO_FEATURES + TRIBE_FEATURES].values, y)
    delta = r2_both - r2_audio
    print(f"  audio baseline        R^2 = {r2_audio:+.3f}")
    print(f"  audio + TRIBE         R^2 = {r2_both:+.3f}")
    print(f"  TRIBE contribution   dR^2 = {delta:+.3f}")

    print("\n" + "=" * 60)
    print("VERDICT")
    print("=" * 60)
    if delta > 0.03 and pp < 0.10:
        print("  TRIBE adds arousal signal beyond the audio baseline. Real core —\n"
              "  worth building the product layer / porting to VIBE.")
    elif abs(r_ml) > 0.9 and delta <= 0.03:
        print("  TRIBE arousal ~ loudness, and adds ~nothing beyond audio features.\n"
              "  On this sample the neuro layer looks like an expensive RMS meter.")
    else:
        print("  Inconclusive on this sample. Re-run with more clips (bigger --n)\n"
              "  before drawing a conclusion.")
    print(f"\n  (n={n}. Small samples are noisy — treat as directional, not final.)")

    make_plot(df, y, r2_audio, r2_both)


def make_plot(df, y, r2_audio, r2_both):
    fig, ax = plt.subplots(1, 3, figsize=(15, 4.5))
    ax[0].scatter(df["rms"], y, s=18, alpha=0.7, color="gray")
    ax[0].set_xlabel("audio RMS (loudness)"); ax[0].set_ylabel("human arousal")
    ax[0].set_title("baseline: loudness vs arousal")

    ax[1].scatter(df["tribe_arousal"], y, s=18, alpha=0.7, color="firebrick")
    ax[1].set_xlabel("TRIBE arousal readout"); ax[1].set_ylabel("human arousal")
    ax[1].set_title("TRIBE vs arousal")

    ax[2].bar(["audio", "audio+TRIBE"], [r2_audio, r2_both],
              color=["gray", "firebrick"])
    ax[2].axhline(0, color="k", lw=0.5)
    ax[2].set_ylabel("cross-validated R²")
    ax[2].set_title("does TRIBE add anything?")
    plt.tight_layout()
    p = OUT / "deam_validation.png"
    plt.savefig(p, dpi=120)
    plt.close()
    print(f"  plot -> {p}")


if __name__ == "__main__":
    main()
