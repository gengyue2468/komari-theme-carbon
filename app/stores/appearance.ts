import { create } from "zustand";
import type { Appearance } from "~/types/komari";

const STORAGE_KEY = "appearance";

function readStored(): Appearance {
  if (typeof window === "undefined") return "system";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // ignore
  }
  return "system";
}

function resolveTheme(appearance: Appearance): "g10" | "g100" {
  if (appearance === "light") return "g10";
  if (appearance === "dark") return "g100";
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "g100";
  }
  return "g10";
}

/**
 * Apply the resolved Carbon theme to <html> so the very first paint (before
 * React mounts / effects run) already has the correct palette. Also used by
 * the inline <head> bootstrap script in root.tsx.
 */
export function applyThemeToDocument(theme: "g10" | "g100") {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.carbonTheme = theme;
  document.documentElement.style.colorScheme =
    theme === "g100" ? "dark" : "light";
}

interface AppearanceState {
  appearance: Appearance;
  carbonTheme: "g10" | "g100";
  setAppearance: (a: Appearance) => void;
  syncSystem: () => void;
}

const initialAppearance = readStored();

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  // Initialize synchronously from storage so the first client render already
  // matches the user's choice (no flash / no effect ordering dependency).
  appearance: initialAppearance,
  carbonTheme: resolveTheme(initialAppearance),
  setAppearance: (appearance) => {
    try {
      localStorage.setItem(STORAGE_KEY, appearance);
    } catch {
      // ignore
    }
    const carbonTheme = resolveTheme(appearance);
    set({ appearance, carbonTheme });
    applyThemeToDocument(carbonTheme);
  },
  syncSystem: () => {
    const appearance = get().appearance;
    const carbonTheme = resolveTheme(appearance);
    set({ carbonTheme });
    applyThemeToDocument(carbonTheme);
  },
}));

let mediaListenerBound = false;

export function initAppearance() {
  const appearance = readStored();
  const carbonTheme = resolveTheme(appearance);
  useAppearanceStore.setState({ appearance, carbonTheme });
  applyThemeToDocument(carbonTheme);

  if (typeof window === "undefined" || mediaListenerBound) return;
  mediaListenerBound = true;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => useAppearanceStore.getState().syncSystem();
  mq.addEventListener("change", onChange);
}
