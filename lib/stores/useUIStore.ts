"use client";

import { create } from "zustand";

export type ThemeMode = "light" | "dark";

type UIState = {
  theme: ThemeMode;
  hasHydratedTheme: boolean;
  leftPaneSize: number;
  rightPaneSize: number;
  hydrateTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setPaneSizes: (leftPaneSize: number, rightPaneSize: number) => void;
};

const storageKey = "lecturemind_theme";

function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(storageKey);
  return stored === "dark" ? "dark" : "light";
}

function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.classList.toggle("light", theme === "light");
}

export const useUIStore = create<UIState>((set, get) => ({
  theme: "light",
  hasHydratedTheme: false,
  leftPaneSize: 32,
  rightPaneSize: 36,
  hydrateTheme: () => {
    const theme = getStoredTheme();
    applyTheme(theme);
    set({ theme, hasHydratedTheme: true });
  },
  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, theme);
    }
    applyTheme(theme);
    set({ theme, hasHydratedTheme: true });
  },
  toggleTheme: () => {
    const nextTheme = get().theme === "dark" ? "light" : "dark";
    get().setTheme(nextTheme);
  },
  setPaneSizes: (leftPaneSize, rightPaneSize) =>
    set({ leftPaneSize, rightPaneSize })
}));
