import { useMemo, useState } from "react";
import { useWidth } from "../../lib/hooks";
import { pearson } from "../../lib/stats";
import { linear, ticks } from "./scale";

export interface Point {
  x: number;
  y: number;
  label: string;
}

interface Props {
  points: Point[];
  xLabel: string;
  yLabel: string;
  color: string;
  /** draw the y = x identity line (for predicted-vs-actual plots) */
  identity?: boolean;
  height?: number;
  fmtX?: (v: number) => string;
  fmtY?: (v: number) => string;
}

const M = { top: 12, right: 14, bottom: 40, left: 42 };
const pad = (lo: number, hi: number): [number, number] => {
  const p = (hi - lo) * 0.06 || 1;
  return [lo - p, hi + p];
};
const auto = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(3));

export function Scatter({ points, xLabel, yLabel, color, identity = false, height = 300, fmtX = auto, fmtY = auto }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>(480);
  const [hover, setHover] = useState<number | null>(null);

  const { x, y, fit, r } = useMemo(() => {
    const xv = points.map((p) => p.x);
    const yv = points.map((p) => p.y);
    let dx = pad(Math.min(...xv), Math.max(...xv));
    let dy = pad(Math.min(...yv), Math.max(...yv));
    if (identity) dx = dy = [Math.min(dx[0], dy[0]), Math.max(dx[1], dy[1])];
    const x = linear(dx, [M.left, Math.max(M.left + 60, width - M.right)]);
    const y = linear(dy, [height - M.bottom, M.top]);
    const r = pearson(xv, yv);
    const mx = xv.reduce((a, b) => a + b, 0) / xv.length;
    const my = yv.reduce((a, b) => a + b, 0) / yv.length;
    const sxx = xv.reduce((a, v) => a + (v - mx) ** 2, 0);
    const slope = sxx ? xv.reduce((a, v, i) => a + (v - mx) * (yv[i] - my), 0) / sxx : 0;
    return { x, y, r, fit: (v: number) => my + slope * (v - mx) };
  }, [points, width, height, identity]);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    let best = -1;
    let bd = 20 * 20;
    points.forEach((p, i) => {
      const d = (x(p.x) - px) ** 2 + (y(p.y) - py) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(best >= 0 ? best : null);
  };

  const [x0, x1] = x.domain;
  const [y0, y1] = y.domain;
  const clipY = (v: number) => Math.max(y0, Math.min(y1, v));
  const hp = hover != null ? points[hover] : null;

  return (
    <div className="chart" ref={ref} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label={`${yLabel} against ${xLabel}, correlation ${r.toFixed(2)}`}>
        {ticks(y0, y1, 5).map((v) => (
          <g key={v}>
            <line className="gridline" x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} />
            <text x={M.left - 8} y={y(v) + 3.5} textAnchor="end">
              {fmtY(v)}
            </text>
          </g>
        ))}
        {ticks(x0, x1, Math.max(3, Math.floor(width / 110))).map((v) => (
          <text key={v} x={x(v)} y={height - M.bottom + 16} textAnchor="middle">
            {fmtX(v)}
          </text>
        ))}
        <text x={(M.left + width - M.right) / 2} y={height - 4} textAnchor="middle" className="axis-title">
          {xLabel}
        </text>
        <text transform={`translate(11 ${(M.top + height - M.bottom) / 2}) rotate(-90)`} textAnchor="middle" className="axis-title">
          {yLabel}
        </text>
        {identity ? (
          <line x1={x(x0)} y1={y(x0)} x2={x(x1)} y2={y(x1)} stroke="var(--border-strong)" strokeDasharray="4 4" />
        ) : (
          <line x1={x(x0)} y1={y(clipY(fit(x0)))} x2={x(x1)} y2={y(clipY(fit(x1)))} stroke="var(--text-2)" strokeWidth={1.5} />
        )}
        {points.map((p, i) => (
          <circle key={i} cx={x(p.x)} cy={y(p.y)} r={4} fill={color} fillOpacity={0.6} stroke="var(--surface)" strokeWidth={1} />
        ))}
        {hp && <circle cx={x(hp.x)} cy={y(hp.y)} r={6} fill={color} stroke="var(--text)" strokeWidth={1.5} />}
      </svg>
      {hp && (
        <div className="tooltip" style={{ left: Math.min(x(hp.x) + 12, width - 170), top: Math.max(0, y(hp.y) - 74) }}>
          <div className="tt-title">{hp.label}</div>
          <div className="tt-row">
            <span>{xLabel}</span>
            <b style={{ marginLeft: 12 }}>{fmtX(hp.x)}</b>
          </div>
          <div className="tt-row">
            <span>{yLabel}</span>
            <b style={{ marginLeft: 12 }}>{fmtY(hp.y)}</b>
          </div>
        </div>
      )}
    </div>
  );
}
