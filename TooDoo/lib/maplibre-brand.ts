import { OPENFREEMAP_STYLES } from '@/lib/map-style';

/** Bump when style colors change so maps remount. */
export const MAP_PAINT_VERSION = 11;

const BUILDING_FILL = '#d0d0d3';
const PARK_FILL = '#a8d48a';
const WOOD_FILL = '#86c06a';
const GRASS_FILL = '#b8e09a';
const WETLAND_FILL = '#9ccfad';
const PARK_OUTLINE = '#7db86a';
const WATER_FILL = '#a8c8e8';
const WATERWAY = '#8eb6de';
const BG = '#efe8dc';
const LAND = '#f4efe6';

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

let stylePromise: Promise<MapStyle> | null = null;
let cachedPaintVersion = -1;

/**
 * Fetch OpenFreeMap Liberty and bake TooDoo gray colors into the style JSON.
 * Passing a mutated style object to MapLibre is reliable; setPaintProperty was not applying.
 */
export async function loadTooDooMapStyle(): Promise<MapStyle> {
  if (stylePromise && cachedPaintVersion === MAP_PAINT_VERSION) {
    return stylePromise;
  }
  cachedPaintVersion = MAP_PAINT_VERSION;

  stylePromise = (async () => {
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
            paint['background-color'] = BG;
            break;
          case 'landuse_residential':
          case 'landuse_school':
          case 'landuse_hospital':
          case 'landcover_sand':
            paint['fill-color'] = LAND;
            break;
          case 'park':
          case 'landuse_pitch':
            paint['fill-color'] = PARK_FILL;
            break;
          case 'landuse_cemetery':
          case 'landcover_grass':
            paint['fill-color'] = GRASS_FILL;
            break;
          case 'landcover_wood':
            paint['fill-color'] = WOOD_FILL;
            break;
          case 'landcover_wetland':
            paint['fill-color'] = WETLAND_FILL;
            break;
          case 'park_outline':
            paint['line-color'] = PARK_OUTLINE;
            break;
          case 'water':
            paint['fill-color'] = WATER_FILL;
            break;
          case 'waterway_river':
          case 'waterway_other':
          case 'waterway_tunnel':
            paint['line-color'] = WATERWAY;
            break;
          case 'building': {
            // Liberty: 2D buildings only show zoom 13–14, then 3D takes over.
            // We removed 3D (dark edges), so keep flat buildings at all zooms.
            delete (layer as { maxzoom?: number }).maxzoom;
            paint['fill-color'] = BUILDING_FILL;
            paint['fill-outline-color'] = BUILDING_FILL;
            paint['fill-antialias'] = false;
            paint['fill-opacity'] = 1;
            break;
          }
          case 'road_path_pedestrian':
          case 'road_service_track':
          case 'road_minor':
          case 'road_link':
          case 'road_secondary_tertiary':
            paint['line-color'] = '#ffffff';
            break;
          case 'road_trunk_primary':
          case 'road_motorway_link':
          case 'road_motorway':
            paint['line-color'] = '#f4f4f4';
            break;
          case 'road_service_track_casing':
          case 'road_link_casing':
          case 'road_minor_casing':
          case 'road_secondary_tertiary_casing':
          case 'road_trunk_primary_casing':
          case 'road_motorway_casing':
          case 'road_motorway_link_casing':
            paint['line-color'] = '#d6d6d6';
            break;
          case 'road_major_rail':
          case 'road_transit_rail':
            paint['line-color'] = '#d0d0d0';
            break;
          case 'boundary_2':
          case 'boundary_3':
            paint['line-color'] = '#c2c2c2';
            break;
          default:
            if (layer.type === 'symbol' && paint['text-color'] != null) {
              paint['text-color'] = '#5c5c60';
              paint['text-halo-color'] = '#f7f7f7';
            }
            break;
        }

        return layout
          ? { ...layer, paint, layout }
          : { ...layer, paint };
      });

    return style;
  })();

  return stylePromise;
}

/** @deprecated Kept for callers; style is now baked in loadTooDooMapStyle. */
export function applyTooDooMapPaints(_map: unknown, _mode?: unknown) {
  // no-op — colors are in the style JSON
}
