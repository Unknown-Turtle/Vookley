import pickle
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from tribev2 import TribeModel
from tribev2.demo_utils import get_audio_and_text_events


def main():
    # 1. Setup Hardware (auto-detect CUDA, fall back to CPU)
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"Hardware routing active: {device}")

    # 2. Load the Meta TRIBE v2 model
    # Note: audio_feature.device must match top-level device, otherwise
    # neuralset's HuggingFaceMixin tries CUDA on CPU-only builds and crashes.
    print("Loading model weights...")
    model = TribeModel.from_pretrained(
        "facebook/tribev2",
        device=device,
        cache_folder="./cache",
        config_update={
            "data.audio_feature.device": device,
        },
    )

    audio_file = "Vanished.mp3"
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
