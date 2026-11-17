import raw from "../data/deam.csv?raw";

/** One DEAM clip: human ratings (1–9) plus the features deam_validate.py extracted. */
export interface DeamRow {
  id: number;
  arousal: number;
  valence: number;
  rms: number;
  centroid: number;
  flux: number;
  zcr: number;
  onset_rate: number;
  tribe_mag: number;
  tribe_arousal: number;
}

export type FeatureKey = Exclude<keyof DeamRow, "id" | "arousal" | "valence">;

export const AUDIO_FEATURES = ["rms", "centroid", "flux", "zcr", "onset_rate"] as const;
export const TRIBE_FEATURES = ["tribe_mag", "tribe_arousal"] as const;
export type AudioFeatureKey = (typeof AUDIO_FEATURES)[number];

export const FEATURE_META: Record<FeatureKey, { label: string; short: string; unit: string; blurb: string; digits: number }> = {
  rms: { label: "Loudness (RMS)", short: "Loudness", unit: "", blurb: "Average signal energy. Correlates with rated arousal on its own, but brightness and flux carry most of the weight once combined.", digits: 3 },
  centroid: { label: "Brightness (spectral centroid)", short: "Brightness", unit: "Hz", blurb: "Where the spectrum's weight sits. Higher means brighter, sharper timbre.", digits: 0 },
  flux: { label: "Spectral flux", short: "Flux", unit: "", blurb: "How much the spectrum changes frame to frame: movement and attack.", digits: 3 },
  zcr: { label: "Noisiness (zero-crossing rate)", short: "Noisiness", unit: "", blurb: "How often the waveform crosses zero: hiss, cymbals, distortion.", digits: 3 },
  onset_rate: { label: "Onset rate", short: "Onsets", unit: "/s", blurb: "Flux peaks per second: a rough count of note and drum attacks.", digits: 2 },
  tribe_mag: { label: "TRIBE activation magnitude", short: "TRIBE magnitude", unit: "", blurb: "Mean absolute predicted cortical activation across the clip.", digits: 4 },
  tribe_arousal: { label: "TRIBE arousal readout", short: "TRIBE arousal", unit: "r", blurb: "Pattern correlation between predicted activity and the Neurosynth arousal contrast.", digits: 3 },
};

function parse(text: string): DeamRow[] {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    const row: Record<string, number> = {};
    cols.forEach((c, i) => (row[c] = Number(cells[i])));
    return row as unknown as DeamRow;
  });
}

export const DEAM: DeamRow[] = parse(raw);
