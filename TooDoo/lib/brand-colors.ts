/**
 * Brand palette aligned with https://toodoo-beta.com/ CSS variables.
 * Dark: hsl(228 45% 10%) background, hsl(215 80% 60%) primary.
 */
export const BrandColors = {
  dark: {
    background: '#0e1325',
    card: '#14192e',
    secondary: '#182139',
    border: '#1e263e',
    foreground: '#edf1f7',
    mutedForeground: '#6c7c9d',
    primary: '#478beb',
    accent: '#3c7fdd',
    primarySoft: '#6c9ef5',
  },
  light: {
    background: '#fbfaf9',
    foreground: '#131720',
    card: '#ffffff',
    mutedForeground: '#737b8c',
    primary: '#478beb',
    accent: '#3c7fdd',
    primarySoft: '#6c9ef5',
  },
} as const;

/** RGB tuple for `rgba(...)` helpers — matches dark background #0e1325. */
export const BRAND_NAVY_RGB = [14, 19, 37] as const;

/** RGB tuple for light foreground tint overlays — matches #131720. */
export const BRAND_INK_RGB = [19, 23, 32] as const;

export function brandNavyRgba(alpha: number): string {
  const [r, g, b] = BRAND_NAVY_RGB;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function brandInkRgba(alpha: number): string {
  const [r, g, b] = BRAND_INK_RGB;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** White search/category chips on dark hero — matches toodoo-beta.com. */
export const FilterChipTheme = {
  surface: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  text: BrandColors.light.foreground,
  textMuted: '#5c6370',
  placeholder: 'rgba(19, 23, 32, 0.45)',
} as const;
