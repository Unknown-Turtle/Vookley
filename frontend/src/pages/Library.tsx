import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sparkline } from "../components/charts/Sparkline";
import { Compare, Trash } from "../components/Icons";
import { fmtTime, QUADRANTS, quadrantOf } from "../lib/analysis";
import { useDocumentTitle } from "../lib/hooks";
import { library, useLibrary } from "../lib/store";

export function Library() {
  useDocumentTitle("Library");
  const items = useLibrary();
  const navigate = useNavigate();
  const [picked, setPicked] = useState<string[]>([]);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2)));
  const valid = picked.filter((id) => items.some((a) => a.id === id));

  return (
    <div className="container page stack" style={{ ["--gap" as string]: "24px" }}>
      <header className="spread" style={{ alignItems: "flex-end" }}>
        <div className="stack" style={{ ["--gap" as string]: "10px" }}>
          <p className="eyebrow">Library</p>
          <h1 className="display h-page">Your analyses</h1>
          <p className="dim">Saved in this browser only. Audio files are never stored.</p>
        </div>
        {items.length > 0 && (
          <div className="row">
            <button className="btn" disabled={valid.length !== 2} onClick={() => navigate(`/compare/${valid[0]}/${valid[1]}`)}>
              <Compare width={16} height={16} /> {valid.length === 2 ? "Compare selected" : `Select ${2 - valid.length} to compare`}
            </button>
            <button
              className="btn btn-ghost btn-danger"
              onClick={() => {
                if (confirm(`Delete all ${items.length} saved analyses? This can't be undone.`)) {
                  library.clear();
                  setPicked([]);
                }
              }}
            >
              Clear all
            </button>
          </div>
        )}
      </header>

      {items.length === 0 ? (
        <div className="empty stack">
          <h2 className="display h-section">Nothing here yet</h2>
          <p>Analyze a track and it will show up here so you can revisit and compare versions.</p>
          <p>
            <Link className="btn btn-primary" to="/analyze">
              Analyze a track
            </Link>
          </p>
        </div>
      ) : (
        <div className="grid cols-3">
          {items.map((a) => {
            const q = QUADRANTS[quadrantOf(a.overall.arousal, a.overall.valence)];
            return (
              <article key={a.id} className={`card lib-card${valid.includes(a.id) ? " selected" : ""}`}>
                <Link className="cover" to={`/track/${a.id}`} aria-label={`Open report for ${a.name}`} />
                <div className="spread" style={{ flexWrap: "nowrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="lib-title">{a.name}</div>
                    <div className="tiny muted">
                      {fmtTime(a.duration)} · {new Date(a.createdAt).toLocaleDateString()} {a.source === "demo" && "· demo"}
                    </div>
                  </div>
                  <span className="chip">{q.label}</span>
                </div>
                <Sparkline values={a.arousal} />
                <div className="spread small">
                  <span className="dim num">
                    Arousal <b style={{ color: "var(--text)" }}>{a.overall.arousal.toFixed(1)}</b> · Valence <b style={{ color: "var(--text)" }}>{a.overall.valence.toFixed(1)}</b>
                  </span>
                </div>
                <div className="spread above">
                  <label className="check">
                    <input type="checkbox" checked={valid.includes(a.id)} onChange={() => toggle(a.id)} /> Compare
                  </label>
                  <button
                    className="btn btn-ghost btn-sm btn-danger"
                    aria-label={`Delete ${a.name}`}
                    onClick={() => {
                      if (confirm(`Delete the report for "${a.name}"?`)) library.remove(a.id);
                    }}
                  >
                    <Trash width={15} height={15} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
