import type { ThemeMode } from '@/context/theme-preference-context';

/**
 * Architecture:
 *   OpenStreetMap data ──► MapLibre (web) / Carto raster (native)
 *                              │
 *                              ▼
 *                        TooDoo UI layer
 *                   pins · cards · categories · offers
 *
 * Customize basemap colors: Maputnik → export JSON → public/map-styles/
 * https://maputnik.github.io/
 */
export const OPENFREEMAP_STYLES = {
  liberty: 'https://tiles.openfreemap.org/styles/liberty',
  positron: 'https://tiles.openfreemap.org/styles/positron',
  /** Near-black — avoid for in-app maps; use liberty + brand paints instead. */
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;

export const TOODOO_MAP_STYLE_PATHS = {
  dark: '/map-styles/toodoo-dark.json',
  light: '/map-styles/toodoo-light.json',
} as const;

/** Native UrlTile fallback (Carto grayscale) until MapLibre Native is wired. */
export const MAP_RASTER_TILE_TEMPLATES = {
  dark: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  light: 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
} as const;

export const MAP_ATTRIBUTION = '© OpenStreetMap · © OpenFreeMap';

export function mapLibreStyleUrlForMode(_mode: ThemeMode) {
  // Liberty keeps readable roads; TooDoo navy/cream via applyTooDooMapPaints.
  return OPENFREEMAP_STYLES.liberty;
}

export function mapTileUrlForMode(_mode: ThemeMode) {
  // Light gray basemap in both app themes.
  return MAP_RASTER_TILE_TEMPLATES.light;
}

export function mapShellBackground(_mode: ThemeMode) {
  return '#efe8dc';
}

/** @deprecated alias */
export const MAP_TILE_TEMPLATES = MAP_RASTER_TILE_TEMPLATES;
