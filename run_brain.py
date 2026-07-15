import argparse
import pathlib
import pickle
import platform
from pathlib import Path

# Windows compat shim: Meta's config.yaml was saved on Linux and pickles
# PosixPath instances inside. Python on Windows refuses to instantiate
# PosixPath, so alias it to WindowsPath before TRIBE loads the YAML.
if platform.system() == "Windows":
    pathlib.PosixPath = pathlib.WindowsPath

import numpy as np
import pandas as pd
import torch
from huggingface_hub import snapshot_download
from tribev2 import TribeModel
from tribev2.demo_utils import get_audio_and_text_events


def main():
    parser = argparse.ArgumentParser(description="Run TRIBE v2 on an audio file.")
    parser.add_argument(
        "audio_file",
        nargs="?",
        default="Vanished.mp3",
        help="Path to the audio file (default: Vanished.mp3). "
             "Output is saved to outputs/<stem>_brain.npy.",
    )
    args = parser.parse_args()
    audio_file = args.audio_file
    if not Path(audio_file).exists():
        raise SystemExit(f"Audio file not found: {audio_file}")

    # 1. Setup Hardware (auto-detect CUDA, fall back to CPU)
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"Hardware routing active: {device}")

    # 2. Load the Meta TRIBE v2 model
    # Note 1: audio_feature.device must match top-level device, otherwise
    # neuralset's HuggingFaceMixin tries CUDA on CPU-only builds and crashes.
    # Note 2: pre-download via snapshot_download to avoid a Windows bug in
    # tribev2's from_pretrained, which does Path("facebook/tribev2") and
    # then str() — producing "facebook\tribev2" on Windows, which fails
    # HuggingFace's repo-id validator.
    print("Resolving model snapshot...")
    model_dir = snapshot_download("facebook/tribev2")
    print(f"Model snapshot at: {model_dir}")

    print("Loading model weights...")
    model = TribeModel.from_pretrained(
        model_dir,
        device=device,
        cache_folder="./cache",
        config_update={
            "data.audio_feature.device": device,
        },
    )

    print(f"Analysing {audio_file}...")

    event = {
        "type": "Audio",
        "filepath": audio_file,
        "start": 0,
        "timeline": "default",
        "subject": "default",
    }

    # 3. Process the DataFrame
    df = get_audio_and_text_events(pd.DataFrame([event]), audio_only=True)

    # 4. Generate the Brain Map
    print("Running neural simulation...")
    preds, segments = model.predict(events=df)

    print(f"Simulation complete! Generated brain tensor of shape: {preds.shape}")

    # 5. Persist outputs so we never have to re-run this 8-hour job
    out_dir = Path("outputs")
    out_dir.mkdir(exist_ok=True)
    stem = Path(audio_file).stem
    preds_arr = preds.detach().cpu().numpy() if torch.is_tensor(preds) else np.asarray(preds)
    np.save(out_dir / f"{stem}_brain.npy", preds_arr)
    with open(out_dir / f"{stem}_segments.pkl", "wb") as f:
        pickle.dump(segments, f)
    print(f"Saved -> {out_dir / f'{stem}_brain.npy'} ({preds_arr.nbytes / 1e6:.1f} MB)")
    print(f"Saved -> {out_dir / f'{stem}_segments.pkl'}")


if __name__ == "__main__":
    main()
