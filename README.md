# Vookley

Pre-flight emotional analysis for short-form audio — predicts neural response
with Meta's [TRIBE v2](https://github.com/facebookresearch/tribev2), then maps it
to arousal/valence over time via [Neurosynth](https://neurosynth.org/) reverse
inference.

> **Status:** research prototype. The pipeline runs end-to-end and its internals
> are validated (see *Validation* below), but the core product hypothesis — that
> these signals predict short-form video performance — is **not yet tested**.
> Audio-only MVP; text/video modalities are deliberately disabled.

## Pipeline

Two stages, run in two isolated virtualenvs (their dependencies conflict).

**Stage 1 — brain map** (`run_brain.py`, `venv`): audio → TRIBE v2 → predicted
fMRI activation tensor on the fsaverage5 surface (`[n_segments, 20484]`, 1 Hz).

```bash
caffeinate -i venv/bin/python run_brain.py path/to/song.mp3
# -> outputs/<song>_brain.npy  +  outputs/<song>_segments.pkl
```

**Stage 2 — emotion map** (`emotion_map.py`, `venv_neuro`): brain tensor →
Neurosynth `MKDAChi2` reverse-inference z-maps per term → projected to fsaverage5
with nilearn `vol_to_surf` → contrast maps → per-segment pattern correlation →
arousal & valence axes.

```bash
venv_neuro/bin/python emotion_map.py <song>
# -> outputs/<song>_emotion.{csv,npz}  +  outputs/<song>_emotion_axes.png
```

`inspect_brain.py` renders quick sanity plots (activation over time, heatmap,
peak frame) directly from a `_brain.npy`.

## Setup

```bash
# Stage 1 (TRIBE). Install the CUDA torch wheel on an NVIDIA box:
python -m venv venv && venv/bin/pip install -r requirements.txt

# Stage 2 (Neurosynth / nilearn), isolated:
python -m venv venv_neuro && venv_neuro/bin/pip install -r requirements_neuro.txt
```

First Stage-1 run downloads the TRIBE + Wav2Vec2 weights (~2 GB). First Stage-2
run downloads the Neurosynth v7 database (cached under `neuro_cache/`). GPU is
strongly recommended — CPU inference is hours per song.

## Validation

`emotion_map.py` gates its output on two checks:

- **Control:** the `auditory` term must rank highest — for audio-only input it
  should, and it does on all tracks tested. This confirms the fsaverage5 ↔ MNI152
  space alignment is correct (otherwise every number would be meaningless).
- **Contrast:** the most-active segment must score higher arousal than the
  least-active one.

## What to trust

Trust the **arousal** track and the temporal *shape* of each term. Treat
**valence** as a documented reward-vs-aversion proxy (no clean Neurosynth valence
term), and discrete emotions as blended affective texture, not hard labels —
audio-only cannot separate them cleanly.
