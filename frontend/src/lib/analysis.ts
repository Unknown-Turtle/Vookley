import { DEAM } from "./deam";
import type { DspResult, Features, WindowFeatures } from "./dsp";
import { N_BANDS } from "./dsp";
import { predict, SCALE_MID } from "./model";
import { mean, percentileRank, quantile } from "./stats";

export type Source = "upload" | "demo";

/** Everything the report needs. Plain JSON so it can live in localStorage. */
export interface Analysis {
  id: string;
  name: string;
  createdAt: number;
  source: Source;
  demoId?: string;
  duration: number;
  clip: Features;
  overall: { arousal: number; valence: number };
  windows: WindowFeatures[];
  arousal: number[];
  valence: number[];
  waveform: number[];
  /** band energies quantised 0..99, row-major [bandSeconds][N_BANDS] */
  bands: number[];
  bandSeconds: number;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function buildAnalysis(dsp: DspResult, meta: { name: string; source: Source; demoId?: string }): Analysis {
  const preds = dsp.windows.map((w) => predict(w));
  return {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
    ...meta,
    duration: dsp.duration,
    clip: dsp.clip,
    overall: predict(dsp.clip),
    windows: dsp.windows.map((w) => ({
      t: w.t,
      rms: +w.rms.toPrecision(4),
      centroid: Math.round(w.centroid),
      flux: +w.flux.toPrecision(4),
      zcr: +w.zcr.toPrecision(4),
      onset_rate: r3(w.onset_rate),
    })),
    arousal: preds.map((p) => r3(p.arousal)),
    valence: preds.map((p) => r3(p.valence)),
    waveform: Array.from(dsp.waveform, r3),
    bands: Array.from(dsp.bands, (v) => Math.round(v * 99)),
    bandSeconds: dsp.bandSeconds,
  };
}

export { N_BANDS };

// ------------------------------------------------------------------ quadrants
export type QuadrantKey = "energetic" | "tense" | "somber" | "calm";

export const QUADRANTS: Record<QuadrantKey, { label: string; blurb: string; hint: string }> = {
  energetic: { label: "Energetic", blurb: "high energy, positive", hint: "upbeat, driving, euphoric" },
  tense: { label: "Tense", blurb: "high energy, negative", hint: "aggressive, anxious, urgent" },
  somber: { label: "Somber", blurb: "low energy, negative", hint: "melancholic, heavy, dark" },
  calm: { label: "Calm", blurb: "low energy, positive", hint: "warm, relaxed, gentle" },
};
export const QUADRANT_ORDER: QuadrantKey[] = ["energetic", "tense", "somber", "calm"];

export function quadrantOf(arousal: number, valence: number): QuadrantKey {
  if (arousal >= SCALE_MID) return valence >= SCALE_MID ? "energetic" : "tense";
  return valence >= SCALE_MID ? "calm" : "somber";
}

// ------------------------------------------------------------------ insights
export interface Moment {
  kind: "peak" | "low" | "rise" | "drop" | "brightest" | "darkest";
  t: number;
  title: string;
  detail: string;
}

export interface Section {
  start: number;
  end: number;
  level: 0 | 1 | 2;
  mean: number;
}

export type ArcShape = "builds" | "winds down" | "steady" | "dynamic" | "arch" | "dip";

export interface Insights {
  quadrant: QuadrantKey;
  shares: Record<QuadrantKey, number>;
  moments: Moment[];
  sections: Section[];
  shape: ArcShape;
  shapeText: string;
  /** p5–p95 spread of arousal over the track, rating points */
  range: number;
  arousalPct: number;
  valencePct: number;
  headline: string;
}

export const fmtTime = (s: number): string => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

const argBest = (a: number[], better: (x: number, y: number) => boolean) => {
  let b = 0;
  for (let i = 1; i < a.length; i++) if (better(a[i], a[b])) b = i;
  return b;
};

const LEVEL_NAMES = ["low", "mid", "high"] as const;
export const levelName = (l: 0 | 1 | 2) => LEVEL_NAMES[l];

function sectionsOf(t: number[], a: number[]): Section[] {
  if (a.length < 2) return [];
  const sorted = [...a].sort((x, y) => x - y);
  const lo = quantile(sorted, 0.05);
  const hi = quantile(sorted, 0.95);
  if (hi - lo < 0.35) {
    return [{ start: t[0], end: t[t.length - 1], level: 1, mean: mean(a) }];
  }
  const c1 = lo + (hi - lo) / 3;
  const c2 = lo + ((hi - lo) * 2) / 3;
  const lv = a.map((v) => (v < c1 ? 0 : v < c2 ? 1 : 2) as 0 | 1 | 2);
  // run-length encode, then absorb runs that are too short to mean anything
  let runs: { i0: number; i1: number; level: 0 | 1 | 2 }[] = [];
  for (let i = 0; i < lv.length; i++) {
    const last = runs[runs.length - 1];
    if (last && last.level === lv[i]) last.i1 = i + 1;
    else runs.push({ i0: i, i1: i + 1, level: lv[i] });
  }
  const minLen = Math.max(4, Math.min(8, Math.round(a.length / 12)));
  let changed = true;
  while (changed && runs.length > 1) {
    changed = false;
    let k = -1;
    let shortest = Infinity;
    runs.forEach((r, i) => {
      const len = r.i1 - r.i0;
      if (len < minLen && len < shortest) {
        shortest = len;
        k = i;
      }
    });
    if (k >= 0) {
      const into = k === 0 ? 1 : k === runs.length - 1 ? k - 1 : runs[k - 1].i1 - runs[k - 1].i0 >= runs[k + 1].i1 - runs[k + 1].i0 ? k - 1 : k + 1;
      runs[into].i0 = Math.min(runs[into].i0, runs[k].i0);
      runs[into].i1 = Math.max(runs[into].i1, runs[k].i1);
      runs.splice(k, 1);
      const merged: typeof runs = [];
      for (const r of runs) {
        const last = merged[merged.length - 1];
        if (last && last.level === r.level) last.i1 = r.i1;
        else merged.push(r);
      }
      runs = merged;
      changed = true;
    }
  }
  return runs.map((r) => ({
    start: t[r.i0],
    end: r.i1 < t.length ? t[r.i1] : t[t.length - 1],
    level: r.level,
    mean: mean(a.slice(r.i0, r.i1)),
  }));
}

function shapeOf(a: number[], range: number): { shape: ArcShape; text: string } {
  const n = a.length;
  if (n < 6 || range < 0.5) return { shape: "steady", text: "Holds a steady energy level from start to finish." };
  const third = Math.max(1, Math.floor(n / 3));
  const head = mean(a.slice(0, third));
  const mid = mean(a.slice(third, n - third));
  const tail = mean(a.slice(n - third));
  const edge = (head + tail) / 2;
  const tilt = tail - head;
  const big = Math.max(0.45, range * 0.35);
  if (tilt > big) return { shape: "builds", text: "Builds: the final third is clearly more energetic than the opening." };
  if (tilt < -big) return { shape: "winds down", text: "Winds down: it opens hotter than it closes." };
  if (mid - edge > big) return { shape: "arch", text: "Arches: energy crests in the middle and eases at both ends." };
  if (edge - mid > big) return { shape: "dip", text: "Dips: a quieter middle framed by a stronger open and close." };
  return { shape: "dynamic", text: "Dynamic: energy moves around without a single overall direction." };
}

const refArousal = DEAM.map((r) => r.arousal);
const refValence = DEAM.map((r) => r.valence);

export function insightsFor(an: Analysis): Insights {
  const t = an.windows.map((w) => w.t);
  const a = an.arousal;
  const v = an.valence;
  const shares: Record<QuadrantKey, number> = { energetic: 0, tense: 0, somber: 0, calm: 0 };
  a.forEach((x, i) => (shares[quadrantOf(x, v[i])] += 1 / a.length));

  const sorted = [...a].sort((x, y) => x - y);
  const range = a.length ? quantile(sorted, 0.95) - quantile(sorted, 0.05) : 0;

  const moments: Moment[] = [];
  if (a.length > 4) {
    const pk = argBest(a, (x, y) => x > y);
    const lw = argBest(a, (x, y) => x < y);
    moments.push({ kind: "peak", t: t[pk], title: "Energy peak", detail: `Predicted arousal tops out at ${a[pk].toFixed(1)}.` });
    if (range >= 0.5) {
      moments.push({ kind: "low", t: t[lw], title: "Quietest point", detail: `Arousal bottoms out at ${a[lw].toFixed(1)}.` });
      const span = Math.min(8, Math.max(3, Math.floor(a.length / 6)));
      const diffs = a.slice(0, a.length - span).map((x, i) => a[i + span] - x);
      if (diffs.length) {
        const up = argBest(diffs, (x, y) => x > y);
        const dn = argBest(diffs, (x, y) => x < y);
        if (diffs[up] > 0.4) moments.push({ kind: "rise", t: t[up], title: "Biggest lift", detail: `Energy climbs ${diffs[up].toFixed(1)} points over ${span} s.` });
        if (diffs[dn] < -0.4) moments.push({ kind: "drop", t: t[dn], title: "Biggest drop", detail: `Energy falls ${Math.abs(diffs[dn]).toFixed(1)} points over ${span} s.` });
      }
    }
    const vs = [...v].sort((x, y) => x - y);
    if (quantile(vs, 0.95) - quantile(vs, 0.05) >= 0.4) {
      const br = argBest(v, (x, y) => x > y);
      const dk = argBest(v, (x, y) => x < y);
      moments.push({ kind: "brightest", t: t[br], title: "Most positive", detail: `Valence reaches ${v[br].toFixed(1)}.` });
      moments.push({ kind: "darkest", t: t[dk], title: "Most negative", detail: `Valence dips to ${v[dk].toFixed(1)}.` });
    }
    moments.sort((m1, m2) => m1.t - m2.t);
  }

  const { shape, text } = shapeOf(a, range);
  const quadrant = quadrantOf(an.overall.arousal, an.overall.valence);
  const arousalPct = percentileRank(refArousal, an.overall.arousal);
  const valencePct = percentileRank(refValence, an.overall.valence);
  const energyWord = an.overall.arousal >= 6.2 ? "High-energy" : an.overall.arousal >= 5 ? "Moderately energetic" : an.overall.arousal >= 3.8 ? "Low-key" : "Very calm";
  const toneWord = an.overall.valence >= 5.8 ? "bright" : an.overall.valence >= 5 ? "leaning positive" : an.overall.valence >= 4.2 ? "leaning dark" : "dark";
  return {
    quadrant,
    shares,
    moments,
    sections: sectionsOf(t, a),
    shape,
    shapeText: text,
    range,
    arousalPct,
    valencePct,
    headline: `${energyWord} and ${toneWord}`,
  };
}

/** Value of a series at an arbitrary time (linear interpolation). */
export function sampleAt(an: Analysis, series: number[], time: number): number {
  const w = an.windows;
  if (!w.length) return NaN;
  if (time <= w[0].t) return series[0];
  if (time >= w[w.length - 1].t) return series[series.length - 1];
  const i = Math.min(w.length - 2, Math.max(0, Math.floor(time - w[0].t)));
  const f = (time - w[i].t) / (w[i + 1].t - w[i].t || 1);
  return series[i] + (series[i + 1] - series[i]) * f;
}

// ------------------------------------------------------------------ export
export function toCsv(an: Analysis): string {
  const head = "time_s,arousal,valence,quadrant,rms,centroid_hz,flux,zcr,onset_rate";
  const rows = an.windows.map((w, i) =>
    [w.t, an.arousal[i], an.valence[i], quadrantOf(an.arousal[i], an.valence[i]), w.rms, w.centroid, w.flux, w.zcr, w.onset_rate].join(","),
  );
  return [head, ...rows].join("\n");
}

export function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
