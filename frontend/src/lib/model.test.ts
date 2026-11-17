import { describe, expect, it } from "vitest";
import { DEAM } from "./deam";
import { analyzePcm, SAMPLE_RATE } from "./dsp";
import { getModels, predict } from "./model";
import { pearson } from "./stats";

describe("DEAM model", () => {
  it("loads the feature table", () => {
    expect(DEAM.length).toBe(176);
  });

  it("reproduces the published incremental-validity result", () => {
    const m = getModels();
    // README: audio 0.361, audio+TRIBE 0.351 (sklearn folds; ours differ slightly)
    expect(m.arousal.cv.r2).toBeGreaterThan(0.3);
    expect(m.arousal.cv.r2).toBeLessThan(0.42);
    expect(m.arousalWithTribe.r2 - m.arousal.cv.r2).toBeLessThan(0.03);
  });

  it("rms correlates with arousal", () => {
    expect(pearson(DEAM.map((r) => r.rms), DEAM.map((r) => r.arousal))).toBeGreaterThan(0.3);
  });
});

describe("dsp", () => {
  const sine = (hz: number, amp: number, sec: number) => {
    const y = new Float32Array(sec * SAMPLE_RATE);
    for (let i = 0; i < y.length; i++) y[i] = amp * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE);
    return y;
  };

  it("measures a pure tone correctly", () => {
    const r = analyzePcm(sine(1000, 0.5, 12));
    expect(r.duration).toBeCloseTo(12, 3);
    expect(r.clip.rms).toBeCloseTo(0.5 / Math.SQRT2, 2);
    expect(r.clip.zcr).toBeCloseTo((2 * 1000) / SAMPLE_RATE, 3);
    expect(Math.abs(r.clip.centroid - 1000)).toBeLessThan(40);
    expect(r.windows.length).toBe(13);
  });

  it("rates loud bright noise as more arousing than a quiet low tone", () => {
    const noise = new Float32Array(12 * SAMPLE_RATE);
    let s = 1;
    for (let i = 0; i < noise.length; i++) {
      s = (s * 16807) % 2147483647;
      noise[i] = (s / 2147483647 - 0.5) * 0.9 * (i % 5000 < 1200 ? 1 : 0.3);
    }
    const loud = predict(analyzePcm(noise).clip);
    const quiet = predict(analyzePcm(sine(110, 0.03, 12)).clip);
    expect(loud.arousal).toBeGreaterThan(quiet.arousal + 1);
  });
});
