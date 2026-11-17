/// <reference lib="webworker" />
import { analyzePcm } from "../lib/dsp";
import { DEMOS, renderDemo } from "../lib/demo";

export type WorkerRequest = { kind: "pcm"; pcm: Float32Array } | { kind: "demo"; demoId: string };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  try {
    let pcm: Float32Array;
    if (e.data.kind === "demo") {
      const id = e.data.demoId;
      const spec = DEMOS.find((d) => d.id === id);
      if (!spec) throw new Error("Unknown demo");
      pcm = renderDemo(spec);
    } else {
      pcm = e.data.pcm;
    }
    let lastSent = -1;
    const result = analyzePcm(pcm, {
      onProgress: (f) => {
        const pct = Math.round(f * 100);
        if (pct !== lastSent) {
          lastSent = pct;
          self.postMessage({ type: "progress", fraction: f });
        }
      },
    });
    const transfer: Transferable[] = [result.waveform.buffer, result.bands.buffer];
    if (e.data.kind === "demo") transfer.push(pcm.buffer);
    self.postMessage({ type: "done", result, pcm: e.data.kind === "demo" ? pcm : undefined }, { transfer });
  } catch (err) {
    self.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
