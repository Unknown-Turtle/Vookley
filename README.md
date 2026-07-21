# Vookley

Predicting the emotional response to audio *before* you publish it, built on
Meta's [TRIBE](https://github.com/facebookresearch/tribev2) fMRI-encoding model
and [Neurosynth](https://neurosynth.org/) meta-analysis.

## The honest headline

The bet: if you could predict how a piece of content makes people feel before you
release it, you could tailor adverts, music, and creative work to land the way you
intend, instead of guessing. So I built the full pipeline, then ran the experiment
that could kill the idea.

On audio-only input, it does **not** beat a simple audio-feature baseline. That
negative result, and understanding exactly why, is the part I am proudest of.

![DEAM validation](results/deam_validation.png)

*176 human-rated songs (DEAM dataset). A cheap audio baseline explains ~36% of the
variance in human arousal (cross-validated). Adding TRIBE's neural features adds
nothing (R² 0.361 vs 0.351).*

## How it works

Two stages, run in two isolated environments (their dependencies conflict).

**Stage 1, brain map** (`run_brain.py`): audio goes into TRIBE, out comes a
predicted fMRI activation tensor on the fsaverage5 cortical surface
(`[n_segments, 20484]`, 1 Hz).

**Stage 2, emotion map** (`emotion_map.py`): the brain tensor is compared against
Neurosynth reverse-inference term maps (NiMARE `MKDAChi2`), projected from MNI152
volume space onto the fsaverage5 surface (nilearn `vol_to_surf`), then reduced by
spatial pattern correlation to arousal and valence axes over time.

![Emotion axes for one track](results/Vanished_emotion_axes.png)

## The validation experiment

`deam_tribe_batch.py` runs TRIBE over a sample of [DEAM](https://cvml.unige.ch/databases/DEAM/)
clips (music with human valence/arousal ratings). `deam_validate.py` then runs the
decisive test, **incremental validity**: does an audio baseline *plus* TRIBE beat
the audio baseline *alone* at predicting human arousal, under cross-validation?

It does not. And a Neurosynth-free readout (raw activation magnitude) was flat too,
so this is not a wiring artifact. The audio baseline alone reaches cross-validated
R² of 0.36; TRIBE adds nothing on top.

## Why it fails (the interesting part)

TRIBE predicts cortical fMRI response, and it does that well. But for audio-only
input, that response is dominated by auditory cortex, which is roughly a
re-encoding of the acoustics. So there is no emotional information to extract
beyond what the raw audio already carries. Affect lives partly in subcortical
regions that are absent from the cortical surface, and in semantic meaning carried
by the text and video modalities that were deliberately disabled here. "Predicts
fMRI" was never the same as "predicts how content lands," and this is that gap made
concrete, for audio.

## Run it

```bash
# Stage 1 (TRIBE). Use the CUDA torch wheel on an NVIDIA box; CPU works but is slow.
python -m venv venv && venv/bin/pip install -r requirements.txt
caffeinate -i venv/bin/python run_brain.py path/to/song.mp3

# Stage 2 (Neurosynth / nilearn), isolated environment.
python -m venv venv_neuro && venv_neuro/bin/pip install -r requirements_neuro.txt
venv_neuro/bin/python emotion_map.py <song>
```

First Stage-1 run downloads the TRIBE and Wav2Vec2 weights (~2 GB); first Stage-2
run downloads the Neurosynth v7 database.

## Results

See [`results/`](results/) for the plots and the feature table behind the finding.

## Tech

Python, PyTorch, Hugging Face Transformers, nilearn, NiMARE, nibabel, NumPy, SciPy,
pandas, scikit-learn, matplotlib, ffmpeg.
