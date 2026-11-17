interface DivergingRow {
  label: string;
  value: number;
  hint?: string;
}

/** Horizontal bars growing left/right from a shared zero line. */
export function DivergingBars({ rows, color, digits = 2, signed = true }: { rows: DivergingRow[]; color: string; digits?: number; signed?: boolean }) {
  const max = Math.max(0.001, ...rows.map((r) => Math.abs(r.value)));
  return (
    <div>
      {rows.map((r) => {
        const w = (Math.abs(r.value) / max) * 50;
        return (
          <div className="hbar-row" key={r.label} title={r.hint}>
            <span className="lbl">{r.label}</span>
            <div className="hbar-track">
              <i className="hbar-zero" style={{ left: "50%" }} />
              <i className="hbar-fill" style={{ background: color, left: r.value >= 0 ? "50%" : `${50 - w}%`, width: `${w}%` }} />
            </div>
            <span className="val">
              {signed && r.value > 0 ? "+" : ""}
              {r.value.toFixed(digits).replace("-", "−")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface ShareRow {
  label: string;
  value: number;
  hint?: string;
  emphasis?: boolean;
}

/** Plain magnitude bars, 0..max, with the value printed at the end of each row. */
export function ShareBars({ rows, color, max, format }: { rows: ShareRow[]; color: string; max?: number; format: (v: number) => string }) {
  const top = max ?? Math.max(0.001, ...rows.map((r) => r.value));
  return (
    <div>
      {rows.map((r) => (
        <div className="hbar-row" key={r.label} title={r.hint}>
          <span className="lbl" style={r.emphasis ? { color: "var(--text)", fontWeight: 600 } : undefined}>
            {r.label}
          </span>
          <div className="hbar-track">
            <i className="hbar-fill" style={{ background: color, left: 0, width: `${Math.max(0, (r.value / top) * 100)}%`, opacity: r.emphasis === false ? 0.45 : 1 }} />
          </div>
          <span className="val">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}
