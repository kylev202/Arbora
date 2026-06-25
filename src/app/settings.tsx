/**
 * App-wide display & accessibility settings (Workstream A6 + D).
 *
 * Single source of truth for theme, contrast, font size, reduced motion, and
 * focus mode. Each setting is applied as a `data-*` attribute on <html> (or a
 * CSS var for font size) so plain CSS in tokens.css can react to it without JS.
 * Persisted to localStorage — Phase 3 is mock-only; a later phase swaps this for
 * the real `get_settings`/`update_settings` IPC calls.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";
export type Contrast = "normal" | "high";
/** Font base size in px — maps to Settings 14/16/18/20 (A5). */
export type FontScale = 14 | 16 | 18 | 20;

export type DisplaySettings = {
  theme: Theme;
  contrast: Contrast;
  fontScale: FontScale;
  /** User-forced reduced motion, independent of the OS media query. */
  reducedMotion: boolean;
  /** Focus mode strips chrome down to the current task (Workstream D). */
  focusMode: boolean;
};

const DEFAULTS: DisplaySettings = {
  theme: "light",
  contrast: "normal",
  fontScale: 16,
  reducedMotion: false,
  focusMode: false,
};

const STORAGE_KEY = "arbora.display";

type SettingsContextValue = DisplaySettings & {
  set: <K extends keyof DisplaySettings>(key: K, value: DisplaySettings[K]) => void;
  toggleTheme: () => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function load(): DisplaySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<DisplaySettings>) };
  } catch {
    /* corrupt storage → fall back to defaults */
  }
  return DEFAULTS;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<DisplaySettings>(load);

  // Reflect settings onto the document so tokens.css can target them.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.contrast = settings.contrast;
    root.dataset.reducedMotion = String(settings.reducedMotion);
    root.dataset.focusMode = String(settings.focusMode);
    root.style.setProperty("--font-base", `${settings.fontScale}px`);
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* private mode / quota — non-fatal for a mock UI */
    }
  }, [settings]);

  const set = useCallback<SettingsContextValue["set"]>((key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleTheme = useCallback(() => {
    setSettings((prev) => ({ ...prev, theme: prev.theme === "light" ? "dark" : "light" }));
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({ ...settings, set, toggleTheme }),
    [settings, set, toggleTheme],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within <SettingsProvider>");
  return ctx;
}
