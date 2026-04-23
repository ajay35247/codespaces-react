import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'speedy-trucks.theme';
const VALID = new Set(['light', 'dark']);

function readStored() {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (VALID.has(stored)) return stored;
  } catch {
    /* localStorage may be blocked (Safari private mode, etc.) */
  }
  // Respect the OS preference on first visit.
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
}

const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => {}, setTheme: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => readStored());

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const setTheme = useCallback((next) => {
    if (VALID.has(next)) setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme, setTheme }), [theme, toggleTheme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
