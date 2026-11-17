import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DivergingBars, ShareBars } from "../components/Bars";
import { Circumplex } from "../components/charts/Circumplex";
import { Spectrum } from "../components/charts/Spectrum";
import { Timeline } from "../components/charts/Timeline";
import { Arrow, Compare, Download, Trash } from "../components/Icons";
import { Player } from "../components/Player";
import { download, fmtTime, insightsFor, QUADRANT_ORDER, QUADRANTS, toCsv, type Analysis, type QuadrantKey } from "../lib/analysis";
import { FEATURE_META } from "../lib/deam";
import { useAudio, useDocumentTitle } from "../lib/hooks";
import { contributions, getModels } from "../lib/model";
import { attachAudio, audioUrlFor, restoreDemoAudio } from "../lib/pipeline";
import { library, useLibrary } from "../lib/store";

const ordinal = (frac: number) => `${Math.round(frac * 100)}%`;

export function Report() {
  const { id = "" } = useParams();
  const items = useLibrary();
  const an = items.find((a) => a.id === id);
  if (!an) return <Missing />;
  return <ReportBody key={an.id} an={an} others={items.filter((a) => a.id !== an.id)} />;
}

function Missing() {
  useDocumentTitle("Not found");
  return (
    <div className="container page">
      <div className="empty stack">
        <h1 className="display h-section">That analysis isn't on this device</h1>
        <p>Reports are stored in this browser only, so links don't travel between devices.</p>
        <p>
          <Link className="btn btn-primary" to="/analyze">
            Analyze a track
          </Link>
        </p>
      </div>
    </div>
  );
}

function ReportBody({ an, others }: { an: Analysis; others: Analysis[] }) {
  useDocumentTitle(an.name);
  const navigate = useNavigate();
  const ins = useMemo(() => insightsFor(an), [an]);
  const models = getModels();
  const [src, setSrc] = useState(() => audioUrlFor(an.id));
  const audio = useAudio(src, an.duration);
  const [target, setTarget] = useState<"arousal" | "valence">("arousal");
  const [intent, setIntent] = useState<QuadrantKey | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let live = true;
    if (!src && an.source === "demo") void restoreDemoAudio(an).then((u) => live && u && setSrc(u));
    return () => {
      live = false;
    };
  }, [an, src]);

  const contrib = useMemo(() => contributions(an.clip, target), [an, target]);
  const slug = an.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "track";
  const seekAndPlay = (t: number) => audio.seek(t);

  return (
    <div className="container page stack fade-in" style={{ ["--gap" as string]: "20px" }}>
      <header className="stack" style={{ ["--gap" as string]: "8px" }}>
        <div className="spread">
          <p className="eyebrow">
            Report · {fmtTime(an.duration)} · {an.source === "demo" ? "demo track" : "your upload"} · {new Date(an.createdAt).toLocaleDateString()}
          </p>
          <div className="row" style={{ gap: 8 }}>
            {others.length > 0 && (
              <select
                className="select"
                aria-label="Compare with another track"
                value=""
                onChange={(e) => e.target.value && navigate(`/compare/${an.id}/${e.target.value}`)}
              >
                <option value="">Compare with…</option>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
            <button className="btn btn-sm" onClick={() => download(`${slug}-vookley.csv`, toCsv(an), "text/csv")}>
              <Download width={15} height={15} /> CSV
            </button>
            <button className="btn btn-sm" onClick={() => download(`${slug}-vookley.json`, JSON.stringify({ ...an, insights: ins }, null, 2), "application/json")}>
              <Download width={15} height={15} /> JSON
            </button>
            <button
              className="btn btn-sm btn-danger"
              aria-label="Delete this report"
              onClick={() => {
                if (confirm(`Delete the report for "${an.name}"?`)) {
                  library.remove(an.id);
                  navigate("/library");
                }
              }}
            >
              <Trash width={15} height={15} />
            </button>
          </div>
        </div>
        <input className="title-input" aria-label="Track name" defaultValue={an.name} onBlur={(e) => library.rename(an.id, e.target.value.trim() || an.name)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
        <p className="lede">
          {ins.headline}. {ins.shapeText}
        </p>
      </header>

      <section className="grid cols-4" aria-label="Summary">
        <div className="tile">
          <div className="tile-label">Arousal (energy)</div>
          <div className="tile-value">
            {an.overall.arousal.toFixed(1)}
            <small>/ 9</small>
          </div>
          <div className="tile-foot">Higher than {ordinal(ins.arousalPct)} of reference songs</div>
        </div>
        <div className="tile">
          <div className="tile-label">Valence (positivity)</div>
          <div className="tile-value">
            {an.overall.valence.toFixed(1)}
            <small>/ 9</small>
          </div>
          <div className="tile-foot">Higher than {ordinal(ins.valencePct)} of reference songs</div>
        </div>
        <div className="tile">
          <div className="tile-label">Overall mood</div>
          <div className="tile-value word">{QUADRANTS[ins.quadrant].label}</div>
          <div className="tile-foot">{QUADRANTS[ins.quadrant].blurb}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Arc</div>
          <div className="tile-value word" style={{ textTransform: "capitalize" }}>
            {ins.shape}
          </div>
          <div className="tile-foot">{ins.range.toFixed(1)}-point swing in energy</div>
        </div>
      </section>

      <div className="report-grid">
        <div className="stack">
          <section className="card">
            <Player an={an} time={audio.time} playing={audio.playing} ready={audio.ready} onToggle={audio.toggle} onSeek={audio.seek} sections={ins.sections} />
            {!audio.ready && an.source === "upload" && (
              <p className="small muted" style={{ marginTop: 12 }}>
                Audio isn't kept between visits.{" "}
                <button className="link" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={() => fileInput.current?.click()}>
                  Choose the file again
                </button>{" "}
                to listen along.
                <input ref={fileInput} type="file" accept="audio/*" hidden onChange={(e) => e.target.files?.[0] && setSrc(attachAudio(an.id, e.target.files[0]))} />
              </p>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="h-card">Emotional arc</h2>
                <p className="card-sub">Predicted listener ratings on a 1–9 scale, from a 10-second window around each second. Click to jump there.</p>
              </div>
            </div>
            <Timeline an={an} time={audio.time} onSeek={seekAndPlay} moments={ins.moments} />
            <p className="tiny muted" style={{ marginTop: 10 }}>
              Typical error against human ratings: ±{models.arousal.cv.rmse.toFixed(1)} points for arousal, ±{models.valence.cv.rmse.toFixed(1)} for valence. Trust
              the shape more than any single value.
            </p>
          </section>

          {ins.moments.length > 0 && (
            <section className="card">
              <div className="card-head">
                <h2 className="h-card">Key moments</h2>
              </div>
              <ul className="moments">
                {ins.moments.map((m) => (
                  <li key={m.kind}>
                    <button className="moment" onClick={() => seekAndPlay(m.t)}>
                      <span className="mono">{fmtTime(m.t)}</span>
                      <b>{m.title}</b>
                      <span className="d">{m.detail}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="h-card">Spectral texture</h2>
                <p className="card-sub">Where the sound's energy sits across the frequency range, second by second.</p>
              </div>
            </div>
            <Spectrum an={an} time={audio.time} />
          </section>
        </div>

        <aside className="stack">
          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="h-card">Mood map</h2>
                <p className="card-sub">This track's path, over 176 human-rated songs.</p>
              </div>
            </div>
            <Circumplex an={an} time={audio.time} />
            <div className="legend" style={{ marginTop: 8 }}>
              <span>
                <i className="swatch" style={{ background: "var(--arousal)", borderRadius: 99 }} />
                This track
              </span>
              <span>
                <i className="swatch" style={{ background: "var(--ref-dot)", borderRadius: 99 }} />
                Reference songs
              </span>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="h-card">Does it match your intent?</h2>
                <p className="card-sub">Pick the mood you were going for.</p>
              </div>
            </div>
            <div className="seg" role="group" aria-label="Intended mood">
              {QUADRANT_ORDER.map((q) => (
                <button key={q} aria-pressed={intent === q} onClick={() => setIntent(intent === q ? null : q)} title={QUADRANTS[q].hint}>
                  {QUADRANTS[q].label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <ShareBars
                color="var(--arousal)"
                max={1}
                format={ordinal}
                rows={QUADRANT_ORDER.map((q) => ({ label: QUADRANTS[q].label, value: ins.shares[q], hint: QUADRANTS[q].blurb, emphasis: intent ? intent === q : undefined }))}
              />
            </div>
            <p className="small dim" style={{ marginTop: 10 }}>
              {intent ? intentVerdict(intent, ins.shares[intent], ins.quadrant) : "Share of the track's running time spent in each mood."}
            </p>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="h-card">What's driving the score</h2>
                <p className="card-sub">Points each measurement adds or removes, relative to an average song.</p>
              </div>
              <div className="seg" role="group" aria-label="Score">
                <button aria-pressed={target === "arousal"} onClick={() => setTarget("arousal")}>
                  Arousal
                </button>
                <button aria-pressed={target === "valence"} onClick={() => setTarget("valence")}>
                  Valence
                </button>
              </div>
            </div>
            <DivergingBars
              color={target === "arousal" ? "var(--arousal)" : "var(--valence)"}
              rows={contrib.map((c) => ({ label: FEATURE_META[c.key].short, value: c.points, hint: FEATURE_META[c.key].blurb }))}
            />
            <details className="table-view">
              <summary>Raw measurements</summary>
              <table className="data">
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>Value</th>
                    <th>vs. average</th>
                  </tr>
                </thead>
                <tbody>
                  {contrib.map((c) => (
                    <tr key={c.key}>
                      <td>{FEATURE_META[c.key].short}</td>
                      <td>
                        {an.clip[c.key].toFixed(FEATURE_META[c.key].digits)} {FEATURE_META[c.key].unit}
                      </td>
                      <td>
                        {c.z > 0 ? "+" : "−"}
                        {Math.abs(c.z).toFixed(1)} sd
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>

          <div className="callout">
            <strong>How far to trust this.</strong> The model explains about {Math.round(models.arousal.cv.r2 * 100)}% of the variation in human arousal ratings and{" "}
            {Math.round(models.valence.cv.r2 * 100)}% for valence on songs it has not seen. It was trained on 45-second music clips, so speech and very
            short sounds are outside what it knows.{" "}
            <Link className="link" to="/research">
              See the evidence <Arrow width={13} height={13} style={{ verticalAlign: "-2px" }} />
            </Link>
          </div>
          {others.length > 0 && (
            <Link className="btn" style={{ width: "100%" }} to={`/compare/${an.id}/${others[0].id}`}>
              <Compare width={16} height={16} /> Compare with {others[0].name}
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}

function intentVerdict(intent: QuadrantKey, share: number, overall: QuadrantKey): string {
  const name = QUADRANTS[intent].label.toLowerCase();
  const pct = `${Math.round(share * 100)}%`;
  if (share >= 0.6) return `On target: ${pct} of the running time reads as ${name}.`;
  if (share >= 0.3) return `Partly there: ${pct} reads as ${name}, and the track as a whole lands in ${QUADRANTS[overall].label.toLowerCase()}.`;
  return `Off target: only ${pct} reads as ${name}. Overall it lands in ${QUADRANTS[overall].label.toLowerCase()} (${QUADRANTS[overall].blurb}).`;
}
