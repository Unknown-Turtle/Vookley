import { useSyncExternalStore } from "react";
import type { Analysis } from "./analysis";

const KEY = "vookley.library.v1";
const MAX_ITEMS = 40;

let cache: Analysis[] | null = null;
const listeners = new Set<() => void>();

function read(): Analysis[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Analysis[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: Analysis[]): void {
  cache = next;
  let toStore = next;
  // localStorage is small; if we hit the quota, drop the oldest entries until it fits.
  while (true) {
    try {
      localStorage.setItem(KEY, JSON.stringify(toStore));
      break;
    } catch {
      if (toStore.length <= 1) break;
      toStore = toStore.slice(0, -1);
    }
  }
  listeners.forEach((l) => l());
}

export const library = {
  all: read,
  get: (id: string) => read().find((a) => a.id === id),
  save(an: Analysis) {
    write([an, ...read().filter((a) => a.id !== an.id)].slice(0, MAX_ITEMS));
  },
  rename(id: string, name: string) {
    write(read().map((a) => (a.id === id ? { ...a, name } : a)));
  },
  remove(id: string) {
    write(read().filter((a) => a.id !== id));
  },
  clear() {
    write([]);
  },
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useLibrary(): Analysis[] {
  return useSyncExternalStore(subscribe, read);
}
