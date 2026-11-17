import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Circumplex } from "../components/charts/Circumplex";
import { Timeline } from "../components/charts/Timeline";
import { fmtTime, insightsFor, QUADRANT_ORDER, QUADRANTS, type Analysis } from "../lib/analysis";
import { useDocumentTitle } from "../lib/hooks";
import { useLibrary } from "../lib/store";

const signed = (v: number, d = 1) => {
  const s = Math.abs(v).toFixed(d);
  return `${Number(s) === 0 ? "" : v > 0 ? "+" : "−"}${s}`;
};

export function ComparePage() {
  const { a = "", b = "" } = useParams();
  const items = useLibrary();
  const navigate = useNavigate();
  const A = items.find((x) => x.id === a);
  const B = items.find((x) => x.id === b);
  useDocumentTitle(A && B ? `${A.name} vs ${B.name}` : "Compare");
  const ia = useMemo(() => (A ? insightsFor(A) : null), [A]);
  const ib = useMemo(() => (B ? insightsFor(B) : null), [B]);

  if (!A || !B || !ia || !ib) {
    return (
      <div className="container page">
        <div className="empty stack">
          <h1 className="display h-section">Pick two analyses to compare</h1>
          <p>One or both of those reports aren't on this device.</p>
          <p>
            <Link className="btn btn-primary" to="/library">
              Open the library
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const picker = (current: Analysis, other: Analysis, slot: "a" | "b") => (
    <select
      className="select"
      style={{ maxWidth: "100%", fontWeight: 600 }}
      aria-label={`Track ${slot.toUpperCase()}`}
      value={current.id}
      onChange={(e) => navigate(slot === "a" ? `/compare/${e.target.value}/${other.id}` : `/compare/${other.id}/${e.target.value}`, { replace: true })}
    >
      {items
        .filter((x) => x.id !== other.id)
        .map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
    </select>
  );

  const rows: { label: string; a: string; b: string; diff: string }[] = [
    { label: "Arousal (energy)", a: A.overall.arousal.toFixed(1), b: B.overall.arousal.toFixed(1), diff: signed(B.overall.arousal - A.overall.arousal) },
    { label: "Valence (positivity)", a: A.overall.valence.toFixed(1), b: B.overall.valence.toFixed(1), diff: signed(B.overall.valence - A.overall.valence) },
    { label: "Energy swing", a: ia.range.toFixed(1), b: ib.range.toFixed(1), diff: signed(ib.range - ia.range) },
    { label: "Overall mood", a: QUADRANTS[ia.quadrant].label, b: QUADRANTS[ib.quadrant].label, diff: "" },
    { label: "Arc", a: ia.shape, b: ib.shape, diff: "" },
    { label: "Length", a: fmtTime(A.duration), b: fmtTime(B.duration), diff: "" },
    ...QUADRANT_ORDER.map((q) => ({
      label: `Time in ${QUADRANTS[q].label.toLowerCase()}`,
      a: `${Math.round(ia.shares[q] * 100)}%`,
      b: `${Math.round(ib.shares[q] * 100)}%`,
      diff: `${signed((ib.shares[q] - ia.shares[q]) * 100, 0)} pts`,
    })),
  ];

  const dA = B.overall.arousal - A.overall.arousal;
  const summary =
    Math.abs(dA) < 0.25
      ? "The two land at about the same overall energy."
      : `${dA > 0 ? B.name : A.name} is the more energetic of the two, by ${Math.abs(dA).toFixed(1)} points.`;

  return (
    <div className="container page stack fade-in" style={{ ["--gap" as string]: "20px" }}>
      <header className="stack" style={{ ["--gap" as string]: "12px" }}>
        <p className="eyebrow">Compare</p>
        <h1 className="display h-page">Side by side</h1>
        <p className="lede">{summary} The difference is within the model's typical error if it is under about one point, so read small gaps as a tie.</p>
        <div className="row" style={{ gap: 16 }}>
          <span className="row" style={{ gap: 8, flexWrap: "nowrap", minWidth: 0 }}>
            <i className="swatch" style={{ background: "var(--text)" }} />
            <span className="muted small">A</span>
            {picker(A, B, "a")}
          </span>
          <span className="row" style={{ gap: 8, flexWrap: "nowrap", minWidth: 0 }}>
            <i className="swatch" style={{ background: "var(--third)" }} />
            <span className="muted small">B</span>
            {picker(B, A, "b")}
          </span>
        </div>
      </header>

      <div className="report-grid">
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="h-card">Arcs overlaid</h2>
              <p className="card-sub">Both tracks on the same clock, starting together at 0:00.</p>
            </div>
            <div className="legend">
              <span>
                <i className="swatch" style={{ background: "var(--text)" }} />A · {A.name}
              </span>
              <span>
                <i className="swatch" style={{ background: "var(--third)" }} />B · {B.name}
              </span>
            </div>
          </div>
          <Timeline an={A} other={B} />
        </section>
        <section className="card">
          <div className="card-head">
            <h2 className="h-card">Mood map</h2>
          </div>
          <Circumplex an={A} other={B} />
        </section>
      </div>

      <section className="card" style={{ overflowX: "auto" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Measure</th>
              <th>A · {A.name}</th>
              <th>B · {B.name}</th>
              <th>B − A</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td style={{ textTransform: "capitalize" }}>{r.a}</td>
                <td style={{ textTransform: "capitalize" }}>{r.b}</td>
                <td className="dim">{r.diff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="row">
        <Link className="btn" to={`/track/${A.id}`}>
          Open report A
        </Link>
        <Link className="btn" to={`/track/${B.id}`}>
          Open report B
        </Link>
      </div>
    </div>
  );
}
