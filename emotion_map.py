"""
Neurosynth emotion-mapping stage for the Vookley / TRIBE pipeline.
=================================================================

Takes the TRIBE-predicted fMRI activation tensor (fsaverage5 surface,
[n_segments, 20484]) and maps each time segment to a soft emotion profile
via Neurosynth REVERSE INFERENCE, then reduces to two dimensional axes:
arousal and valence.

Run inside the isolated `venv_neuro` environment:

    venv_neuro/bin/python emotion_map.py

-----------------------------------------------------------------------
NEUROSCIENCE FRAMING (read before trusting any number)
-----------------------------------------------------------------------
* This is REVERSE INFERENCE: we observe an activation pattern and infer the
  probable mental state. It is inherently probabilistic and lossy. We never
  do single-region lookups ("amygdala high => fear"); instead we compare the
  WHOLE predicted activation pattern against the WHOLE Neurosynth term map
  (a distributed spatial-correlation match), and we emit a SOFT VECTOR of
  scores across terms, never a forced argmax label.

* The input is AUDIO-ONLY (TRIBE text + video modalities are disabled).
  Consequences we bake into the interpretation:
    - Results reflect ACOUSTIC content far more than semantic/lyrical content.
    - Dimensional AROUSAL is more reliable than fine discrete-emotion labels.
    - Auditory cortex will dominate, so we work with CONTRASTS (term map minus
      a neutral baseline) rather than raw maps, otherwise generic auditory
      signal makes everything read as "emotional".

* COORDINATE SPACE — the crux. TRIBE output lives on the fsaverage5 SURFACE
  (20,484 vertices). Neurosynth maps are MNI152 VOLUMETRIC. They cannot be
  correlated until they share a space, so we project every Neurosynth volume
  onto fsaverage5 with nilearn.surface.vol_to_surf and correlate on the
  surface (the same strategy the TRIBE paper used for its Neurosynth check).
"""

import argparse
import gzip
import pickle
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # headless
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

# ----------------------------------------------------------------------
# CONFIG  (edit this block freely)
# ----------------------------------------------------------------------

# Each entry maps a friendly name -> the Neurosynth term to search for.
# "auditory" is a CONTROL: for audio-only input it SHOULD score high. If it
# does not, the surface/volume alignment is broken and results are garbage.
# friendly name -> actual Neurosynth vocabulary term (v7 abstract TF-IDF).
# Some intuitive words aren't Neurosynth terms: 'pleasure'->'pleasant',
# 'sadness'->'sad' (verified against the downloaded vocabulary).
TERMS = {
    "emotion": "emotion",
    "fear": "fear",
    "anxiety": "anxiety",
    "reward": "reward",
    "pleasure": "pleasant",
    "pain": "pain",
    "disgust": "disgust",
    "arousal": "arousal",
    "sadness": "sad",
    "auditory": "auditory",  # control term
}
CONTROL_TERM = "auditory"

# Dimensional reductions ------------------------------------------------
# AROUSAL: high-arousal affective terms. Combined (below) with the overall
# activation magnitude, which is itself an arousal proxy (more predicted
# neural activity ~ higher arousal).
AROUSAL_TERMS = ["arousal", "fear", "anxiety"]

# VALENCE: Neurosynth has NO clean single valence term, so we PROXY it.
#   positive valence ~ reward / pleasure   (approach / appetitive systems)
#   negative valence ~ fear / pain / disgust / sadness  (aversive systems)
# This is a documented proxy, not a direct valence measurement. Treat the
# sign as a weak hint, not a calibrated quantity.
VALENCE_POS_TERMS = ["reward", "pleasure"]
VALENCE_NEG_TERMS = ["fear", "pain", "disgust", "sadness"]

# The contrast-check segments are chosen from the data at runtime (most- vs
# least-active), so the pipeline works for any track length.

# Paths -----------------------------------------------------------------
OUT = Path("outputs")
CACHE = Path("neuro_cache")
NS_DIR = CACHE / "neurosynth"            # raw Neurosynth download
DSET_PKL = CACHE / "neurosynth_dataset.pkl.gz"
TERMMAP_DIR = CACHE / "term_maps"        # volumetric z-maps (nii.gz) per term
SURF_DIR = CACHE / "surf_maps"           # fsaverage5-projected maps (.npy) per term
for d in (CACHE, TERMMAP_DIR, SURF_DIR):
    d.mkdir(parents=True, exist_ok=True)

# TRACK + paths are set from the CLI arg in main(); these are the defaults.
TRACK = "Vanished"
TENSOR_NPY = OUT / f"{TRACK}_brain.npy"
SEGMENTS_PKL = OUT / f"{TRACK}_segments.pkl"

N_VERTICES = 20484  # fsaverage5: 10242 per hemisphere x 2


def set_track(track):
    """Resolve the track name and point the I/O paths at it.

    Forgiving about what you pass: 'Song', 'Song.mp3', or
    'outputs/Song_brain.npy' all resolve to track 'Song'.
    """
    global TRACK, TENSOR_NPY, SEGMENTS_PKL
    name = Path(track).name
    for suf in ("_brain.npy", "_segments.pkl", ".npy", ".mp3", ".wav", ".m4a", ".flac"):
        if name.endswith(suf):
            name = name[: -len(suf)]
    name = name.removesuffix("_brain").removesuffix("_segments")
    TRACK = name
    TENSOR_NPY = OUT / f"{TRACK}_brain.npy"
    SEGMENTS_PKL = OUT / f"{TRACK}_segments.pkl"


# ----------------------------------------------------------------------
# STEP 0 — load and CONFIRM the TRIBE tensor (never assume its shape)
# ----------------------------------------------------------------------
def load_tensor():
    preds = np.load(TENSOR_NPY).astype(np.float64)
    print("=" * 60)
    print("STEP 0  TRIBE TENSOR")
    print("=" * 60)
    print(f"  shape            {preds.shape}   # (segments, vertices)")
    print(f"  dtype            {preds.dtype}")
    print(f"  value range      [{preds.min():.4f}, {preds.max():.4f}]")
    print(f"  mean / std       {preds.mean():.4f} / {preds.std():.4f}")
    print(f"  NaN / Inf        {int(np.isnan(preds).sum())} / {int(np.isinf(preds).sum())}")

    if preds.shape[1] != N_VERTICES:
        raise SystemExit(
            f"ABORT: expected {N_VERTICES} vertices (fsaverage5), got {preds.shape[1]}. "
            "Surface projection below assumes fsaverage5 lh+rh concatenation."
        )

    # Time mapping. The segments pickle holds neuralset.Segment objects, which
    # can't be unpickled here (TRIBE deps live in the other venv). We already
    # CONFIRMED the mapping in the TRIBE venv: Segment(start=i, duration=1.0),
    # i.e. 1 Hz, segment i -> t = i seconds. Try the pickle anyway; fall back
    # to that confirmed mapping if neuralset is unavailable.
    n_seg = preds.shape[0]
    times = None
    try:
        with open(SEGMENTS_PKL, "rb") as f:
            segments = pickle.load(f)
        times = np.array([float(s.start) for s in segments])
        src = "segments pickle"
    except (ModuleNotFoundError, FileNotFoundError, Exception):
        times = np.arange(n_seg, dtype=np.float64)  # 1 Hz, confirmed in TRIBE venv
        src = "derived (1 Hz, confirmed mapping)"
    print(f"  time mapping     segment i -> t = {times[0]:.0f}..{times[-1]:.0f}s "
          f"(1 Hz)  [{src}]")
    print()
    return preds, times


# ----------------------------------------------------------------------
# STEP 1 — Neurosynth database (cached download + cached Dataset)
# ----------------------------------------------------------------------
# nimare's downloader streams straight to the final path and skips any file
# that already exists — so a connection drop mid-stream leaves a TRUNCATED
# file that is never re-fetched (the bug that bit us). We pre-fetch the few
# files we need ourselves with integrity checks + atomic writes, then let
# nimare build the Dataset from the verified files.
NS_BASE_URL = (
    "https://github.com/neurosynth/neurosynth-data/blob/"
    "209c33cd009d0b069398a802198b41b9c488b9b7/"
)
# Only term-level TF-IDF annotations — not the huge LDA topic files.
NS_REQUIRED_FILES = [
    "data-neurosynth_version-7_coordinates.tsv.gz",
    "data-neurosynth_version-7_metadata.tsv.gz",
    "data-neurosynth_version-7_vocab-terms_source-abstract_type-tfidf_features.npz",
    "data-neurosynth_version-7_vocab-terms_vocabulary.txt",
]


def _file_is_valid(path):
    """Integrity check appropriate to the file type."""
    import gzip as _gz
    import zipfile

    try:
        if path.suffix == ".gz":
            with _gz.open(path, "rb") as fh:
                fh.read(2048)
            return True
        if path.suffix == ".npz":
            return zipfile.is_zipfile(path)
        return path.stat().st_size > 0  # plain .txt
    except Exception:
        return False


def _robust_download(url, dest, attempts=6):
    """Download to a temp file, verify, then atomically move into place."""
    import os
    import shutil
    import urllib.request

    tmp = dest.with_name(dest.name + ".tmp")
    for a in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(url, timeout=120) as r, open(tmp, "wb") as f:
                shutil.copyfileobj(r, f)
            os.replace(tmp, dest)
            if _file_is_valid(dest):
                return True
            print(f"      attempt {a}: downloaded but failed integrity check; retrying")
        except Exception as e:
            print(f"      attempt {a} failed ({type(e).__name__}); retrying")
    if tmp.exists():
        tmp.unlink()
    return False


def _ensure_neurosynth_files(target_dir):
    """Make sure all required Neurosynth files exist and are intact."""
    target_dir.mkdir(parents=True, exist_ok=True)
    for fn in NS_REQUIRED_FILES:
        dest = target_dir / fn
        if dest.exists() and _file_is_valid(dest):
            continue
        if dest.exists():
            print(f"   repairing corrupt/truncated {fn}")
            dest.unlink()
        else:
            print(f"   fetching {fn}")
        url = NS_BASE_URL + fn + "?raw=true"
        if not _robust_download(url, dest):
            raise SystemExit(
                f"ABORT: could not fetch a valid {fn} (network/SSL). "
                "Re-run to resume — verified files are kept."
            )


def get_neurosynth_dataset():
    from nimare.extract import fetch_neurosynth

    if DSET_PKL.exists():
        print(f"STEP 1  Neurosynth dataset  (cached -> {DSET_PKL})")
        with gzip.open(DSET_PKL, "rb") as f:
            return pickle.load(f)

    print("STEP 1  Neurosynth dataset  (verifying files + building, one-time)")
    NS_DIR.mkdir(parents=True, exist_ok=True)
    # nimare creates a 'neurosynth' subfolder under data_dir; pre-stage files there.
    _ensure_neurosynth_files(NS_DIR / "neurosynth")

    # Files are now verified on disk; fetch_neurosynth skips downloading and
    # just materialises the Dataset. Restricted to term TF-IDF annotations.
    dset = fetch_neurosynth(
        data_dir=str(NS_DIR),
        version="7",
        overwrite=False,
        return_type="dataset",
        target="mni152_2mm",
        source="abstract",
        vocab="terms",
        type="tfidf",
    )

    if isinstance(dset, list):  # return_type='dataset' yields a 1-element list
        dset = dset[0]
    print(f"   studies: {len(dset.ids)}   labels: {len(dset.get_labels())}")
    with gzip.open(DSET_PKL, "wb") as f:
        pickle.dump(dset, f)
    return dset


def resolve_label(dset, term):
    """Find the Neurosynth label whose term suffix matches `term`.

    Returns None (with a warning) if no label matches, so one unknown term
    doesn't abort the whole run.
    """
    labels = dset.get_labels()
    exact = [l for l in labels if l.split("__")[-1] == term]
    if exact:
        return exact[0]
    contains = [l for l in labels if term in l.split("__")[-1]]
    if contains:
        return contains[0]
    print(f"   WARNING: no Neurosynth label for term '{term}' — skipping it.")
    return None


# ----------------------------------------------------------------------
# STEP 2 — reverse-inference z-map per term (cached as nii.gz)
# ----------------------------------------------------------------------
def reverse_inference_map(dset, term):
    """Neurosynth reverse inference (association test) z-map for one term."""
    import nibabel as nib
    from nimare.meta.cbma import MKDAChi2

    out_nii = TERMMAP_DIR / f"{term}.nii.gz"
    if out_nii.exists():
        print(f"   [{term:9s}] z-map cached")
        return nib.load(str(out_nii))

    label = resolve_label(dset, term)
    if label is None:
        return None
    with_ids = dset.get_studies_by_label(labels=[label], label_threshold=0.001)
    without_ids = sorted(set(dset.ids) - set(with_ids))
    print(f"   [{term:9s}] label={label!r}  studies_with={len(with_ids)}  "
          f"without={len(without_ids)}  (fitting MKDAChi2...)")

    dset_with = dset.slice(with_ids)
    dset_without = dset.slice(without_ids)

    meta = MKDAChi2()
    result = meta.fit(dset_with, dset_without)

    # The reverse-inference / specificity map is what we want (P(term|activation)).
    # Its key name shifts across nimare versions, so pick it programmatically.
    keys = list(result.maps.keys())
    pref = [k for k in keys if "z" in k.lower()
            and ("associat" in k.lower() or "specific" in k.lower())]
    if not pref:  # last resort: any z map
        pref = [k for k in keys if k.lower().startswith("z")]
    if not pref:
        raise SystemExit(f"ABORT: no association z-map in MKDAChi2 output: {keys}")
    map_name = pref[0]
    print(f"   [{term:9s}] using map {map_name!r}  (from {keys})")

    img = result.get_map(map_name, return_type="image")
    nib.save(img, str(out_nii))
    return img


# ----------------------------------------------------------------------
# STEP 3 — project a volumetric map onto fsaverage5 (cached as .npy)
# ----------------------------------------------------------------------
_FS = {"loaded": False}


def _fsaverage():
    if not _FS["loaded"]:
        from nilearn import datasets
        fs = datasets.fetch_surf_fsaverage("fsaverage5")
        _FS.update(loaded=True, data=fs)
    return _FS["data"]


def project_to_surface(term, img):
    """vol_to_surf onto fsaverage5, lh then rh, concatenated to 20484."""
    from nilearn import surface

    out_npy = SURF_DIR / f"{term}.npy"
    if out_npy.exists():
        return np.load(out_npy)

    fs = _fsaverage()
    # Ribbon sampling between white (inner) and pial (outer) surfaces.
    lh = surface.vol_to_surf(img, fs["pial_left"], inner_mesh=fs["white_left"])
    rh = surface.vol_to_surf(img, fs["pial_right"], inner_mesh=fs["white_right"])
    surf = np.concatenate([np.asarray(lh).ravel(), np.asarray(rh).ravel()])

    if surf.shape[0] != N_VERTICES:
        raise SystemExit(
            f"ABORT: projected '{term}' has {surf.shape[0]} vertices, expected {N_VERTICES}."
        )
    # Sanity: a real projected map is spatially structured, not uniform.
    frac_nonzero = np.mean(np.abs(surf) > 1e-9)
    print(f"   [{term:9s}] projected -> {surf.shape[0]} verts  "
          f"std={np.nanstd(surf):.3f}  nonzero={frac_nonzero:.0%}")
    np.save(out_npy, surf)
    return surf


# ----------------------------------------------------------------------
# helpers for correlation on the surface
# ----------------------------------------------------------------------
def zscore_rows(mat):
    """Z-score each row across vertices (axis=1). Rows of all-equal -> 0."""
    mat = np.asarray(mat, dtype=np.float64)
    mu = mat.mean(axis=1, keepdims=True)
    sd = mat.std(axis=1, keepdims=True)
    sd[sd == 0] = 1.0
    return (mat - mu) / sd


def pattern_correlation(segments_mat, contrast_vec):
    """Pearson r between every segment row and one contrast map (vectorised)."""
    zs = zscore_rows(segments_mat)                      # (n_seg, V)
    zc = zscore_rows(contrast_vec[None, :])[0]          # (V,)
    return (zs @ zc) / zs.shape[1]                      # (n_seg,)


# ----------------------------------------------------------------------
# MAIN
# ----------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Map a TRIBE brain tensor to emotion axes via Neurosynth."
    )
    parser.add_argument(
        "track",
        nargs="?",
        default="Vanished",
        help="Track name (default: Vanished). Reads outputs/<track>_brain.npy, "
             "writes outputs/<track>_emotion.{csv,npz,_axes.png}.",
    )
    args = parser.parse_args()
    set_track(args.track)
    if not TENSOR_NPY.exists():
        raise SystemExit(
            f"Tensor not found: {TENSOR_NPY}\n"
            f"Run `python run_brain.py <{TRACK}.mp3>` first (in the TRIBE venv)."
        )
    print(f"TRACK: {TRACK}  ->  {TENSOR_NPY}\n")

    preds, times = load_tensor()
    n_seg = preds.shape[0]

    dset = get_neurosynth_dataset()
    print()

    # Steps 2-3: build a surface map per term -----------------------------
    print("STEP 2-3  reverse-inference z-maps -> fsaverage5 surface")
    surf_maps = {}
    for name, term in TERMS.items():
        img = reverse_inference_map(dset, term)
        if img is None:       # term not in Neurosynth vocab -> skip gracefully
            continue
        surf_maps[name] = project_to_surface(name, img)
    active_terms = [n for n in TERMS if n in surf_maps]  # preserve config order
    print(f"   built {len(active_terms)}/{len(TERMS)} term maps: {active_terms}")
    print()

    # Step 4: CONTRAST maps (subtract neutral baseline = mean across terms)-
    # Removes the generic auditory/visual/language signal common to all term
    # maps, so correlations reflect what is SPECIFIC to each emotion term.
    print("STEP 4  contrasts (term map - mean across all term maps)")
    stack = np.vstack([surf_maps[n] for n in active_terms])   # (n_terms, V)
    baseline = stack.mean(axis=0)                             # neutral baseline
    contrasts = {n: surf_maps[n] - baseline for n in active_terms}
    print(f"   baseline std={baseline.std():.3f}; built {len(contrasts)} contrast maps")
    print()

    # Step 5: per-segment soft score vector across terms ------------------
    print("STEP 5  spatial correlation: each segment vs each term contrast")
    scores = {n: pattern_correlation(preds, contrasts[n]) for n in active_terms}
    magnitude = np.abs(preds).mean(axis=1)               # arousal proxy (model-internal)
    print(f"   computed {len(scores)} term score tracks over {n_seg} segments")
    print()

    # Step 6: dimensional reduction --------------------------------------
    def zt(x):  # z-score a per-segment track
        x = np.asarray(x, dtype=np.float64)
        s = x.std()
        return (x - x.mean()) / (s if s else 1.0)

    # Only aggregate over terms that actually built (robust to skips).
    arousal_terms = [t for t in AROUSAL_TERMS if t in scores]
    pos_terms = [t for t in VALENCE_POS_TERMS if t in scores]
    neg_terms = [t for t in VALENCE_NEG_TERMS if t in scores]
    arousal_term_score = np.mean([scores[t] for t in arousal_terms], axis=0)
    # Combine the affective-term arousal with raw activation magnitude.
    arousal = 0.5 * zt(magnitude) + 0.5 * zt(arousal_term_score)

    pos = np.mean([scores[t] for t in pos_terms], axis=0)
    neg = np.mean([scores[t] for t in neg_terms], axis=0)
    valence = zt(pos) - zt(neg)   # proxy: reward/pleasure minus aversive

    # ---------------- assemble per-segment table ------------------------
    table = pd.DataFrame({"segment": np.arange(n_seg), "time_s": times})
    for n in active_terms:
        table[f"corr_{n}"] = scores[n]
    table["magnitude"] = magnitude
    table["arousal"] = arousal
    table["valence"] = valence

    OUT.mkdir(exist_ok=True)
    csv_path = OUT / f"{TRACK}_emotion.csv"
    npz_path = OUT / f"{TRACK}_emotion.npz"
    table.to_csv(csv_path, index=False)
    np.savez(
        npz_path,
        times=times,
        terms=np.array(active_terms),
        scores=np.vstack([scores[n] for n in active_terms]),
        magnitude=magnitude,
        arousal=arousal,
        valence=valence,
    )
    print(f"STEP 6  saved -> {csv_path}")
    print(f"        saved -> {npz_path}")
    print()

    # ---------------- VALIDATION (gate before trusting output) ----------
    print("=" * 60)
    print("VALIDATION")
    print("=" * 60)
    mean_corr = {n: float(np.mean(scores[n])) for n in active_terms}
    ranked = sorted(mean_corr.items(), key=lambda kv: kv[1], reverse=True)
    print("  mean correlation by term (high -> low):")
    for n, v in ranked:
        flag = "  <- CONTROL" if n == CONTROL_TERM else ""
        print(f"     {n:9s} {v:+.4f}{flag}")

    # Control check: auditory must score high (alignment sanity).
    aud = mean_corr[CONTROL_TERM]
    aud_rank = [n for n, _ in ranked].index(CONTROL_TERM)
    aud_pos_frac = float(np.mean(scores[CONTROL_TERM] > 0))
    median_corr = float(np.median(list(mean_corr.values())))
    control_ok = (aud > median_corr) and (aud_pos_frac > 0.5) and (aud_rank <= 2)
    print(f"\n  CONTROL '{CONTROL_TERM}': mean={aud:+.4f}, rank={aud_rank+1}/{len(active_terms)}, "
          f"positive in {aud_pos_frac:.0%} of segments  -> "
          f"{'PASS' if control_ok else 'FAIL'}")
    if not control_ok:
        raise SystemExit(
            "\nABORT: auditory control did not score high. The fsaverage5 <-> MNI152 "
            "alignment is almost certainly broken (hemisphere order, space mismatch, "
            "or projection error). NOT producing trustworthy results until fixed."
        )

    # Contrast check: the most-active segment should out-arouse the least-active
    # one. Pick both from the data so this holds for any track length.
    hi_seg = int(np.argmax(magnitude))
    lo_seg = int(np.argmin(magnitude))
    a_hi, a_lo = float(arousal[hi_seg]), float(arousal[lo_seg])
    contrast_ok = a_hi > a_lo
    print(f"\n  CONTRAST most-active seg {hi_seg} ({hi_seg}s) vs "
          f"least-active seg {lo_seg} ({lo_seg}s):")
    print(f"     arousal[{hi_seg}]={a_hi:+.3f}   arousal[{lo_seg}]={a_lo:+.3f}   "
          f"-> {'PASS' if contrast_ok else 'FAIL (noisy/unexpected)'}")

    # ---------------- plots (match inspect_brain style) -----------------
    plot_axes(times, arousal, valence, magnitude)
    print("\nDONE.")
    print_trust_guidance(ranked, mean_corr)


def plot_axes(times, arousal, valence, magnitude):
    fig, ax = plt.subplots(2, 1, figsize=(12, 7), sharex=True)
    ax[0].plot(times, arousal, color="firebrick", label="arousal")
    ax[0].plot(times, zscore_for_plot(magnitude), color="gray", alpha=0.6,
               label="activation magnitude (z)")
    ax[0].axhline(0, color="k", lw=0.5)
    ax[0].set_ylabel("arousal (z)")
    ax[0].set_title(f"{TRACK}.mp3 — predicted arousal over time (audio-only)")
    ax[0].legend(loc="upper right", fontsize=8)

    ax[1].plot(times, valence, color="seagreen")
    ax[1].axhline(0, color="k", lw=0.5)
    ax[1].fill_between(times, valence, 0, where=valence >= 0,
                       color="seagreen", alpha=0.2)
    ax[1].fill_between(times, valence, 0, where=valence < 0,
                       color="indianred", alpha=0.2)
    ax[1].set_ylabel("valence (proxy)")
    ax[1].set_xlabel("time (s)")
    ax[1].set_title("predicted valence (reward/pleasure  -  fear/pain/disgust/sadness)")
    plt.tight_layout()
    p = OUT / f"{TRACK}_emotion_axes.png"
    plt.savefig(p, dpi=120)
    plt.close()
    print(f"\n  saved plot -> {p}")


def zscore_for_plot(x):
    x = np.asarray(x, dtype=np.float64)
    s = x.std()
    return (x - x.mean()) / (s if s else 1.0)


def print_trust_guidance(ranked, mean_corr):
    print("=" * 60)
    print("WHAT TO TRUST  (audio-only caveats)")
    print("=" * 60)
    print(
        "  TRUST MORE:\n"
        "   * AROUSAL track + activation magnitude — robust, driven by acoustic\n"
        "     intensity, exactly what audio-only TRIBE represents best.\n"
        "   * The 'auditory' control and relative SHAPE of each term track over\n"
        "     time (rises/falls), more than absolute values.\n\n"
        "  TRUST LESS:\n"
        "   * VALENCE — a reward-vs-aversion PROXY, no true Neurosynth valence\n"
        "     term. Read its sign as a weak hint, not a measurement.\n"
        "   * Fine discrete emotions (disgust vs fear vs sadness) — semantically\n"
        "     close, audio-only can't separate them cleanly; correlations are low\n"
        "     and noisy. Use them as a blended affective texture, not labels.\n"
        "   * Any single segment in isolation — trust trends across several\n"
        "     seconds over momentary spikes."
    )


if __name__ == "__main__":
    main()
