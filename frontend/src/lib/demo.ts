import { SAMPLE_RATE } from "./dsp";
import { mulberry32 } from "./stats";

/**
 * Demo material is synthesised on the spot so the repo ships no audio files.
 * Each demo is a short piece whose intensity follows a scripted curve, which
 * gives the analyser something with an obvious, checkable emotional arc.
 */
export interface DemoSpec {
  id: string;
  name: string;
  blurb: string;
  seconds: number;
  bpm: number;
  /** semitone offsets from A2 for the chord roots, one per bar */
  roots: number[];
  minor: boolean;
  /** intensity 0..1 as a function of normalised position 0..1 */
  curve: (p: number) => number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const DEMOS: DemoSpec[] = [
  {
    id: "slow-build",
    name: "Slow Build",
    blurb: "A pad that grows into a full, driving finale.",
    seconds: 72,
    bpm: 124,
    roots: [0, 0, 5, 3],
    minor: false,
    curve: (p) => 0.08 + 0.92 * smooth(0.1, 0.85, p) * (1 - 0.6 * smooth(0.95, 1, p)),
  },
  {
    id: "drop-and-return",
    name: "Drop & Return",
    blurb: "Opens loud, strips to almost nothing, then slams back.",
    seconds: 66,
    bpm: 132,
    roots: [0, 3, -2, -4],
    minor: true,
    curve: (p) => (p < 0.36 ? 0.85 : p < 0.62 ? 0.12 + 0.1 * smooth(0.5, 0.62, p) : 0.95) * (1 - 0.7 * smooth(0.96, 1, p)),
  },
  {
    id: "stillness",
    name: "Stillness",
    blurb: "Slow and soft throughout. A low-arousal reference.",
    seconds: 54,
    bpm: 68,
    roots: [0, 5, 7, 5],
    minor: false,
    curve: (p) => 0.1 + 0.08 * Math.sin(p * Math.PI),
  },
];

export function renderDemo(spec: DemoSpec): Float32Array {
  const sr = SAMPLE_RATE;
  const N = Math.floor(spec.seconds * sr);
  const y = new Float32Array(N);
  const rand = mulberry32(spec.id.length * 9973 + spec.bpm);
  const beat = 60 / spec.bpm;
  const bar = beat * 4;
  const third = spec.minor ? 3 : 4;
  const hz = (semi: number) => 110 * 2 ** (semi / 12);

  // oscillator phases: 3 pad voices (2 detuned saws each), bass, lead
  const ph = new Float64Array(8);
  let lp = 0; // pad low-pass state
  let lp2 = 0;
  let hatHp = 0;
  let hatPrev = 0;
  let leadEnv = 0;
  let leadNote = 0;

  for (let i = 0; i < N; i++) {
    const t = i / sr;
    const p = i / N;
    const I = spec.curve(p);
    const barIdx = Math.floor(t / bar);
    const root = spec.roots[barIdx % spec.roots.length];
    const inBeat = (t % beat) / beat;
    const beatIdx = Math.floor(t / beat);
    const sixteenth = Math.floor((t % beat) / (beat / 4));
    const in16 = ((t % beat) % (beat / 4)) / (beat / 4);

    // --- pad: detuned saw triad through a low-pass that opens with intensity
    const chord = [root, root + third, root + 7];
    let pad = 0;
    for (let v = 0; v < 3; v++) {
      const f = hz(chord[v] + 12);
      ph[v * 2] = (ph[v * 2] + f / sr) % 1;
      ph[v * 2 + 1] = (ph[v * 2 + 1] + (f * 1.006) / sr) % 1;
      pad += ph[v * 2] * 2 - 1 + (ph[v * 2 + 1] * 2 - 1);
    }
    pad /= 6;
    const cutoff = 0.012 + 0.5 * I * I;
    lp += cutoff * (pad - lp);
    lp2 += cutoff * (lp - lp2);
    const padOut = lp2 * (0.22 + 0.25 * I);

    // --- bass: enters once things warm up, pumps on the beat
    let bass = 0;
    if (I > 0.25) {
      ph[6] = (ph[6] + hz(root - 12) / sr) % 1;
      const pump = 0.35 + 0.65 * Math.min(1, inBeat * 3);
      bass = Math.sin(2 * Math.PI * ph[6]) * 0.3 * smooth(0.25, 0.5, I) * pump;
    }

    // --- kick: sine sweep on every beat
    let kick = 0;
    if (I > 0.4) {
      const kt = inBeat * beat;
      const kf = 48 + 110 * Math.exp(-kt * 28);
      kick = Math.sin(2 * Math.PI * kf * kt) * Math.exp(-kt * 9) * 0.55 * smooth(0.4, 0.6, I);
    }

    // --- hats / noise: denser and louder with intensity
    let hat = 0;
    const hatOn = I > 0.55 ? true : I > 0.32 ? sixteenth % 2 === 0 : false;
    if (hatOn) {
      const n = rand() * 2 - 1;
      hatHp = 0.72 * (hatHp + n - hatPrev);
      hatPrev = n;
      const accent = sixteenth === 2 ? 1 : 0.55;
      hat = hatHp * Math.exp(-in16 * (I > 0.8 ? 5 : 11)) * 0.2 * accent * smooth(0.32, 0.9, I);
    }

    // --- snare-ish burst on beats 2 and 4 at high intensity
    let snare = 0;
    if (I > 0.7 && beatIdx % 2 === 1) {
      snare = (rand() * 2 - 1) * Math.exp(-inBeat * beat * 16) * 0.3 * smooth(0.7, 0.9, I);
    }

    // --- lead: simple arpeggio that appears near the top
    let lead = 0;
    if (I > 0.6) {
      if (in16 < 0.02 && sixteenth % 2 === 0) {
        leadEnv = 1;
        leadNote = chord[(beatIdx + sixteenth / 2) % 3] + 24;
      }
      ph[7] = (ph[7] + hz(leadNote) / sr) % 1;
      leadEnv *= 0.9997;
      lead = (ph[7] < 0.5 ? 1 : -1) * leadEnv * 0.07 * smooth(0.6, 0.85, I);
    }

    const fade = Math.min(1, t / 0.5) * Math.min(1, (spec.seconds - t) / 1.5);
    y[i] = Math.tanh((padOut + bass + kick + hat + snare + lead) * 1.4) * 0.8 * fade;
  }
  return y;
}

/** 16-bit mono WAV, for playing synthesised demos through an <audio> element. */
export function pcmToWavBlob(y: Float32Array, sampleRate = SAMPLE_RATE): Blob {
  const buf = new ArrayBuffer(44 + y.length * 2);
  const dv = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  dv.setUint32(4, 36 + y.length * 2, true);
  str(8, "WAVEfmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  str(36, "data");
  dv.setUint32(40, y.length * 2, true);
  for (let i = 0; i < y.length; i++) {
    const s = Math.max(-1, Math.min(1, y[i]));
    dv.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}
