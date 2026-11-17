export interface Linear {
  (v: number): number;
  invert: (px: number) => number;
  domain: [number, number];
}

export function linear(domain: [number, number], range: [number, number]): Linear {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = (r1 - r0) / (d1 - d0 || 1);
  const f = ((v: number) => r0 + (v - d0) * k) as Linear;
  f.invert = (px) => d0 + (px - r0) / (k || 1);
  f.domain = domain;
  return f;
}

/** Round-number ticks covering [lo, hi]. */
export function ticks(lo: number, hi: number, target = 5): number[] {
  const span = hi - lo;
  if (span <= 0) return [lo];
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(+v.toPrecision(10));
  return out;
}

/** Time ticks that land on friendly intervals. */
export function timeTicks(duration: number, target = 7): number[] {
  const steps = [5, 10, 15, 30, 60, 120, 300, 600];
  const step = steps.find((s) => duration / s <= target) ?? 900;
  const out: number[] = [];
  for (let t = 0; t <= duration + 1e-6; t += step) out.push(t);
  return out;
}

/** Rating-scale domain that hugs the data but never zooms in past `minSpan` points. */
export function ratingDomain(values: number[], minSpan = 3): [number, number] {
  let lo = Math.max(1, Math.floor(Math.min(...values) - 0.3));
  let hi = Math.min(9, Math.ceil(Math.max(...values) + 0.3));
  while (hi - lo < minSpan) {
    if (lo > 1) lo -= 1;
    if (hi - lo < minSpan && hi < 9) hi += 1;
  }
  return [lo, hi];
}

export const linePath = (xs: number[], ys: number[]) => xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join("");
