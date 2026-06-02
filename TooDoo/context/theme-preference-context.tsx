import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

export type ThemeMode = 'light' | 'dark';

type ThemePreferenceContextValue = {
  mode: ThemeMode;
  effectiveScheme: NonNullable<ReturnType<typeof useSystemColorScheme>>;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
  isHydrated: boolean;
};

const STORAGE_KEY = 'toodoo.themeMode';

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | undefined>(undefined);

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const systemScheme = useSystemColorScheme() ?? 'dark';
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (stored === 'light' || stored === 'dark') {
          setModeState(stored);
        }
      } finally {
        if (!cancelled) setIsHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      void AsyncStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo<ThemePreferenceContextValue>(
    () => ({
      mode,
      effectiveScheme: (mode as ThemeMode) ?? systemScheme,
      setMode,
      toggle,
      isHydrated,
    }),
    [mode, setMode, toggle, systemScheme, isHydrated]
  );

  return <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>;
}

export function useThemePreference() {
  const ctx = useContext(ThemePreferenceContext);
  if (!ctx) throw new Error('useThemePreference must be used inside ThemePreferenceProvider');
  return ctx;
}

