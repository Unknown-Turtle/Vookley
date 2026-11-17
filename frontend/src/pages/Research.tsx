import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DivergingBars, ShareBars } from "../components/Bars";
import { Scatter } from "../components/charts/Scatter";
import { AUDIO_FEATURES, DEAM, FEATURE_META, TRIBE_FEATURES, type FeatureKey } from "../lib/deam";
import { useDocumentTitle } from "../lib/hooks";
import { getModels } from "../lib/model";
import { pearson } from "../lib/stats";
import validationPng from "../assets/results/deam_validation.png";
import axesPng from "../assets/results/Vanished_emotion_axes.png";
import heatmapPng from "../assets/results/Vanished_heatmap.png";
import activationPng from "../assets/results/Vanished_activation_over_time.png";

type Target = "arousal" | "valence";
const ALL_FEATURES: FeatureKey[] = [...AUDIO_FEATURES, ...TRIBE_FEATURES];
const signed = (v: number, d = 3) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}`;

export function Research() {
  useDocumentTitle("Research");
  const m = getModels();
  const [target, setTarget] = useState<Target>("arousal");
  const [feature, setFeature] = useState<FeatureKey>("centroid");

  const audio = m[target].cv;
  const both = target === "arousal" ? m.arousalWithTribe : m.valenceWithTribe;
  const delta = both.r2 - audio.r2;
  const color = target === "arousal" ? "var(--arousal)" : "var(--valence)";
  const y = useMemo(() => DEAM.map((r) => r[target]), [target]);

  const univariate = useMemo(
    () => ALL_FEATURES.map((k) => ({ key: k, r: pearson(DEAM.map((row) => row[k]), y) })),
    [y],
  );

  return (
    <div className="container page stack" style={{ ["--gap" as string]: "56px" }}>
      <header className="stack" style={{ ["--gap" as string]: "14px", maxWidth: 820 }}>
        <p className="eyebrow">Research</p>
        <h1 className="display h-page">
          We tested whether a brain model beats plain audio. <em>It doesn't.</em>
        </h1>
        <p className="lede">
          Vookley started as a bet that Meta's TRIBE model, which predicts fMRI activity from sound, could forecast how a track makes people feel. On 176
          human-rated songs, five cheap audio measurements explain about {Math.round(m.arousal.cv.r2 * 100)}% of the variation in rated arousal. Adding
          TRIBE's predicted brain activity on top adds nothing. So the product runs on the part that works.
        </p>
      </header>

      <section className="grid cols-4" aria-label="Headline results">
        <div className="tile">
          <div className="tile-label">Songs with human ratings</div>
          <div className="tile-value">{DEAM.length}</div>
          <div className="tile-foot">DEAM dataset, 45-second excerpts</div>
        </div>
        <div className="tile">
          <div className="tile-label">Audio only, arousal R²</div>
          <div className="tile-value">{m.arousal.cv.r2.toFixed(2)}</div>
          <div className="tile-foot">5-fold cross-validated</div>
        </div>
        <div className="tile">
          <div className="tile-label">Audio + TRIBE, arousal R²</div>
          <div className="tile-value">{m.arousalWithTribe.r2.toFixed(2)}</div>
          <div className="tile-foot">{signed(m.arousalWithTribe.r2 - m.arousal.cv.r2)} from adding TRIBE</div>
        </div>
        <div className="tile">
          <div className="tile-label">Audio only, valence R²</div>
          <div className="tile-value">{m.valence.cv.r2.toFixed(2)}</div>
          <div className="tile-foot">{signed(m.valenceWithTribe.r2 - m.valence.cv.r2)} from adding TRIBE</div>
        </div>
      </section>

      <section className="stack" style={{ ["--gap" as string]: "18px" }}>
        <div>
          <h2 className="display h-section">The pipeline we tested</h2>
          <p className="lede" style={{ marginTop: 10 }}>
            Two stages, run in separate Python environments. The second stage is reverse inference: reading a mental state off an activation pattern, which
            is lossy even with real brain data.
          </p>
        </div>
        <div className="pipeline">
          <div>
            <b>Audio in</b>A track, audio only. TRIBE's text and video inputs are switched off.
          </div>
          <div>
            <b>TRIBE brain map</b>Predicted fMRI activity on the fsaverage5 cortical surface: 20,484 vertices, once per second.
          </div>
          <div>
            <b>Neurosynth match</b>Term maps for fear, reward, arousal and others are projected to the same surface and correlated with each second.
          </div>
          <div>
            <b>Emotion axes</b>Term scores collapse into arousal, and a valence proxy (reward and pleasure minus fear, pain, disgust, sadness).
          </div>
        </div>
      </section>

      <section className="stack" style={{ ["--gap" as string]: "18px" }}>
        <div className="spread" style={{ alignItems: "flex-end" }}>
          <div style={{ maxWidth: 720 }}>
            <h2 className="display h-section">The deciding test</h2>
            <p className="lede" style={{ marginTop: 10 }}>
              A single correlation can't settle this, because a brain model could simply be re-measuring loudness. The fair question is incremental: does
              audio <em style={{ fontStyle: "normal", color: "var(--text)", fontWeight: 600 }}>plus</em> TRIBE predict human ratings better than audio alone, on
              songs neither model saw?
            </p>
          </div>
          <div className="seg" role="group" aria-label="Rating to predict">
            <button aria-pressed={target === "arousal"} onClick={() => setTarget("arousal")}>
              Arousal
            </button>
            <button aria-pressed={target === "valence"} onClick={() => setTarget("valence")}>
              Valence
            </button>
          </div>
        </div>

        <div className="grid cols-2">
          <div className="card">
            <div className="card-head">
              <div>
                <h3 className="h-card">Cross-validated R², {target}</h3>
                <p className="card-sub">Share of rating variance explained on held-out songs. Higher is better; 1.0 would be perfect.</p>
              </div>
            </div>
            <ShareBars
              color="var(--text-2)"
              max={Math.max(0.6, audio.r2, both.r2)}
              format={(v) => v.toFixed(3)}
              rows={[
                { label: "Audio only", value: audio.r2, hint: "RMS, spectral centroid, spectral flux, zero-crossing rate, onset rate" },
                { label: "Audio + TRIBE", value: both.r2, hint: "The same five features plus TRIBE activation magnitude and TRIBE arousal readout" },
              ]}
            />
            <p className="small dim" style={{ marginTop: 12 }}>
              Adding TRIBE changes R² by <b className="num" style={{ color: "var(--text)" }}>{signed(delta)}</b>.{" "}
              {delta <= 0.01 ? "That is no improvement: the extra features only give the model more ways to overfit." : "A small gain, inside fold-to-fold noise."}
            </p>
            <p className="tiny muted" style={{ marginTop: 8 }}>
              Recomputed in your browser just now from the published feature table, using 20 repeats of shuffled 5-fold ridge regression. The original Python
              run reported 0.361 and 0.351 for arousal; the small gap is down to different fold splits.
            </p>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3 className="h-card">Predicted vs. human {target}</h3>
                <p className="card-sub">Audio-only model, each song predicted while held out. On the dashed line means a perfect prediction.</p>
              </div>
            </div>
            <Scatter
              points={DEAM.map((r, i) => ({ x: audio.oof[i], y: r[target], label: `DEAM song ${r.id}` }))}
              xLabel="Predicted"
              yLabel="Human rating"
              color={color}
              identity
              height={280}
            />
            <p className="tiny muted" style={{ marginTop: 6 }}>
              Typical miss: ±{audio.rmse.toFixed(2)} points on the 1–9 scale. Predictions bunch toward the middle, so extremes are understated.
            </p>
          </div>
        </div>
      </section>

      <section className="stack" style={{ ["--gap" as string]: "18px" }}>
        <div style={{ maxWidth: 720 }}>
          <h2 className="display h-section">Look at the data yourself</h2>
          <p className="lede" style={{ marginTop: 10 }}>
            Every dot is one song. Pick a measurement and see how it lines up with what listeners reported.
          </p>
        </div>
        <div className="grid cols-2">
          <div className="card">
            <div className="card-head">
              <div className="row">
                <select className="select" value={feature} onChange={(e) => setFeature(e.target.value as FeatureKey)} aria-label="Measurement">
                  <optgroup label="Audio features">
                    {AUDIO_FEATURES.map((k) => (
                      <option key={k} value={k}>
                        {FEATURE_META[k].label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="TRIBE features">
                    {TRIBE_FEATURES.map((k) => (
                      <option key={k} value={k}>
                        {FEATURE_META[k].label}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <span className="chip chip-accent num">r = {signed(univariate.find((u) => u.key === feature)!.r, 2)}</span>
              </div>
            </div>
            <Scatter
              points={DEAM.map((r) => ({ x: r[feature], y: r[target], label: `DEAM song ${r.id}` }))}
              xLabel={FEATURE_META[feature].short}
              yLabel={`Human ${target}`}
              color={color}
              height={320}
            />
            <p className="small dim" style={{ marginTop: 6 }}>
              {FEATURE_META[feature].blurb}
            </p>
          </div>

          <div className="stack">
            <div className="card">
              <div className="card-head">
                <div>
                  <h3 className="h-card">Correlation with human {target}, one feature at a time</h3>
                  <p className="card-sub">Pearson r across all {DEAM.length} songs.</p>
                </div>
              </div>
              <DivergingBars color={color} rows={univariate.map((u) => ({ label: FEATURE_META[u.key].short, value: u.r, hint: FEATURE_META[u.key].blurb }))} />
            </div>
            <div className="card">
              <div className="card-head">
                <div>
                  <h3 className="h-card">What the shipped model weighs</h3>
                  <p className="card-sub">Rating points per standard deviation of each feature, audio-only ridge model.</p>
                </div>
              </div>
              <DivergingBars color={color} rows={AUDIO_FEATURES.map((k, j) => ({ label: FEATURE_META[k].short, value: m[target].model.weights[j], hint: FEATURE_META[k].blurb }))} />
              <p className="tiny muted" style={{ marginTop: 8 }}>
                Features overlap (loud music is usually bright and busy too), so individual weights can look smaller or flip sign compared with the one-at-a-time
                correlations above.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="stack" style={{ ["--gap" as string]: "18px" }}>
        <div style={{ maxWidth: 720 }}>
          <h2 className="display h-section">Original figures</h2>
          <p className="lede" style={{ marginTop: 10 }}>Straight from the Python pipeline in this repository, unedited.</p>
        </div>
        <div className="grid cols-2">
          <figure className="figure card">
            <img src={validationPng} alt="Three panels: loudness against arousal, TRIBE readout against arousal, and R² bars for audio versus audio plus TRIBE" loading="lazy" />
            <figcaption>The validation plot. Loudness tracks arousal; the TRIBE readout barely does; the two R² bars are level.</figcaption>
          </figure>
          <figure className="figure card">
            <img src={axesPng} alt="Predicted arousal and valence over time for one track from the TRIBE and Neurosynth pipeline" loading="lazy" />
            <figcaption>One track through the full brain pipeline. The arousal line shadows overall activation magnitude closely.</figcaption>
          </figure>
          <figure className="figure card">
            <img src={heatmapPng} alt="Heatmap of predicted activation for every cortical vertex over time for one track" loading="lazy" />
            <figcaption>The raw TRIBE output for the same track: predicted activation at each of 20,484 cortical vertices, second by second.</figcaption>
          </figure>
          <figure className="figure card">
            <img src={activationPng} alt="Predicted cortical activation magnitude over time for one track" loading="lazy" />
            <figcaption>Predicted activation magnitude over time.</figcaption>
          </figure>
        </div>
      </section>

      <section className="grid cols-2">
        <div className="stack prose">
          <h2 className="display h-section" style={{ color: "var(--text)" }}>
            What this does and doesn't show
          </h2>
          <p>
            <strong>It is one dataset and one sample.</strong> 176 clips of Western popular music, rated by crowd workers. A different genre mix or a larger
            sample could shift the numbers.
          </p>
          <p>
            <strong>TRIBE was run audio-only.</strong> Its language and video pathways were off, so anything carried by lyrics or visuals was never in play.
          </p>
          <p>
            <strong>A raw readout was flat too.</strong> Activation magnitude without any Neurosynth mapping also failed to help, which makes a wiring mistake
            in the emotion mapping an unlikely explanation.
          </p>
          <p>
            <strong>The audio model is modest.</strong> Explaining roughly a third of arousal variance is useful for spotting where energy rises and falls. It
            is not precise enough to rank two similar mixes.
          </p>
        </div>
        <div className="card stack" style={{ alignSelf: "start" }}>
          <h3 className="h-card">Reproduce it</h3>
          <p className="small dim">
            The feature table behind every number on this page is <code>results/deam_validation_features.csv</code>. The scripts that built it are{" "}
            <code>deam_tribe_batch.py</code> and <code>deam_validate.py</code>.
          </p>
          <div className="row">
            <a className="btn btn-sm" href="https://github.com/unknown-turtle/vookley" target="_blank" rel="noreferrer">
              View the repository
            </a>
            <Link className="btn btn-sm btn-primary" to="/analyze">
              Try the audio model
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
