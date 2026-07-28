import { create } from "zustand";
import type { Appearance } from "~/types/komari";

const STORAGE_KEY = "appearance";

function readStored(): Appearance {
  if (typeof window === "undefined") return "system";
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
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

interface AppearanceState {
  appearance: Appearance;
  carbonTheme: "g10" | "g100";
  setAppearance: (a: Appearance) => void;
  syncSystem: () => void;
}

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  appearance: "system",
  carbonTheme: "g10",
  setAppearance: (appearance) => {
    localStorage.setItem(STORAGE_KEY, appearance);
    set({ appearance, carbonTheme: resolveTheme(appearance) });
  },
  syncSystem: () => {
    const appearance = get().appearance;
    set({ carbonTheme: resolveTheme(appearance) });
  },
}));

export function initAppearance() {
  const appearance = readStored();
  useAppearanceStore.setState({
    appearance,
    carbonTheme: resolveTheme(appearance),
  });

  if (typeof window !== "undefined") {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => useAppearanceStore.getState().syncSystem();
    mq.addEventListener("change", onChange);
  }
}
