/** Small, dependency-free statistics used by the model and the research page. */

export const mean = (a: ArrayLike<number>): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return a.length ? s / a.length : 0;
};

/** Population standard deviation (matches numpy / sklearn StandardScaler). */
export const std = (a: ArrayLike<number>): number => {
  const m = mean(a);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - m) ** 2;
  return a.length ? Math.sqrt(s / a.length) : 0;
};

export function pearson(x: ArrayLike<number>, y: ArrayLike<number>): number {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const d = Math.sqrt(sxx * syy);
  return d > 0 ? sxy / d : 0;
}

export function quantile(sorted: ArrayLike<number>, q: number): number {
  if (!sorted.length) return NaN;
  const p = (sorted.length - 1) * q;
  const lo = Math.floor(p);
  const hi = Math.ceil(p);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
}

/** Share of `values` strictly below `v`, 0..1. */
export function percentileRank(values: ArrayLike<number>, v: number): number {
  let below = 0;
  for (let i = 0; i < values.length; i++) if (values[i] < v) below++;
  return values.length ? below / values.length : 0;
}

/** Solve A x = b for a small dense system (Gaussian elimination, partial pivoting). */
export function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const piv = M[c][c] || 1e-12;
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / piv;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / (M[r][r] || 1e-12);
  }
  return x;
}

export interface RidgeModel {
  /** per-feature mean / std used to standardise inputs */
  mu: number[];
  sigma: number[];
  /** weights in standardised feature space */
  weights: number[];
  intercept: number;
}

/** StandardScaler + Ridge(alpha), the same pipeline as deam_validate.py. */
export function fitRidge(X: number[][], y: number[], alpha = 1): RidgeModel {
  const n = X.length;
  const d = X[0].length;
  const mu: number[] = [];
  const sigma: number[] = [];
  for (let j = 0; j < d; j++) {
    const col = X.map((r) => r[j]);
    mu.push(mean(col));
    sigma.push(std(col) || 1);
  }
  const ybar = mean(y);
  const A = Array.from({ length: d }, () => new Array<number>(d).fill(0));
  const b = new Array<number>(d).fill(0);
  const z = new Array<number>(d);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) z[j] = (X[i][j] - mu[j]) / sigma[j];
    for (let j = 0; j < d; j++) {
      b[j] += z[j] * (y[i] - ybar);
      for (let k = 0; k < d; k++) A[j][k] += z[j] * z[k];
    }
  }
  for (let j = 0; j < d; j++) A[j][j] += alpha;
  return { mu, sigma, weights: solve(A, b), intercept: ybar };
}

export function predictRidge(m: RidgeModel, x: ArrayLike<number>): number {
  let s = m.intercept;
  for (let j = 0; j < m.weights.length; j++) s += (m.weights[j] * (x[j] - m.mu[j])) / m.sigma[j];
  return s;
}

/** Deterministic PRNG so every visitor sees the same cross-validation folds. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CvResult {
  /** mean of per-fold R², averaged over repeats (sklearn cross_val_score convention) */
  r2: number;
  /** out-of-fold root-mean-square error */
  rmse: number;
  /** out-of-fold predictions from the first repeat, aligned with y */
  oof: number[];
}

/** Repeated shuffled k-fold cross-validation of the scaler + ridge pipeline. */
export function crossValidate(X: number[][], y: number[], k = 5, repeats = 20, seed = 7): CvResult {
  const n = y.length;
  const rand = mulberry32(seed);
  let r2Sum = 0;
  let r2Count = 0;
  let seSum = 0;
  let seCount = 0;
  let oof: number[] = [];
  for (let rep = 0; rep < repeats; rep++) {
    const idx = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    const preds = new Array<number>(n).fill(0);
    for (let f = 0; f < k; f++) {
      const test = idx.filter((_, i) => i % k === f);
      const inTest = new Set(test);
      const train = idx.filter((i) => !inTest.has(i));
      const m = fitRidge(train.map((i) => X[i]), train.map((i) => y[i]));
      const yt = test.map((i) => y[i]);
      const my = mean(yt);
      let ssRes = 0;
      let ssTot = 0;
      for (const i of test) {
        const p = predictRidge(m, X[i]);
        preds[i] = p;
        ssRes += (y[i] - p) ** 2;
        ssTot += (y[i] - my) ** 2;
      }
      r2Sum += 1 - ssRes / (ssTot || 1);
      r2Count++;
      seSum += ssRes;
      seCount += test.length;
    }
    if (rep === 0) oof = preds;
  }
  return { r2: r2Sum / r2Count, rmse: Math.sqrt(seSum / seCount), oof };
}
