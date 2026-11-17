import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

/** Measured width of an element, for charts that draw in real pixels. */
export function useWidth<T extends HTMLElement>(initial = 640): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth || initial);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [initial]);
  return [ref, w];
}

export type Theme = "light" | "dark";

const themeListeners = new Set<() => void>();
const mq = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
mq?.addEventListener("change", () => themeListeners.forEach((l) => l()));

const currentTheme = (): Theme => {
  const forced = document.documentElement.dataset.theme;
  if (forced === "light" || forced === "dark") return forced;
  return mq?.matches ? "dark" : "light";
};

export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(
    (l) => {
      themeListeners.add(l);
      return () => themeListeners.delete(l);
    },
    currentTheme,
  );
  const toggle = useCallback(() => {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("vookley.theme", next);
    } catch {
      /* private mode: the choice just won't persist */
    }
    themeListeners.forEach((l) => l());
  }, []);
  return [theme, toggle];
}

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} · Vookley` : "Vookley · Hear how it will feel";
  }, [title]);
}

/** Audio element state for the report page. */
export function useAudio(src: string | undefined, fallbackDuration: number) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setTime(0);
    setPlaying(false);
    if (!src) return;
    const el = new Audio(src);
    el.preload = "auto";
    ref.current = el;
    let raf = 0;
    const tick = () => {
      setTime(el.currentTime);
      raf = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      setPlaying(true);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setPlaying(false);
      cancelAnimationFrame(raf);
      setTime(el.currentTime);
    };
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onPause);
    el.addEventListener("seeked", () => setTime(el.currentTime));
    return () => {
      cancelAnimationFrame(raf);
      el.pause();
      el.removeAttribute("src");
      ref.current = null;
    };
  }, [src]);

  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => setPlaying(false));
    else el.pause();
  }, []);

  const seek = useCallback(
    (t: number) => {
      const clamped = Math.max(0, Math.min(fallbackDuration, t));
      setTime(clamped);
      const el = ref.current;
      if (el) el.currentTime = clamped;
    },
    [fallbackDuration],
  );

  return { time, playing, toggle, seek, ready: !!src };
}
