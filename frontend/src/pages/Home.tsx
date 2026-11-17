import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Timeline } from "../components/charts/Timeline";
import { Arrow, Compare, Flask, Lock, Wave } from "../components/Icons";
import { insightsFor, type Analysis } from "../lib/analysis";
import { DEAM } from "../lib/deam";
import { useDocumentTitle } from "../lib/hooks";
import { getModels } from "../lib/model";
import { analyseDemo } from "../lib/pipeline";

let heroDemo: Promise<{ an: Analysis; ms: number }> | null = null;
const loadHeroDemo = () => {
  heroDemo ??= (async () => {
    const t0 = performance.now();
    const an = await analyseDemo("drop-and-return", () => {});
    return { an, ms: performance.now() - t0 };
  })();
  return heroDemo;
};

export function Home() {
  useDocumentTitle("");
  const m = getModels();
  const [demo, setDemo] = useState<{ an: Analysis; ms: number } | null>(null);
  useEffect(() => {
    let live = true;
    loadHeroDemo()
      .then((d) => live && setDemo(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const ins = demo ? insightsFor(demo.an) : null;

  return (
    <>
      <section className="container hero">
        <p className="eyebrow">Emotional response, predicted from audio</p>
        <h1 className="display h-hero" style={{ marginTop: 16, maxWidth: "13ch" }}>
          Hear how it will <em>feel</em> before you publish.
        </h1>
        <p className="lede" style={{ marginTop: 22 }}>
          Vookley reads a track and predicts, second by second, how energetic and how positive listeners will rate it. It runs in your browser, and it is
          checked against {DEAM.length} songs rated by real people.
        </p>
        <div className="row hero-cta">
          <Link to="/analyze" className="btn btn-primary btn-lg">
            Analyze a track <Arrow />
          </Link>
          <Link to="/research" className="btn btn-lg">
            See the evidence
          </Link>
        </div>

        <div className="hero-figure">
          <div className="spread" style={{ marginBottom: 10 }}>
            <div>
              <div className="h-card">Demo track: "Drop &amp; Return"</div>
              <div className="card-sub">Opens loud, strips back to almost nothing, then slams in again. Hover the line.</div>
            </div>
            {demo && (
              <span className="chip mono">
                analysed here in {(demo.ms / 1000).toFixed(1)} s
              </span>
            )}
          </div>
          {demo && ins ? <Timeline an={demo.an} moments={ins.moments} compact /> : <div className="skeleton" style={{ height: 218 }} />}
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">What you get</p>
            <h2 className="display h-section" style={{ marginTop: 10 }}>
              A second opinion on the arc you meant to build
            </h2>
          </div>
          <div className="grid cols-3">
            <div className="card feature">
              <Wave width={22} height={22} style={{ color: "var(--accent)", marginBottom: 12 }} />
              <h3>The arc, second by second</h3>
              <p>Predicted arousal and valence across the whole track, with the peak, the low point and the biggest lift and drop marked for you.</p>
            </div>
            <div className="card feature">
              <Compare width={22} height={22} style={{ color: "var(--accent)", marginBottom: 12 }} />
              <h3>Versions, side by side</h3>
              <p>Keep every analysis in a local library and overlay two mixes or edits to see which one actually carries more energy, and where.</p>
            </div>
            <div className="card feature">
              <Lock width={22} height={22} style={{ color: "var(--accent)", marginBottom: 12 }} />
              <h3>Private by construction</h3>
              <p>Decoding and analysis happen on your device. Unreleased music is never uploaded, because there is no server to upload it to.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">How it works</p>
            <h2 className="display h-section" style={{ marginTop: 10 }}>
              Three steps, about a second
            </h2>
          </div>
          <div className="grid cols-3">
            <div className="feature">
              <div className="step-num">1</div>
              <h3>Decode</h3>
              <p>Your file is decoded to mono audio in the tab. MP3, WAV, M4A, FLAC and OGG all work.</p>
            </div>
            <div className="feature">
              <div className="step-num">2</div>
              <h3>Measure</h3>
              <p>Five things are measured in a sliding window: loudness, brightness, spectral movement, noisiness and how often new sounds start.</p>
            </div>
            <div className="feature">
              <div className="step-num">3</div>
              <h3>Predict</h3>
              <p>A small regression model, fitted to human ratings of {DEAM.length} songs, turns those measurements into arousal and valence on a 1–9 scale.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Honest numbers</p>
            <h2 className="display h-section" style={{ marginTop: 10 }}>
              We started with a brain model. The data said keep it simple.
            </h2>
            <p className="lede">
              The original idea was to predict emotion from simulated fMRI activity. When we tested it against human ratings, the brain layer added nothing
              over plain audio features. So Vookley ships the part that held up, and shows you exactly how well it does.
            </p>
          </div>
          <div className="grid cols-3">
            <div className="card">
              <div className="stat-big">{Math.round(m.arousal.cv.r2 * 100)}%</div>
              <p className="dim" style={{ marginTop: 10 }}>
                of the variation in human <b style={{ color: "var(--text)" }}>arousal</b> ratings explained on songs the model had not seen.
              </p>
            </div>
            <div className="card">
              <div className="stat-big">{Math.round(m.valence.cv.r2 * 100)}%</div>
              <p className="dim" style={{ marginTop: 10 }}>
                of the variation in human <b style={{ color: "var(--text)" }}>valence</b> ratings explained, same test.
              </p>
            </div>
            <div className="card">
              <div className="stat-big">{(m.arousalWithTribe.r2 - m.arousal.cv.r2).toFixed(2).replace("-", "−")}</div>
              <p className="dim" style={{ marginTop: 10 }}>
                change in arousal R² from adding the <b style={{ color: "var(--text)" }}>brain model</b>. No gain, so it isn't in the product.
              </p>
            </div>
          </div>
          <p style={{ marginTop: 22 }}>
            <Link to="/research" className="btn">
              <Flask width={16} height={16} /> Explore the validation data
            </Link>
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="cta-band">
            <h2 className="display h-section">
              Find out what your track <em>says</em> before your audience does.
            </h2>
            <p>Free, no account, nothing uploaded. Drop in a file or try one of the built-in demos.</p>
            <Link to="/analyze" className="btn btn-primary btn-lg">
              Analyze a track <Arrow />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
