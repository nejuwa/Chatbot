"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const navigationPalettes = [
  { name: "Green", value: "oklch(72.3% 0.219 149.579)", foreground: "#17212b", dark: false },
  { name: "Blue", value: "oklch(28.2% 0.091 267.935)", foreground: "#ffffff", dark: true },
  { name: "Olive", value: "oklch(27.4% 0.072 132.109)", foreground: "#ffffff", dark: true },
  { name: "Brown gray", value: "oklch(21.4% 0.009 43.1)", foreground: "#ffffff", dark: true },
  { name: "Slate", value: "oklch(45% 0.017 213.2)", foreground: "#ffffff", dark: true },
  { name: "White", value: "#ffffff", foreground: "#17212b", dark: false },
] as const;

type NavigationPalette = (typeof navigationPalettes)[number];

interface ThemeContextValue {
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  palette: NavigationPalette;
  setPalette: (value: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const THEME_KEY = "chatbot.theme";
const PALETTE_KEY = "chatbot.navigationColor";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [darkMode, setDarkModeState] = useState(false);
  const [paletteValue, setPaletteValue] = useState<string>(navigationPalettes[0].value);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDarkModeState(window.localStorage.getItem(THEME_KEY) === "dark");
    setPaletteValue(window.localStorage.getItem(PALETTE_KEY) ?? navigationPalettes[0].value);
    setReady(true);
  }, []);

  const setDarkMode = useCallback((dark: boolean) => setDarkModeState(dark), []);
  const setPalette = useCallback((value: string) => {
    if (navigationPalettes.some((item) => item.value === value)) setPaletteValue(value);
  }, []);
  const palette = navigationPalettes.find((item) => item.value === paletteValue) ?? navigationPalettes[0];

  useEffect(() => {
    if (!ready) return;
    document.body.dataset.theme = darkMode ? "dark" : "light";
    document.body.style.setProperty("--app-primary", palette.value);
    document.body.style.setProperty("--app-primary-foreground", palette.foreground);
    document.body.style.setProperty("--app-accent", darkMode ? "#6ab2f2" : "#3390ec");
    document.body.style.setProperty("--app-accent-hover", darkMode ? "#4b9fe8" : "#287fda");
    document.body.style.setProperty(
      "--app-accent-soft",
      darkMode ? "#1b3246" : "#e9f3fc",
    );
    window.localStorage.setItem(THEME_KEY, darkMode ? "dark" : "light");
    window.localStorage.setItem(PALETTE_KEY, palette.value);
  }, [darkMode, palette, ready]);

  const value = useMemo(
    () => ({ darkMode, setDarkMode, palette, setPalette }),
    [darkMode, setDarkMode, palette, setPalette],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
