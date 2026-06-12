import type { ThemeMode } from '@/context/theme-preference-context';
import { BrandColors, brandInkRgba, brandNavyRgba } from '@/lib/brand-colors';

export function uiTheme(mode: ThemeMode) {
  const isDark = mode === 'dark';
  const palette = isDark ? BrandColors.dark : BrandColors.light;

  return {
    isDark,
    // App surfaces
    screenBg: palette.background,
    cardBg: isDark ? BrandColors.dark.card : palette.card,
    cardBgMuted: isDark ? 'rgba(255,255,255,0.06)' : brandInkRgba(0.06),
    border: isDark ? 'rgba(255,255,255,0.12)' : brandInkRgba(0.12),
    // Text
    text: isDark ? palette.foreground : palette.foreground,
    textMuted: isDark ? 'rgba(255,255,255,0.70)' : brandInkRgba(0.65),
    textFaint: isDark ? 'rgba(255,255,255,0.55)' : brandInkRgba(0.45),
    // Accents
    // Light mode primary (pink) for general CTAs; events always use brand blue.
    primary: isDark ? BrandColors.dark.primary : '#EBBBD0',
    eventColor: BrandColors.dark.primary,
    eventColorMuted: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(71, 139, 235, 0.72)',
    accentGreen: isDark ? '#ff9b46' : '#BADBC2',
    danger: '#ff3b30',
    link: palette.primary,
    linkSoft: palette.primarySoft,
  };
}
