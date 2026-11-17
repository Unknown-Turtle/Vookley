import { useMemo, useState } from "react";
import { fmtTime, QUADRANTS, quadrantOf, type Analysis, type Moment } from "../../lib/analysis";
import { useWidth } from "../../lib/hooks";
import { linear, linePath, ratingDomain, timeTicks } from "./scale";

interface Props {
  an: Analysis;
  time?: number;
  onSeek?: (t: number) => void;
  moments?: Moment[];
  /** compact mode drops the valence panel (used on the landing page) */
  compact?: boolean;
  /** optional second track overlaid in the comparison colour */
  other?: Analysis;
}

const GAP = 34;
const M = { top: 22, right: 14, bottom: 26, left: 34 };

/**
 * Arousal and valence over time as two stacked panels sharing one x-axis.
 * They are separate panels rather than one dual-axis chart on purpose: the two
 * ratings are different measures even though they share a 1–9 scale.
 */
export function Timeline({ an, time, onSeek, moments = [], compact = false, other }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<number | null>(null);

  const panels = useMemo(() => {
    const defs = [
      { key: "arousal" as const, label: "Arousal", sub: "calm → energetic", color: "var(--arousal)" },
      { key: "valence" as const, label: "Valence", sub: "negative → positive", color: "var(--valence)" },
    ].slice(0, compact ? 1 : 2);
    return defs.map((p) => ({
      ...p,
      data: an[p.key],
      otherData: other?.[p.key],
      domain: ratingDomain([...an[p.key], ...(other?.[p.key] ?? [])]),
    }));
  }, [an, other, compact]);

  const panelH = compact ? 170 : 150;
  const innerW = Math.max(120, width - M.left - M.right);
  const height = M.top + panels.length * panelH + (panels.length - 1) * GAP + M.bottom;
  const lastT = (a: Analysis) => Math.max(a.duration, a.windows[a.windows.length - 1]?.t ?? 1);
  const tMax = Math.max(lastT(an), other ? lastT(other) : 0);
  const x = linear([0, tMax], [M.left, M.left + innerW]);
  const xs = an.windows.map((w) => x(w.t));
  const oxs = other?.windows.map((w) => x(w.t)) ?? [];
  const tt = timeTicks(tMax, Math.max(3, Math.floor(innerW / 90)));
  const mainColor = (c: string) => (other ? "var(--text)" : c);

  const at = (clientX: number, el: Element) => {
    const t = Math.max(0, Math.min(tMax, x.invert(clientX - el.getBoundingClientRect().left)));
    return { i: Math.round(t), t };
  };
  const idx = (a: Analysis, sec: number) => (sec < a.windows.length ? sec : null);

  const hi = hover != null ? idx(an, hover) : null;
  const ho = hover != null && other ? idx(other, hover) : null;
  const hx = hover != null ? x(hover) : null;
  const flip = hx != null && hx + 190 > width;

  return (
    <div
      className="chart"
      ref={ref}
      onPointerMove={(e) => setHover(at(e.clientX, e.currentTarget).i)}
      onPointerLeave={() => setHover(null)}
      onClick={(e) => onSeek?.(at(e.clientX, e.currentTarget).t)}
      style={{ cursor: onSeek ? "pointer" : "default", touchAction: "pan-y" }}
    >
      <svg width={width} height={height} role="img" aria-label={`Predicted arousal${compact ? "" : " and valence"} over time for ${an.name}`}>
        {panels.map((p, pi) => {
          const top = M.top + pi * (panelH + GAP);
          const y = linear(p.domain, [top + panelH, top]);
          const ys = p.data.map((v) => y(v));
          const line = linePath(xs, ys);
          const yTicks: number[] = [];
          for (let v = p.domain[0]; v <= p.domain[1]; v++) yTicks.push(v);
          const base = y(Math.max(p.domain[0], Math.min(p.domain[1], p.key === "valence" ? 5 : p.domain[0])));
          const area = `${line}L${xs[xs.length - 1].toFixed(1)},${base.toFixed(1)}L${xs[0].toFixed(1)},${base.toFixed(1)}Z`;
          const color = mainColor(p.color);
          return (
            <g key={p.key}>
              <text x={M.left} y={top - 9} className="axis-title">
                {p.label}
                <tspan fill="var(--muted)" fontWeight={400} dx={8}>
                  {p.sub}
                </tspan>
              </text>
              {yTicks.map((v) => (
                <g key={v}>
                  <line className={v === 5 ? "gridline midline" : "gridline"} x1={M.left} x2={M.left + innerW} y1={y(v)} y2={y(v)} />
                  {(yTicks.length <= 5 || v % 2 === 1) && (
                    <text x={M.left - 8} y={y(v) + 3.5} textAnchor="end">
                      {v}
                    </text>
                  )}
                </g>
              ))}
              {!other && <path d={area} fill={p.color} opacity={0.12} />}
              {p.otherData && <path d={linePath(oxs, p.otherData.map((v) => y(v)))} fill="none" stroke="var(--third)" strokeWidth={2} strokeLinejoin="round" />}
              <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {p.key === "arousal" &&
                !other &&
                moments
                  .filter((m) => m.kind === "peak" || m.kind === "low")
                  .map((m) => {
                    const i = an.windows.findIndex((w) => w.t === m.t);
                    if (i < 0) return null;
                    const above = m.kind === "peak";
                    const anchor = xs[i] > M.left + innerW - 40 ? "end" : xs[i] < M.left + 40 ? "start" : "middle";
                    return (
                      <g key={m.kind}>
                        <circle cx={xs[i]} cy={ys[i]} r={4.5} fill={p.color} stroke="var(--surface)" strokeWidth={2} />
                        <text x={xs[i]} y={ys[i] + (above ? -10 : 18)} textAnchor={anchor} style={{ fill: "var(--text-2)", fontWeight: 500 }}>
                          {above ? "peak" : "low"} {p.data[i].toFixed(1)}
                        </text>
                      </g>
                    );
                  })}
              {hi != null && <circle cx={xs[hi]} cy={ys[hi]} r={4.5} fill={color} stroke="var(--surface)" strokeWidth={2} />}
              {ho != null && p.otherData && <circle cx={oxs[ho]} cy={y(p.otherData[ho])} r={4.5} fill="var(--third)" stroke="var(--surface)" strokeWidth={2} />}
            </g>
          );
        })}
        {tt.map((t) => (
          <text key={t} x={x(t)} y={height - 8} textAnchor={t === 0 ? "start" : "middle"}>
            {fmtTime(t)}
          </text>
        ))}
        {time != null && time > 0 && <line className="playhead" x1={x(time)} x2={x(time)} y1={M.top - 4} y2={height - M.bottom + 2} />}
        {hx != null && <line className="crosshair" x1={hx} x2={hx} y1={M.top - 4} y2={height - M.bottom + 2} />}
      </svg>
      {hover != null && hx != null && (hi != null || ho != null) && (
        <div className="tooltip" style={flip ? { right: width - hx + 12, top: M.top } : { left: hx + 12, top: M.top }}>
          <div className="tt-title">{fmtTime(hover)}</div>
          {other ? (
            <>
              {(["arousal", "valence"] as const).map((k) => (
                <div key={k} style={{ marginTop: k === "valence" ? 5 : 0 }}>
                  <div className="tiny muted" style={{ textTransform: "capitalize" }}>
                    {k}
                  </div>
                  <div className="tt-row">
                    <span>
                      <i className="swatch" style={{ background: "var(--text)" }} />A
                    </span>
                    <b>{hi != null ? an[k][hi].toFixed(1) : "–"}</b>
                  </div>
                  <div className="tt-row">
                    <span>
                      <i className="swatch" style={{ background: "var(--third)" }} />B
                    </span>
                    <b>{ho != null ? other[k][ho].toFixed(1) : "–"}</b>
                  </div>
                </div>
              ))}
            </>
          ) : (
            hi != null && (
              <>
                <div className="tt-row">
                  <span>
                    <i className="swatch" style={{ background: "var(--arousal)" }} />
                    Arousal
                  </span>
                  <b>{an.arousal[hi].toFixed(1)}</b>
                </div>
                {!compact && (
                  <div className="tt-row">
                    <span>
                      <i className="swatch" style={{ background: "var(--valence)" }} />
                      Valence
                    </span>
                    <b>{an.valence[hi].toFixed(1)}</b>
                  </div>
                )}
                <div className="tt-row" style={{ marginTop: 4 }}>
                  <span>Mood</span>
                  <b>{QUADRANTS[quadrantOf(an.arousal[hi], an.valence[hi])].label}</b>
                </div>
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}
