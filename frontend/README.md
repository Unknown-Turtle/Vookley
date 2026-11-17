# Vookley frontend

A static web app that predicts the emotional arc of a track in the browser.

It ships the part of the research that held up: the five-feature audio baseline
from `deam_validate.py`, fitted to the DEAM feature table in
`results/deam_validation_features.csv`. Nothing is uploaded; there is no backend.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Other scripts: `npm run build` (type-check and bundle to `dist/`), `npm test`,
`npm run preview`.

## What's in it

| Route | What it does |
|---|---|
| `/` | Landing page with a live demo analysis |
| `/analyze` | Drop an audio file, or run a built-in synthesised demo |
| `/track/:id` | Report: player, arousal/valence arc, key moments, mood map, intent check, feature breakdown, CSV/JSON export |
| `/library` | Saved analyses (localStorage only; audio is never stored) |
| `/compare/:a/:b` | Two analyses overlaid |
| `/research` | Interactive version of the TRIBE-vs-audio validation, recomputed in the browser |

## How the model gets into the browser

- `src/lib/dsp.ts` ports the Python feature extraction (mono 22.05 kHz, Hann
  STFT 2048/512, RMS, spectral centroid, flux, zero-crossing rate, onset rate).
- `src/lib/stats.ts` implements StandardScaler + Ridge(alpha=1) and repeated
  k-fold cross-validation.
- `src/lib/model.ts` fits arousal and valence models on the 176 DEAM rows at
  load, so every number on the Research page is computed from the data, not
  hard-coded.
- `src/worker/analyze.worker.ts` runs the DSP off the main thread.

The per-second arc applies the clip-level model to a 10-second sliding window.
That is an extrapolation from how the model was trained (45-second clips), and
the UI says so.

`src/data/deam.csv` and `src/assets/results/` are copies of files in
`../results/`. Re-copy them if the results change.

## Deploy

Any static host works. `vercel.json` adds the SPA fallback; on Vercel set the
project root to `frontend/`.
