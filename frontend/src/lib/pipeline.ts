import { buildAnalysis, type Analysis } from "./analysis";
import { DEMOS, pcmToWavBlob } from "./demo";
import { SAMPLE_RATE, type DspResult } from "./dsp";
import type { WorkerRequest } from "../worker/analyze.worker";

export type Stage = "decoding" | "analysing" | "scoring";
export type ProgressFn = (stage: Stage, fraction: number) => void;

const MAX_SECONDS = 30 * 60;

/** Session-only audio for playback. Audio never leaves the tab and is never persisted. */
const audioUrls = new Map<string, string>();
export const audioUrlFor = (id: string) => audioUrls.get(id);
export const hasAudio = (id: string) => audioUrls.has(id);

function runWorker(req: WorkerRequest, transfer: Transferable[], onProgress: ProgressFn): Promise<{ result: DspResult; pcm?: Float32Array }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../worker/analyze.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") onProgress("analysing", m.fraction);
      else if (m.type === "done") {
        worker.terminate();
        resolve({ result: m.result, pcm: m.pcm });
      } else {
        worker.terminate();
        reject(new Error(m.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || "The analysis worker crashed."));
    };
    worker.postMessage(req, transfer);
  });
}

/** Decode any browser-playable file to mono 22.05 kHz, matching the Python pipeline's ffmpeg step. */
async function decodeToMono(file: File): Promise<Float32Array> {
  const bytes = await file.arrayBuffer();
  const Ctx: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(bytes);
  } catch {
    throw new Error("This browser could not decode that file. Try MP3, WAV, M4A, FLAC or OGG.");
  } finally {
    void ctx.close();
  }
  if (decoded.duration < 2) throw new Error("That clip is under two seconds, which is too short to analyse.");
  if (decoded.duration > MAX_SECONDS) throw new Error("Files longer than 30 minutes are not supported yet. Trim it and try again.");
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * SAMPLE_RATE), SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

const prettyName = (filename: string) => filename.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim() || "Untitled";

export async function analyseFile(file: File, onProgress: ProgressFn): Promise<Analysis> {
  onProgress("decoding", 0);
  const pcm = await decodeToMono(file);
  onProgress("analysing", 0);
  const { result } = await runWorker({ kind: "pcm", pcm }, [pcm.buffer], onProgress);
  onProgress("scoring", 1);
  const an = buildAnalysis(result, { name: prettyName(file.name), source: "upload" });
  audioUrls.set(an.id, URL.createObjectURL(file));
  return an;
}

export async function analyseDemo(demoId: string, onProgress: ProgressFn): Promise<Analysis> {
  const spec = DEMOS.find((d) => d.id === demoId);
  if (!spec) throw new Error("Unknown demo");
  onProgress("decoding", 0);
  const { result, pcm } = await runWorker({ kind: "demo", demoId }, [], onProgress);
  onProgress("scoring", 1);
  const an = buildAnalysis(result, { name: spec.name, source: "demo", demoId });
  if (pcm) audioUrls.set(an.id, URL.createObjectURL(pcmToWavBlob(pcm)));
  return an;
}

/** Re-synthesise audio for a saved demo analysis (demos are deterministic). */
export async function restoreDemoAudio(an: Analysis): Promise<string | undefined> {
  if (an.source !== "demo" || !an.demoId) return undefined;
  const existing = audioUrls.get(an.id);
  if (existing) return existing;
  const { pcm } = await runWorker({ kind: "demo", demoId: an.demoId }, [], () => {});
  if (!pcm) return undefined;
  const url = URL.createObjectURL(pcmToWavBlob(pcm));
  audioUrls.set(an.id, url);
  return url;
}

/** Attach a local file to an existing analysis so it can be played back. */
export function attachAudio(id: string, file: File): string {
  const old = audioUrls.get(id);
  if (old) URL.revokeObjectURL(old);
  const url = URL.createObjectURL(file);
  audioUrls.set(id, url);
  return url;
}
