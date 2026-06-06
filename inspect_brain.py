"""Sanity-check the TRIBE brain tensor + produce quick visualizations.

Reads outputs/Vanished_brain.npy and writes PNGs alongside it.
No TRIBE / GPU / re-inference required.
"""
import pickle
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

OUT = Path("outputs")
preds = np.load(OUT / "Vanished_brain.npy")
with open(OUT / "Vanished_segments.pkl", "rb") as f:
    segments = pickle.load(f)

# 1. Sanity stats
print("=" * 50)
print("BRAIN TENSOR SANITY CHECK")
print("=" * 50)
print(f"shape:           {preds.shape}    # (segments, voxels)")
print(f"dtype:           {preds.dtype}")
print(f"NaN count:       {np.isnan(preds).sum()}")
print(f"Inf count:       {np.isinf(preds).sum()}")
print(f"min / max:       {preds.min():.4f} / {preds.max():.4f}")
print(f"mean / std:      {preds.mean():.4f} / {preds.std():.4f}")
n_dead = int((preds == 0).all(axis=0).sum())
print(f"all-zero voxels: {n_dead} / {preds.shape[1]}  ({100*n_dead/preds.shape[1]:.1f}%)")
print(f"segments object: type={type(segments).__name__}, len={len(segments) if hasattr(segments, '__len__') else '?'}")
print()

# 2. Overall activation magnitude over time
overall = np.abs(preds).mean(axis=1)
plt.figure(figsize=(12, 4))
plt.plot(overall)
plt.xlabel("Segment index (~2s each)")
plt.ylabel("Mean |activation| across voxels")
plt.title("Vanished.mp3 — overall predicted brain activation over time")
plt.tight_layout()
plt.savefig(OUT / "Vanished_activation_over_time.png", dpi=120)
plt.close()
print(f"Saved -> {OUT / 'Vanished_activation_over_time.png'}")

# 3. Full heatmap (downsample voxels for legibility)
stride = max(1, preds.shape[1] // 1000)
plt.figure(figsize=(14, 6))
vmax = float(np.percentile(np.abs(preds), 99))
plt.imshow(
    preds[:, ::stride].T,
    aspect="auto",
    cmap="RdBu_r",
    interpolation="nearest",
    vmin=-vmax,
    vmax=vmax,
)
plt.xlabel("Segment index")
plt.ylabel(f"Voxel (every {stride}th)")
plt.title("Vanished.mp3 — brain tensor heatmap")
plt.colorbar(label="Predicted activation")
plt.tight_layout()
plt.savefig(OUT / "Vanished_heatmap.png", dpi=120)
plt.close()
print(f"Saved -> {OUT / 'Vanished_heatmap.png'}")

# 4. Peak activation frame
peak_segment = int(overall.argmax())
plt.figure(figsize=(14, 4))
plt.plot(preds[peak_segment], linewidth=0.5)
plt.xlabel("Voxel index (0–20,483, ordered by fsaverage mesh)")
plt.ylabel("Predicted activation")
plt.title(f"Peak frame (segment {peak_segment}) — activation across all 20,484 voxels")
plt.tight_layout()
plt.savefig(OUT / "Vanished_peak_frame.png", dpi=120)
plt.close()
print(f"Saved -> {OUT / 'Vanished_peak_frame.png'}")

print()
print(f"Peak activation at segment {peak_segment} of {preds.shape[0]}")
print(f"   (roughly {peak_segment * 2}s into the audio if segments are ~2s)")
