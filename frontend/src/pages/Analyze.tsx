import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Lock, Upload } from "../components/Icons";
import { DEMOS } from "../lib/demo";
import { useDocumentTitle } from "../lib/hooks";
import { analyseDemo, analyseFile, type Stage } from "../lib/pipeline";
import { library } from "../lib/store";

const STAGE_TEXT: Record<Stage, string> = {
  decoding: "Decoding audio…",
  analysing: "Measuring loudness, brightness and movement…",
  scoring: "Scoring against the reference songs…",
};

export function Analyze() {
  useDocumentTitle("Analyze");
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<{ name: string; stage: Stage; fraction: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (name: string, job: (onProgress: (stage: Stage, fraction: number) => void) => ReturnType<typeof analyseFile>) => {
      setError(null);
      setBusy({ name, stage: "decoding", fraction: 0 });
      try {
        const an = await job((stage, fraction) => setBusy({ name, stage, fraction }));
        library.save(an);
        navigate(`/track/${an.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong while analysing that file.");
        setBusy(null);
      }
    },
    [navigate],
  );

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/") && !file.type.startsWith("video/") && !/\.(mp3|wav|m4a|flac|ogg|aac|opus|webm|mp4)$/i.test(file.name)) {
      setError("That doesn't look like an audio file. Try MP3, WAV, M4A, FLAC or OGG.");
      return;
    }
    void run(file.name, (p) => analyseFile(file, p));
  };

  return (
    <div className="container page stack" style={{ ["--gap" as string]: "28px", maxWidth: 880 }}>
      <header className="stack" style={{ ["--gap" as string]: "12px" }}>
        <p className="eyebrow">Analyze</p>
        <h1 className="display h-page">
          Drop in a track. See how it <em>lands</em>.
        </h1>
        <p className="lede">
          You get a second-by-second prediction of how energetic and how positive listeners would rate it, plus the moments that drive the arc.
        </p>
      </header>

      {error && (
        <div className="error" role="alert">
          <Alert />
          <span>{error}</span>
        </div>
      )}

      {busy ? (
        <div className="drop" style={{ cursor: "default" }} aria-live="polite">
          <div className="drop-icon">
            <Upload width={26} height={26} />
          </div>
          <h2 className="h-card" style={{ fontSize: 17 }}>
            {busy.name}
          </h2>
          <p className="dim small" style={{ marginTop: 6 }}>
            {STAGE_TEXT[busy.stage]}
          </p>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(busy.fraction * 100)}>
            <i style={{ width: `${busy.stage === "decoding" ? 6 : Math.max(8, busy.fraction * 100)}%` }} />
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={`drop${over ? " over" : ""}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            onFiles(e.dataTransfer.files);
          }}
        >
          <div className="drop-icon">
            <Upload width={26} height={26} />
          </div>
          <h2 className="h-card" style={{ fontSize: 18 }}>
            Drop an audio file here, or click to choose
          </h2>
          <p className="dim small" style={{ marginTop: 6 }}>
            MP3, WAV, M4A, FLAC or OGG, up to 30 minutes
          </p>
          <p className="row tiny muted" style={{ justifyContent: "center", marginTop: 18, gap: 6 }}>
            <Lock width={14} height={14} /> Analysed on this device. The file is never uploaded.
          </p>
        </button>
      )}
      <input ref={input} type="file" accept="audio/*,video/mp4,video/webm,.mp3,.wav,.m4a,.flac,.ogg,.aac,.opus" hidden onChange={(e) => {
        onFiles(e.target.files);
        e.target.value = "";
      }} />

      <section className="stack" style={{ ["--gap" as string]: "12px" }}>
        <div>
          <h2 className="h-card">No file handy? Try a demo</h2>
          <p className="card-sub">Short pieces synthesised in your browser, each with a deliberately obvious arc.</p>
        </div>
        <div className="grid cols-3">
          {DEMOS.map((d) => (
            <button key={d.id} className="card demo-card" disabled={!!busy} onClick={() => void run(d.name, (p) => analyseDemo(d.id, p))}>
              <DemoGlyph curve={d.curve} />
              <div className="h-card" style={{ marginTop: 12 }}>
                {d.name}
              </div>
              <div className="card-sub">{d.blurb}</div>
              <div className="tiny muted mono" style={{ marginTop: 8 }}>
                {d.seconds}s · {d.bpm} bpm
              </div>
            </button>
          ))}
        </div>
      </section>

      <p className="note">
        Works best on finished or near-finished mixes. The model hears loudness, brightness and rhythmic activity. It does not understand lyrics, so a
        gentle song with devastating words will still read as gentle.
      </p>
    </div>
  );
}

/** The demo's scripted intensity curve, so you can see what the analyser should recover. */
function DemoGlyph({ curve }: { curve: (p: number) => number }) {
  const n = 40;
  const bars = Array.from({ length: n }, (_, i) => curve((i + 0.5) / n));
  return (
    <svg viewBox={`0 0 ${n * 5} 40`} style={{ width: "100%", height: 40, display: "block" }} aria-hidden>
      {bars.map((v, i) => (
        <rect key={i} x={i * 5} y={40 - Math.max(2, v * 38)} width={3} height={Math.max(2, v * 38)} rx={1.5} fill="var(--arousal)" opacity={0.35 + v * 0.65} />
      ))}
    </svg>
  );
}
