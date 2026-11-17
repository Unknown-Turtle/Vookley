import { useMemo } from "react";
import { fmtTime, levelName, type Analysis, type Section } from "../lib/analysis";
import { Pause, Play } from "./Icons";

interface Props {
  an: Analysis;
  time: number;
  playing: boolean;
  ready: boolean;
  onToggle: () => void;
  onSeek: (t: number) => void;
  sections: Section[];
}

export function Player({ an, time, playing, ready, onToggle, onSeek, sections }: Props) {
  const path = useMemo(() => {
    const n = an.waveform.length;
    const peak = Math.max(0.05, ...an.waveform);
    let d = "";
    for (let i = 0; i < n; i += 2) {
      const h = Math.max(0.6, (Math.max(an.waveform[i], an.waveform[i + 1] ?? 0) / peak) * 30);
      d += `M${i + 1},${32 - h}V${32 + h}`;
    }
    return d;
  }, [an.waveform]);
  const n = an.waveform.length;
  const frac = Math.min(1, time / an.duration);
  const clipId = `played-${an.id}`;

  const seekFrom = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(((e.clientX - r.left) / r.width) * an.duration);
  };

  return (
    <div>
      <div className="player">
        <button className="play-btn" onClick={onToggle} disabled={!ready} aria-label={playing ? "Pause" : "Play"}>
          {playing ? <Pause width={22} height={22} /> : <Play width={22} height={22} />}
        </button>
        <div
          className="wave"
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(an.duration)}
          aria-valuenow={Math.round(time)}
          aria-valuetext={`${fmtTime(time)} of ${fmtTime(an.duration)}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            seekFrom(e);
          }}
          onPointerMove={(e) => e.buttons === 1 && seekFrom(e)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") onSeek(time + 5);
            else if (e.key === "ArrowLeft") onSeek(time - 5);
            else if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              onToggle();
            }
          }}
        >
          <svg viewBox={`0 0 ${n} 64`} preserveAspectRatio="none">
            <defs>
              <clipPath id={clipId}>
                <rect x={0} y={0} width={n * frac} height={64} />
              </clipPath>
            </defs>
            <path d={path} stroke="var(--border-strong)" strokeWidth={1.200} />
            <path d={path} stroke="var(--arousal)" strokeWidth={1.200} clipPath={`url(#${clipId})`} />
          </svg>
        </div>
        <div className="mono small" style={{ flex: "none", textAlign: "right", minWidth: 84 }}>
          {fmtTime(time)} <span className="muted">/ {fmtTime(an.duration)}</span>
        </div>
      </div>
      {sections.length > 1 && (
        <div className="sections" aria-label="Energy sections">
          {sections.map((s, i) => (
            <button
              key={i}
              style={{ flex: Math.max(1, s.end - s.start), ["--mix" as string]: `${[10, 34, 62][s.level]}%` }}
              onClick={() => onSeek(s.start)}
              title={`${fmtTime(s.start)}–${fmtTime(s.end)} · ${levelName(s.level)} energy (avg ${s.mean.toFixed(1)})`}
            >
              {levelName(s.level)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
