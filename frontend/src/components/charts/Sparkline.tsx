import { linePath } from "./scale";

/** Tiny arousal arc for library cards. Fixed scale so cards are comparable at a glance. */
export function Sparkline({ values, color = "var(--arousal)", height = 44 }: { values: number[]; color?: string; height?: number }) {
  const w = 200;
  if (values.length < 2) return <svg viewBox={`0 0 ${w} ${height}`} style={{ width: "100%", height }} />;
  const xs = values.map((_, i) => (i / (values.length - 1)) * w);
  const ys = values.map((v) => height - 3 - ((Math.min(8, Math.max(2, v)) - 2) / 6) * (height - 6));
  const d = linePath(xs, ys);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }} aria-hidden>
      <path d={`${d}L${w},${height}L0,${height}Z`} fill={color} opacity={0.12} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
