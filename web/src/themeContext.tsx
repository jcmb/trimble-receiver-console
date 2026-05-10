import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** Resolved appearance (what CSS uses). */
export type Theme = "light" | "dark";

/** User choice: follow OS, or pin light/dark. */
export type ThemePreference = "system" | "light" | "dark";

const PREF_KEY = "trimble_theme_preference";
const LEGACY_THEME_KEY = "trimble_theme";

export function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function readPreference(): ThemePreference {
  try {
    const p = localStorage.getItem(PREF_KEY);
    if (p === "system" || p === "light" || p === "dark") return p;
    const legacy = localStorage.getItem(LEGACY_THEME_KEY);
    if (legacy === "light" || legacy === "dark") {
      localStorage.setItem(PREF_KEY, legacy);
      return legacy;
    }
  } catch {
    /* ignore */
  }
  return "system";
}

export function resolveTheme(preference: ThemePreference): Theme {
  if (preference === "system") return getSystemTheme();
  return preference;
}

/** For first paint before React (must match readPreference + system). */
export function getInitialResolvedTheme(): Theme {
  return resolveTheme(readPreference());
}

const ThemeContext = createContext<{
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  resolvedTheme: Theme;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readPreference());
  const [systemIsLight, setSystemIsLight] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setSystemIsLight(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme: Theme =
    preference === "system" ? (systemIsLight ? "light" : "dark") : preference;

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    try {
      localStorage.setItem(PREF_KEY, preference);
    } catch {
      /* ignore */
    }
  }, [preference, resolvedTheme]);

  const setPreference = (p: ThemePreference) => {
    setPreferenceState(p);
  };

  return (
    <ThemeContext.Provider value={{ preference, setPreference, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const v = useContext(ThemeContext);
  if (!v) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return v;
}
