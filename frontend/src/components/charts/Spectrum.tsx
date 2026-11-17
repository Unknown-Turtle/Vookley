import { useEffect, useRef } from "react";
import { N_BANDS, type Analysis } from "../../lib/analysis";
import { useTheme } from "../../lib/hooks";

/** Band energy over time as a single-hue heat strip (low frequencies at the bottom). */
export function Spectrum({ an, time }: { an: Analysis; time?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [theme] = useTheme();

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const w = an.bandSeconds;
    cv.width = w;
    cv.height = N_BANDS;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(w, N_BANDS);
    // one hue: the near-zero end recedes into the surface in either theme
    const [lo, hi] = theme === "dark" ? [[26, 26, 25], [134, 182, 239]] : [[252, 252, 251], [16, 66, 129]];
    for (let s = 0; s < w; s++) {
      for (let b = 0; b < N_BANDS; b++) {
        const v = Math.pow((an.bands[s * N_BANDS + b] ?? 0) / 99, 1.6);
        const o = ((N_BANDS - 1 - b) * w + s) * 4;
        img.data[o] = lo[0] + (hi[0] - lo[0]) * v;
        img.data[o + 1] = lo[1] + (hi[1] - lo[1]) * v;
        img.data[o + 2] = lo[2] + (hi[2] - lo[2]) * v;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [an, theme]);

  return (
    <div>
      <div style={{ position: "relative" }}>
        <canvas
          ref={ref}
          role="img"
          aria-label="Spectral energy over time"
          style={{ width: "100%", height: 96, display: "block", borderRadius: 8, border: "1px solid var(--border)" }}
        />
        {time != null && time > 0 && (
          <i style={{ position: "absolute", top: 0, bottom: 0, width: 1.5, background: "var(--text)", left: `${Math.min(100, (time / an.duration) * 100)}%` }} />
        )}
      </div>
      <div className="spread tiny muted" style={{ marginTop: 5 }}>
        <span>40 Hz at the bottom, 11 kHz at the top</span>
        <span>stronger colour = more energy</span>
      </div>
    </div>
  );
}
