import { AUDIO_FEATURES, DEAM, TRIBE_FEATURES, type FeatureKey } from "./deam";
import type { Features } from "./dsp";
import { crossValidate, fitRidge, predictRidge, type CvResult, type RidgeModel } from "./stats";

/** DEAM ratings live on a 1–9 scale; 5 is the neutral midpoint. */
export const SCALE_MIN = 1;
export const SCALE_MAX = 9;
export const SCALE_MID = 5;

const matrix = (keys: readonly FeatureKey[]) => DEAM.map((r) => keys.map((k) => r[k]));
const yArousal = DEAM.map((r) => r.arousal);
const yValence = DEAM.map((r) => r.valence);

export interface FittedTarget {
  model: RidgeModel;
  cv: CvResult;
}

interface Models {
  arousal: FittedTarget;
  valence: FittedTarget;
  /** same targets with TRIBE's two features added: the incremental-validity test */
  arousalWithTribe: CvResult;
  valenceWithTribe: CvResult;
}

let cached: Models | null = null;

/** Fit once per session. 176 rows × 5 features: a few milliseconds. */
export function getModels(): Models {
  if (cached) return cached;
  const Xa = matrix(AUDIO_FEATURES);
  const Xb = matrix([...AUDIO_FEATURES, ...TRIBE_FEATURES]);
  cached = {
    arousal: { model: fitRidge(Xa, yArousal), cv: crossValidate(Xa, yArousal) },
    valence: { model: fitRidge(Xa, yValence), cv: crossValidate(Xa, yValence) },
    arousalWithTribe: crossValidate(Xb, yArousal),
    valenceWithTribe: crossValidate(Xb, yValence),
  };
  return cached;
}

const clamp = (v: number) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, v));
const vec = (f: Features) => AUDIO_FEATURES.map((k) => f[k]);

export function predict(f: Features): { arousal: number; valence: number } {
  const m = getModels();
  const x = vec(f);
  return { arousal: clamp(predictRidge(m.arousal.model, x)), valence: clamp(predictRidge(m.valence.model, x)) };
}

/**
 * Per-feature contribution to a prediction, in rating points away from the
 * DEAM average. Sums (with the intercept) to the unclamped prediction.
 */
export function contributions(f: Features, target: "arousal" | "valence") {
  const { model } = getModels()[target];
  return AUDIO_FEATURES.map((k, j) => ({
    key: k,
    z: (f[k] - model.mu[j]) / model.sigma[j],
    points: (model.weights[j] * (f[k] - model.mu[j])) / model.sigma[j],
  }));
}
