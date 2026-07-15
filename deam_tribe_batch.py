"""
DEAM validation — STAGE 1 (slow, CPU): run TRIBE over a sample of DEAM clips.

Loads the TRIBE model ONCE, then loops clips (run_brain.py reloads per call;
this doesn't). Resumable: skips clips whose tensor already exists. Designed to
be left running under `caffeinate -i`.

    caffeinate -i venv/bin/python deam_tribe_batch.py --n 30

Writes one tensor per clip to  data/DEAM/tribe_out/<id>_brain.npy
and a manifest CSV of what was processed.
"""
import argparse
import platform
from pathlib import Path

import numpy as np

# Windows PosixPath shim (harmless on macOS) — see run_brain.py.
import pathlib
if platform.system() == "Windows":
    pathlib.PosixPath = pathlib.WindowsPath

import pandas as pd
import torch
from huggingface_hub import snapshot_download
from tribev2 import TribeModel
from tribev2.demo_utils import get_audio_and_text_events

from deam_common import find_audio_files

OUT_DIR = Path("data/DEAM/tribe_out")


def pick_sample(ids, n):
    """Evenly spaced across the sorted id range — deterministic, representative."""
    ids = sorted(ids)
    if n >= len(ids):
        return ids
    idx = np.linspace(0, len(ids) - 1, n).round().astype(int)
    return [ids[i] for i in sorted(set(idx))]


def main():
    ap = argparse.ArgumentParser(description="Run TRIBE over a DEAM sample (audio-only).")
    ap.add_argument("--n", type=int, default=30, help="number of clips (default 30)")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    audio = find_audio_files()
    if not audio:
        raise SystemExit("No DEAM audio found under data/DEAM/. Unzip the dataset there first.")
    sample_ids = pick_sample(list(audio), args.n)
    todo = [i for i in sample_ids if not (OUT_DIR / f"{i}_brain.npy").exists()]
    print(f"DEAM audio: {len(audio)} clips | sample: {len(sample_ids)} | "
          f"already done: {len(sample_ids) - len(todo)} | to run: {len(todo)}")
    if not todo:
        print("Nothing to do — all sampled tensors already exist.")
        return

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Hardware: {device}. Loading TRIBE once...")
    model_dir = snapshot_download("facebook/tribev2")
    model = TribeModel.from_pretrained(
        model_dir, device=device, cache_folder="./cache",
        config_update={"data.audio_feature.device": device},
    )

    rows = []
    for k, sid in enumerate(todo, 1):
        path = audio[sid]
        print(f"[{k}/{len(todo)}] id={sid}  {path.name}", flush=True)
        try:
            event = {"type": "Audio", "filepath": str(path), "start": 0,
                     "timeline": "default", "subject": "default"}
            df = get_audio_and_text_events(pd.DataFrame([event]), audio_only=True)
            preds, _ = model.predict(events=df)
            arr = preds.detach().cpu().numpy() if torch.is_tensor(preds) else np.asarray(preds)
            np.save(OUT_DIR / f"{sid}_brain.npy", arr)
            rows.append({"id": sid, "n_segments": arr.shape[0], "status": "ok"})
            print(f"      saved {arr.shape}", flush=True)
        except Exception as e:  # one bad clip shouldn't kill an overnight batch
            rows.append({"id": sid, "n_segments": 0, "status": f"error: {type(e).__name__}"})
            print(f"      FAILED: {e}", flush=True)

    man = OUT_DIR / "manifest.csv"
    df_new = pd.DataFrame(rows)
    if man.exists():
        df_new = pd.concat([pd.read_csv(man), df_new], ignore_index=True).drop_duplicates("id", keep="last")
    df_new.to_csv(man, index=False)
    ok = (df_new["status"] == "ok").sum()
    print(f"\nDone. {ok} tensors ready in {OUT_DIR}. Manifest -> {man}")
    print("Next:  venv_neuro/bin/python deam_validate.py")


if __name__ == "__main__":
    main()
