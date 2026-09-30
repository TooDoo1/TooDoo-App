import type { ThemeMode } from '@/context/theme-preference-context';
import { OPENFREEMAP_STYLES } from '@/lib/map-style';

/** Bump when style colors change so maps remount. */
export const MAP_PAINT_VERSION = 14;

type MapPaintPalette = {
  bg: string;
  land: string;
  building: string;
  park: string;
  wood: string;
  grass: string;
  wetland: string;
  parkOutline: string;
  water: string;
  waterway: string;
  road: string;
  roadMajor: string;
  roadCasing: string;
  rail: string;
  boundary: string;
  label: string;
  labelHalo: string;
};

/** Soft cream daylight basemap. */
const LIGHT: MapPaintPalette = {
  bg: '#efe8dc',
  land: '#f4efe6',
  building: '#d0d0d3',
  park: '#a8d48a',
  wood: '#86c06a',
  grass: '#b8e09a',
  wetland: '#9ccfad',
  parkOutline: '#7db86a',
  water: '#a8c8e8',
  waterway: '#8eb6de',
  road: '#ffffff',
  roadMajor: '#f4f4f4',
  roadCasing: '#d6d6d6',
  rail: '#d0d0d0',
  boundary: '#c2c2c2',
  label: '#5c5c60',
  labelHalo: '#f7f7f7',
};

/**
 * Dark mode — warm ink close to TooDoo navy (#0e1325), with muted greens
 * and deeper water so pins stay readable without neon contrast.
 */
const DARK: MapPaintPalette = {
  bg: '#12161f',
  land: '#181d29',
  building: '#2a3142',
  park: '#24352c',
  wood: '#1e2e26',
  grass: '#283a30',
  wetland: '#243836',
  parkOutline: '#3a5244',
  water: '#1a3354',
  waterway: '#2a4a72',
  road: '#3a4254',
  roadMajor: '#454e62',
  roadCasing: '#252b38',
  rail: '#323848',
  boundary: '#3a4254',
  label: '#c5cad6',
  labelHalo: '#0e1325',
};

export function mapPaintPalette(mode: ThemeMode): MapPaintPalette {
  return mode === 'dark' ? DARK : LIGHT;
}

type StyleLayer = {
  id: string;
  type?: string;
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
  [key: string]: unknown;
};

type MapStyle = {
  version: number;
  layers: StyleLayer[];
  [key: string]: unknown;
};

const stylePromises = new Map<string, Promise<MapStyle>>();

/**
 * Fetch OpenFreeMap Liberty and bake TooDoo colors into the style JSON.
 * Passing a mutated style object to MapLibre is reliable; setPaintProperty was not applying.
 */
export async function loadTooDooMapStyle(mode: ThemeMode = 'light'): Promise<MapStyle> {
  const cacheKey = `${MAP_PAINT_VERSION}:${mode}`;
  const existing = stylePromises.get(cacheKey);
  if (existing) return existing;

  const c = mapPaintPalette(mode);

  const promise = (async () => {
    const res = await fetch(OPENFREEMAP_STYLES.liberty);
    if (!res.ok) throw new Error(`Failed to load map style (${res.status})`);
    const style = (await res.json()) as MapStyle;

    style.layers = style.layers
      // Drop 3D buildings — they create dark edges that look like borders.
      .filter((layer) => layer.id !== 'building-3d')
      .map((layer) => {
        const paint = { ...(layer.paint ?? {}) };
        const layout = layer.layout ? { ...layer.layout } : undefined;

        switch (layer.id) {
          case 'background':
            paint['background-color'] = c.bg;
            break;
          case 'landuse_residential':
          case 'landuse_school':
          case 'landuse_hospital':
          case 'landcover_sand':
            paint['fill-color'] = c.land;
            break;
          case 'park':
          case 'landuse_pitch':
            paint['fill-color'] = c.park;
            break;
          case 'landuse_cemetery':
          case 'landcover_grass':
            paint['fill-color'] = c.grass;
            break;
          case 'landcover_wood':
            paint['fill-color'] = c.wood;
            break;
          case 'landcover_wetland':
            paint['fill-color'] = c.wetland;
            break;
          case 'park_outline':
            paint['line-color'] = c.parkOutline;
            break;
          case 'water':
            paint['fill-color'] = c.water;
            break;
          case 'waterway_river':
          case 'waterway_other':
          case 'waterway_tunnel':
            paint['line-color'] = c.waterway;
            break;
          case 'building': {
            // Liberty: 2D buildings only show zoom 13–14, then 3D takes over.
            // We removed 3D (dark edges), so keep flat buildings at all zooms.
            delete (layer as { maxzoom?: number }).maxzoom;
            paint['fill-color'] = c.building;
            paint['fill-outline-color'] = c.building;
            paint['fill-antialias'] = false;
            paint['fill-opacity'] = 1;
            break;
          }
          case 'road_path_pedestrian':
          case 'road_service_track':
          case 'road_minor':
          case 'road_link':
          case 'road_secondary_tertiary':
            paint['line-color'] = c.road;
            break;
          case 'road_trunk_primary':
          case 'road_motorway_link':
          case 'road_motorway':
            paint['line-color'] = c.roadMajor;
            break;
          case 'road_service_track_casing':
          case 'road_link_casing':
          case 'road_minor_casing':
          case 'road_secondary_tertiary_casing':
          case 'road_trunk_primary_casing':
          case 'road_motorway_casing':
          case 'road_motorway_link_casing':
            paint['line-color'] = c.roadCasing;
            break;
          case 'road_major_rail':
          case 'road_transit_rail':
            paint['line-color'] = c.rail;
            break;
          case 'boundary_2':
          case 'boundary_3':
            paint['line-color'] = c.boundary;
            break;
          default:
            if (layer.type === 'symbol' && paint['text-color'] != null) {
              paint['text-color'] = c.label;
              paint['text-halo-color'] = c.labelHalo;
            }
            break;
        }

        return layout
          ? { ...layer, paint, layout }
          : { ...layer, paint };
      });

    return style;
  })();

  stylePromises.set(cacheKey, promise);
  return promise;
}

/** @deprecated Kept for callers; style is now baked in loadTooDooMapStyle. */
export function applyTooDooMapPaints(_map: unknown, _mode?: unknown) {
  // no-op — colors are in the style JSON
}
