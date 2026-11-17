import { useState } from "react";
import { fmtTime, sampleAt, type Analysis } from "../../lib/analysis";
import { DEAM } from "../../lib/deam";
import { useWidth } from "../../lib/hooks";
import { linear, linePath } from "./scale";

interface Props {
  an: Analysis;
  time?: number;
  /** optional second track, drawn in the comparison colour */
  other?: Analysis;
}

/** Valence × arousal plane: the track's path against the 176 human-rated reference songs. */
export function Circumplex({ an, time, other }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>(320);
  const [hover, setHover] = useState<number | null>(null);
  const size = Math.min(width, 440);
  const m = 30;
  const x = linear([1, 9], [m, size - 10]);
  const y = linear([1, 9], [size - m, 10]);
  const xs = an.valence.map(x);
  const ys = an.arousal.map(y);
  const mainColor = other ? "var(--text)" : "var(--arousal)";

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    let best = -1;
    let bd = 22 * 22;
    for (let i = 0; i < xs.length; i++) {
      const d = (xs[i] - px) ** 2 + (ys[i] - py) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    setHover(best >= 0 ? best : null);
  };

  const showNow = time != null && time > 0;
  const nowA = showNow ? sampleAt(an, an.arousal, time) : 0;
  const nowV = showNow ? sampleAt(an, an.valence, time) : 0;

  return (
    <div className="chart" ref={ref} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      <svg width={size} height={size} style={{ margin: "0 auto" }} role="img" aria-label="Valence and arousal plane showing this track against the reference songs">
        {[1, 3, 5, 7, 9].map((v) => (
          <g key={v}>
            <line className={v === 5 ? "gridline midline" : "gridline"} x1={x(v)} x2={x(v)} y1={y(1)} y2={y(9)} />
            <line className={v === 5 ? "gridline midline" : "gridline"} x1={x(1)} x2={x(9)} y1={y(v)} y2={y(v)} />
            <text x={x(v)} y={size - m + 14} textAnchor="middle">
              {v}
            </text>
            <text x={m - 7} y={y(v) + 3.5} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <text x={x(9) - 6} y={y(9) + 14} textAnchor="end" className="axis-title">
          Energetic
        </text>
        <text x={x(1) + 6} y={y(9) + 14} className="axis-title">
          Tense
        </text>
        <text x={x(1) + 6} y={y(1) - 8} className="axis-title">
          Somber
        </text>
        <text x={x(9) - 6} y={y(1) - 8} textAnchor="end" className="axis-title">
          Calm
        </text>
        <text x={(x(1) + x(9)) / 2} y={size - 2} textAnchor="middle">
          valence
        </text>
        <text transform={`translate(9 ${(y(1) + y(9)) / 2}) rotate(-90)`} textAnchor="middle">
          arousal
        </text>
        {DEAM.map((r) => (
          <circle key={r.id} cx={x(r.valence)} cy={y(r.arousal)} r={2.2} fill="var(--ref-dot)" />
        ))}
        {other && (
          <>
            <path d={linePath(other.valence.map(x), other.arousal.map(y))} fill="none" stroke="var(--third)" strokeWidth={1.5} opacity={0.6} strokeLinejoin="round" />
            <circle cx={x(other.overall.valence)} cy={y(other.overall.arousal)} r={7} fill="var(--third)" stroke="var(--surface)" strokeWidth={2} />
          </>
        )}
        <path d={linePath(xs, ys)} fill="none" stroke={mainColor} strokeWidth={1.5} opacity={0.6} strokeLinejoin="round" />
        <circle cx={x(an.overall.valence)} cy={y(an.overall.arousal)} r={7} fill={mainColor} stroke="var(--surface)" strokeWidth={2} />
        {showNow && <circle cx={x(nowV)} cy={y(nowA)} r={5} fill="var(--surface)" stroke="var(--text)" strokeWidth={2} />}
        {hover != null && <circle cx={xs[hover]} cy={ys[hover]} r={5} fill={mainColor} stroke="var(--surface)" strokeWidth={2} />}
      </svg>
      {hover != null && (
        <div className="tooltip" style={{ left: Math.max(0, Math.min(xs[hover] + 12 + (width - size) / 2, width - 140)), top: Math.max(0, ys[hover] - 70) }}>
          <div className="tt-title">{fmtTime(an.windows[hover].t)}</div>
          <div className="tt-row">
            <span>Arousal</span>
            <b>{an.arousal[hover].toFixed(1)}</b>
          </div>
          <div className="tt-row">
            <span>Valence</span>
            <b>{an.valence[hover].toFixed(1)}</b>
          </div>
        </div>
      )}
    </div>
  );
}
