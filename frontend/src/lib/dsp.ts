/**
 * Browser port of the audio baseline in deam_validate.py.
 *
 * The Python reference decodes to mono 22.05 kHz, then computes five clip-level
 * features from the waveform and a scipy STFT (Hann, nperseg=2048, hop=512,
 * "spectrum" scaling). This module reproduces those numbers so the ridge model
 * trained on the DEAM feature table can be applied to audio decoded in a tab.
 * It is pure (no DOM, no Web Audio) so it runs in a worker and under test.
 */

export const SAMPLE_RATE = 22050;
export const N_FFT = 2048;
export const HOP = 512;
export const N_BANDS = 32;

export interface Features {
  rms: number;
  centroid: number;
  flux: number;
  zcr: number;
  onset_rate: number;
}

export interface WindowFeatures extends Features {
  /** window centre, seconds */
  t: number;
}

export interface DspResult {
  duration: number;
  /** whole-track features, computed the way the training table was */
  clip: Features;
  /** sliding-window features, one per second */
  windows: WindowFeatures[];
  /** |peak| per display bucket, 0..1 */
  waveform: Float32Array;
  /** log-spaced band energy per second, row-major [seconds][N_BANDS], 0..1 */
  bands: Float32Array;
  bandSeconds: number;
}

// ---------------------------------------------------------------- FFT
const LOG2N = Math.log2(N_FFT);
const cosT = new Float64Array(N_FFT / 2);
const sinT = new Float64Array(N_FFT / 2);
const rev = new Uint32Array(N_FFT);
for (let i = 0; i < N_FFT / 2; i++) {
  cosT[i] = Math.cos((2 * Math.PI * i) / N_FFT);
  sinT[i] = Math.sin((2 * Math.PI * i) / N_FFT);
}
for (let i = 0; i < N_FFT; i++) {
  let r = 0;
  for (let b = 0; b < LOG2N; b++) r |= ((i >> b) & 1) << (LOG2N - 1 - b);
  rev[i] = r;
}
/** Periodic Hann, as scipy.signal.get_window("hann", n) returns. */
const hann = new Float64Array(N_FFT);
let hannSum = 0;
for (let i = 0; i < N_FFT; i++) {
  hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N_FFT);
  hannSum += hann[i];
}

/** In-place radix-2 FFT of length N_FFT. */
function fft(re: Float64Array, im: Float64Array): void {
  for (let i = 0; i < N_FFT; i++) {
    const j = rev[i];
    if (j > i) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let size = 2; size <= N_FFT; size <<= 1) {
    const half = size >> 1;
    const step = N_FFT / size;
    for (let start = 0; start < N_FFT; start += size) {
      for (let k = 0; k < half; k++) {
        const c = cosT[k * step];
        const s = sinT[k * step];
        const a = start + k;
        const b = a + half;
        const xr = re[b] * c + im[b] * s;
        const xi = im[b] * c - re[b] * s;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
}

// ---------------------------------------------------------------- helpers
/** Bin index where each log-spaced display band starts (40 Hz .. Nyquist). */
const bandEdges = (() => {
  const nBins = N_FFT / 2 + 1;
  const lo = Math.log(40);
  const hi = Math.log(SAMPLE_RATE / 2);
  const edges = new Uint16Array(N_BANDS + 1);
  for (let b = 0; b <= N_BANDS; b++) {
    const f = Math.exp(lo + ((hi - lo) * b) / N_BANDS);
    edges[b] = Math.min(nBins, Math.max(1, Math.round((f * N_FFT) / SAMPLE_RATE)));
  }
  for (let b = 1; b <= N_BANDS; b++) if (edges[b] <= edges[b - 1]) edges[b] = edges[b - 1] + 1;
  return edges;
})();

/** Count strict local maxima above `thr` in env[a..b). Mirrors scipy.signal.find_peaks(height=thr). */
function countPeaks(env: Float32Array, a: number, b: number, thr: number): number {
  let n = 0;
  for (let i = Math.max(a, 1); i < Math.min(b, env.length - 1); i++) {
    if (env[i] > thr && env[i] > env[i - 1] && env[i] >= env[i + 1]) n++;
  }
  return n;
}

function meanStd(a: Float32Array, i0: number, i1: number): [number, number] {
  const n = i1 - i0;
  if (n <= 0) return [0, 0];
  let s = 0;
  for (let i = i0; i < i1; i++) s += a[i];
  const m = s / n;
  let v = 0;
  for (let i = i0; i < i1; i++) v += (a[i] - m) ** 2;
  return [m, Math.sqrt(v / n)];
}

export interface AnalyzeOptions {
  /** sliding window length in seconds (the model was trained on 45 s clips) */
  windowSec?: number;
  waveformBuckets?: number;
  onProgress?: (fraction: number) => void;
}

/** Analyse mono PCM sampled at SAMPLE_RATE. */
export function analyzePcm(y: Float32Array, opts: AnalyzeOptions = {}): DspResult {
  const { windowSec = 10, waveformBuckets = 1400, onProgress } = opts;
  const N = y.length;
  const duration = N / SAMPLE_RATE;
  const nFrames = Math.floor(N / HOP) + 1;
  const nBins = N_FFT / 2 + 1;

  // Per-hop time-domain accumulators (block i covers samples [i*HOP, (i+1)*HOP)).
  const nBlocks = Math.ceil(N / HOP);
  const sumSq = new Float64Array(nBlocks);
  const zc = new Float32Array(nBlocks);
  let prevSign = 0;
  for (let i = 0; i < N; i++) {
    const v = y[i];
    const blk = (i / HOP) | 0;
    sumSq[blk] += v * v;
    const sg = v > 0 ? 1 : v < 0 ? -1 : 0;
    if (i > 0 && sg !== prevSign) zc[blk] += 1;
    prevSign = sg;
  }

  // STFT pass. Frame i is centred on sample i*HOP (zero-padded at the edges).
  const centroidF = new Float32Array(nFrames);
  const fluxF = new Float32Array(nFrames); // fluxF[i] = flux between frame i-1 and i
  const re = new Float64Array(N_FFT);
  const im = new Float64Array(N_FFT);
  let prev = new Float64Array(nBins);
  let cur = new Float64Array(nBins);
  const bandSeconds = Math.max(1, Math.ceil(duration));
  const bands = new Float32Array(bandSeconds * N_BANDS);
  const binHz = SAMPLE_RATE / N_FFT;
  const half = N_FFT / 2;

  for (let f = 0; f < nFrames; f++) {
    const start = f * HOP - half;
    for (let i = 0; i < N_FFT; i++) {
      const idx = start + i;
      re[i] = idx >= 0 && idx < N ? y[idx] * hann[i] : 0;
      im[i] = 0;
    }
    fft(re, im);
    let sum = 0;
    let weighted = 0;
    let fl = 0;
    for (let k = 0; k < nBins; k++) {
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / hannSum;
      cur[k] = mag;
      sum += mag;
      weighted += mag * k;
      const d = mag - prev[k];
      if (d > 0) fl += d * d;
    }
    centroidF[f] = (weighted * binHz) / (sum + 1e-12);
    fluxF[f] = f > 0 ? Math.sqrt(fl) : 0;
    const sec = Math.min(bandSeconds - 1, ((f * HOP) / SAMPLE_RATE) | 0);
    for (let b = 0; b < N_BANDS; b++) {
      let e = 0;
      for (let k = bandEdges[b]; k < bandEdges[b + 1]; k++) e += cur[k] * cur[k];
      bands[sec * N_BANDS + b] += e;
    }
    const t = prev;
    prev = cur;
    cur = t;
    if (onProgress && f % 512 === 0) onProgress(f / nFrames);
  }

  // Normalise band energy to 0..1 on a dB scale for display.
  let maxDb = -Infinity;
  for (let i = 0; i < bands.length; i++) {
    bands[i] = 10 * Math.log10(bands[i] + 1e-12);
    if (bands[i] > maxDb) maxDb = bands[i];
  }
  for (let i = 0; i < bands.length; i++) bands[i] = Math.min(1, Math.max(0, (bands[i] - (maxDb - 60)) / 60));

  const featuresOver = (s0: number, s1: number): Features => {
    // s0/s1 are sample bounds. Blocks and frames share the hop grid.
    const b0 = Math.floor(s0 / HOP);
    const b1 = Math.min(nBlocks, Math.max(b0 + 1, Math.ceil(s1 / HOP)));
    let sq = 0;
    let z = 0;
    for (let b = b0; b < b1; b++) {
      sq += sumSq[b];
      z += zc[b];
    }
    const nSamp = Math.max(1, Math.min(N, b1 * HOP) - b0 * HOP);
    const f0 = b0;
    const f1 = Math.min(nFrames, b1 + 1);
    const [cen] = meanStd(centroidF, f0, f1);
    // flux is defined between consecutive frames, so skip the window's first frame
    const [fm, fs] = meanStd(fluxF, f0 + 1, f1);
    const peaks = f1 - f0 > 4 ? countPeaks(fluxF, f0 + 1, f1, fm + fs) : 0;
    return {
      rms: Math.sqrt(sq / nSamp),
      zcr: z / nSamp,
      centroid: cen,
      flux: fm,
      onset_rate: peaks / (nSamp / SAMPLE_RATE),
    };
  };

  const clip = featuresOver(0, N);

  const windows: WindowFeatures[] = [];
  const W = Math.min(windowSec, duration);
  const last = Math.max(0, Math.floor(duration));
  for (let t = 0; t <= last; t++) {
    const a = Math.max(0, t - W / 2);
    const b = Math.min(duration, t + W / 2);
    if (b - a < 0.5) continue;
    windows.push({ t, ...featuresOver(Math.floor(a * SAMPLE_RATE), Math.floor(b * SAMPLE_RATE)) });
  }

  const waveform = new Float32Array(waveformBuckets);
  const per = N / waveformBuckets;
  for (let b = 0; b < waveformBuckets; b++) {
    let pk = 0;
    const e = Math.min(N, Math.floor((b + 1) * per));
    for (let i = Math.floor(b * per); i < e; i++) {
      const v = y[i] < 0 ? -y[i] : y[i];
      if (v > pk) pk = v;
    }
    waveform[b] = pk;
  }

  onProgress?.(1);
  return { duration, clip, windows, waveform, bands, bandSeconds };
}
