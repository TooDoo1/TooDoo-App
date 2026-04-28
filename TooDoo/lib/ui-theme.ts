import type { ThemeMode } from '@/context/theme-preference-context';

export function uiTheme(mode: ThemeMode) {
  const isDark = mode === 'dark';
  return {
    isDark,
    // App surfaces
    screenBg: isDark ? '#000b2a' : '#f5f7ff',
    cardBg: isDark ? '#0a1535' : '#ffffff',
    cardBgMuted: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,11,42,0.06)',
    border: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,11,42,0.12)',
    // Text
    text: isDark ? '#ffffff' : '#000b2a',
    textMuted: isDark ? 'rgba(255,255,255,0.70)' : 'rgba(0,11,42,0.65)',
    textFaint: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,11,42,0.45)',
    // Accents
    primary: '#007AFF',
    danger: '#ff3b30',
  };
}

