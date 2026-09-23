import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useThemePreference } from '@/context/theme-preference-context';
import { MAP_DEFAULT_CENTER } from '@/lib/business-map-data';
import { loadTooDooMapStyle, MAP_PAINT_VERSION } from '@/lib/maplibre-brand';
import { createBusinessPinElement, businessPinMarkerOffset } from '@/lib/map-business-pin';
import { MAP_ATTRIBUTION, mapShellBackground } from '@/lib/map-style';
import { createUserLocationArrowElement } from '@/lib/map-user-location';
import { uiTheme } from '@/lib/ui-theme';

export type MapLibrePin = {
  id: string;
  latitude: number;
  longitude: number;
  color: string;
  title?: string;
  imageUri?: string;
  selected?: boolean;
  hasEvent?: boolean;
  hasOffer?: boolean;
};

export type MapViewportBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

type Props = {
  center: { latitude: number; longitude: number };
  zoom?: number;
  pins?: MapLibrePin[];
  interactive?: boolean;
  showUserLocation?: { latitude: number; longitude: number } | null;
  /** Driving route polyline (lat/lng). */
  routeLine?: Array<{ latitude: number; longitude: number }> | null;
  /** Walking route polyline (lat/lng) — drawn separately from driving. */
  walkingRouteLine?: Array<{ latitude: number; longitude: number }> | null;
  fitPins?: boolean;
  onPinPress?: (id: string) => void;
  /** Fires with visible bounds after each pan/zoom settles (and once on load). */
  onViewportChange?: (bounds: MapViewportBounds) => void;
  style?: ViewStyle;
};

type MlMap = {
  remove: () => void;
  resize: () => void;
  setCenter: (c: [number, number]) => void;
  setZoom: (z: number) => void;
  fitBounds: (b: unknown, o?: object) => void;
  getBounds: () => { toArray: () => [[number, number], [number, number]] };
  on: (event: string, cb: () => void) => void;
  getSource: (id: string) => { setData?: (data: unknown) => void } | undefined;
  getLayer: (id: string) => unknown;
  addSource: (id: string, source: unknown) => void;
  addLayer: (layer: unknown) => void;
  removeLayer: (id: string) => void;
  removeSource: (id: string) => void;
  isStyleLoaded: () => boolean;
};

type MlMarker = {
  remove: () => void;
  setLngLat: (ll: [number, number]) => MlMarker;
  addTo: (m: MlMap) => MlMarker;
};

type MapLibreGl = {
  Map: new (opts: Record<string, unknown>) => MlMap;
  Marker: new (opts?: {
    element?: HTMLElement;
    anchor?: string;
    offset?: [number, number];
    /** Skip pixel rounding — smoother marker motion while zooming. */
    subpixelPositioning?: boolean;
  }) => MlMarker;
  LngLatBounds: new () => { extend: (ll: [number, number]) => void };
};

declare global {
  interface Window {
    maplibregl?: MapLibreGl;
  }
}

const MAPLIBRE_JS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';

let mapLibrePromise: Promise<MapLibreGl> | null = null;

function loadMapLibre(): Promise<MapLibreGl> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('MapLibre requires a browser'));
  }
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (mapLibrePromise) return mapLibrePromise;

  mapLibrePromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${MAPLIBRE_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = MAPLIBRE_CSS;
      document.head.appendChild(link);
    }
    const existing = document.querySelector(`script[src="${MAPLIBRE_JS}"]`);
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.maplibregl) resolve(window.maplibregl);
        else reject(new Error('MapLibre failed to load'));
      });
      return;
    }
    const script = document.createElement('script');
    script.src = MAPLIBRE_JS;
    script.async = true;
    script.onload = () => {
      if (window.maplibregl) resolve(window.maplibregl);
      else reject(new Error('MapLibre script error'));
    };
    script.onerror = () => reject(new Error('MapLibre script error'));
    document.head.appendChild(script);
  });

  return mapLibrePromise;
}

/** Warm MapLibre JS/CSS + TooDoo style so the explore map can paint immediately. */
export function prefetchBusinessMapAssets(): void {
  if (typeof window === 'undefined') return;
  void loadMapLibre().catch(() => {});
  void loadTooDooMapStyle().catch(() => {});
}

let tileWarmupStarted = false;

/**
 * Spin up a hidden MapLibre instance over Helsingborg so vector tiles land in
 * the browser cache while the splash is still covering the UI.
 */
export function warmBusinessMapTiles(): void {
  if (typeof window === 'undefined' || tileWarmupStarted) return;
  tileWarmupStarted = true;

  void (async () => {
    try {
      const [ml, mapStyle] = await Promise.all([loadMapLibre(), loadTooDooMapStyle()]);
      const host = document.createElement('div');
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText =
        'position:fixed;left:-9999px;top:0;width:390px;height:720px;opacity:0;pointer-events:none;';
      document.body.appendChild(host);

      const map = new ml.Map({
        container: host,
        style: mapStyle,
        center: [MAP_DEFAULT_CENTER.lng, MAP_DEFAULT_CENTER.lat],
        zoom: 13,
        interactive: false,
        attributionControl: false,
        fadeDuration: 0,
        pixelRatio: 1,
      });

      const teardown = () => {
        try {
          map.remove();
        } catch {
          // ignore
        }
        host.remove();
      };

      map.once('idle', teardown);
      window.setTimeout(teardown, 8000);
    } catch {
      // Splash warmup is best-effort.
    }
  })();
}

function createPinElement(pin: MapLibrePin, badgeBg?: string) {
  return createBusinessPinElement({
    color: pin.color,
    title: pin.title,
    imageUri: pin.imageUri,
    selected: pin.selected,
    hasEvent: pin.hasEvent,
    hasOffer: pin.hasOffer,
    badgeBg,
  });
}

type RouteCoords = Array<{ latitude: number; longitude: number }>;

const DRIVING_ROUTE = {
  source: 'toodoo-route',
  layer: 'toodoo-route-line',
  color: '#0a84ff',
  width: 4.5,
  dash: undefined as number[] | undefined,
};
const WALKING_ROUTE = {
  source: 'toodoo-route-walk',
  layer: 'toodoo-route-walk-line',
  color: '#30d158',
  width: 4,
  dash: [1.5, 1.5] as number[],
};

function clearRouteLayer(map: MlMap, sourceId: string, layerId: string) {
  try {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  } catch {
    // ignore
  }
}

function upsertRouteLayer(
  map: MlMap,
  routeLine: RouteCoords | null | undefined,
  style: typeof DRIVING_ROUTE
) {
  if (!routeLine?.length) {
    clearRouteLayer(map, style.source, style.layer);
    return;
  }

  const geojson = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: routeLine.map((p) => [p.longitude, p.latitude]),
    },
  };

  const existing = map.getSource(style.source);
  if (existing?.setData) {
    existing.setData(geojson);
    return;
  }

  try {
    map.addSource(style.source, { type: 'geojson', data: geojson });
    map.addLayer({
      id: style.layer,
      type: 'line',
      source: style.source,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': style.color,
        'line-width': style.width,
        'line-opacity': 0.9,
        ...(style.dash ? { 'line-dasharray': style.dash } : {}),
      },
    });
  } catch {
    // Style may not be ready yet.
  }
}

function routeSignature(
  driving: RouteCoords | null | undefined,
  walking: RouteCoords | null | undefined
) {
  const d = driving?.length
    ? `${driving.length}:${driving[0].latitude},${driving[0].longitude}:${driving[driving.length - 1].latitude},${driving[driving.length - 1].longitude}`
    : '';
  const w = walking?.length
    ? `${walking.length}:${walking[0].latitude},${walking[0].longitude}:${walking[walking.length - 1].latitude},${walking[walking.length - 1].longitude}`
    : '';
  return `${d}|${w}`;
}

function syncRouteLines(
  map: MlMap,
  ml: MapLibreGl,
  driving: RouteCoords | null | undefined,
  walking: RouteCoords | null | undefined,
  fittedSigRef?: { current: string }
) {
  if (!map.isStyleLoaded?.()) return;

  upsertRouteLayer(map, driving, DRIVING_ROUTE);
  upsertRouteLayer(map, walking, WALKING_ROUTE);

  const boundsPoints = [...(driving ?? []), ...(walking ?? [])];
  // Clearing routes must not move the camera.
  if (!boundsPoints.length) {
    if (fittedSigRef) fittedSigRef.current = '';
    return;
  }

  const sig = routeSignature(driving, walking);
  // Avoid re-fitting the same route (e.g. pin sync while a route is visible).
  if (fittedSigRef && fittedSigRef.current === sig) return;
  if (fittedSigRef) fittedSigRef.current = sig;

  const bounds = new ml.LngLatBounds();
  boundsPoints.forEach((p) => bounds.extend([p.longitude, p.latitude]));
  map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 500 });
}

/**
 * MapLibre + OpenFreeMap basemap with TooDoo gray style baked into the JSON.
 * Real DOM mount (not srcDoc).
 */
export function MapLibreMapView({
  center,
  zoom = 14,
  pins = [],
  interactive = true,
  showUserLocation = null,
  routeLine = null,
  walkingRouteLine = null,
  fitPins = false,
  onPinPress,
  onViewportChange,
  style,
}: Props) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const shellBg = mapShellBackground(mode);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const mlRef = useRef<MapLibreGl | null>(null);
  const userMarkerRef = useRef<MlMarker | null>(null);
  const onPinPressRef = useRef(onPinPress);
  onPinPressRef.current = onPinPress;
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  const fitPinsRef = useRef(fitPins);
  fitPinsRef.current = fitPins;
  const routeRef = useRef(routeLine);
  routeRef.current = routeLine;
  const walkingRouteRef = useRef(walkingRouteLine);
  walkingRouteRef.current = walkingRouteLine;
  const routeFitSigRef = useRef('');
  const userLocationRef = useRef(showUserLocation);
  userLocationRef.current = showUserLocation;
  const badgeBgRef = useRef(theme.screenBg);
  badgeBgRef.current = theme.cardBg;

  const syncUserLocation = (map: MlMap, ml: MapLibreGl) => {
    userMarkerRef.current?.remove();
    userMarkerRef.current = null;
    const loc = userLocationRef.current;
    if (!loc) return;
    const el = createUserLocationArrowElement();
    userMarkerRef.current = new ml.Marker({
      element: el,
      anchor: 'center',
      subpixelPositioning: true,
    })
      .setLngLat([loc.longitude, loc.latitude])
      .addTo(map);
  };

  const pinSignature = (p: MapLibrePin) =>
    `${p.latitude.toFixed(5)}:${p.longitude.toFixed(5)}:${p.selected ? 1 : 0}:${p.color}:${p.imageUri ?? ''}:${p.hasEvent ? 1 : 0}:${p.hasOffer ? 1 : 0}`;

  // Diff markers by id — recreating every marker on each pins change causes
  // image reloads and layout churn that make panning laggy.
  const markerByIdRef = useRef(
    new Map<string, { marker: MlMarker; sig: string }>()
  );

  const syncPins = (map: MlMap, ml: MapLibreGl) => {
    const markerById = markerByIdRef.current;
    const nextIds = new Set(pinsRef.current.map((p) => p.id));

    for (const [id, entry] of markerById) {
      if (!nextIds.has(id)) {
        entry.marker.remove();
        markerById.delete(id);
      }
    }

    for (const pin of pinsRef.current) {
      const sig = pinSignature(pin);
      const existing = markerById.get(pin.id);
      if (existing) {
        if (existing.sig === sig) continue;
        existing.marker.remove();
        markerById.delete(pin.id);
      }
      const el = createPinElement(pin, badgeBgRef.current);
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        onPinPressRef.current?.(pin.id);
      });
      const marker = new ml.Marker({
        element: el,
        anchor: 'center',
        offset: businessPinMarkerOffset(pin.selected),
        subpixelPositioning: true,
      })
        .setLngLat([pin.longitude, pin.latitude])
        .addTo(map);
      markerById.set(pin.id, { marker, sig });
    }

    if (routeRef.current?.length || walkingRouteRef.current?.length) {
      syncRouteLines(map, ml, routeRef.current, walkingRouteRef.current, routeFitSigRef);
      return;
    }
    if (fitPinsRef.current && pinsRef.current.length > 0) {
      const bounds = new ml.LngLatBounds();
      pinsRef.current.forEach((p) => bounds.extend([p.longitude, p.latitude]));
      map.fitBounds(bounds, { padding: 64, maxZoom: 15, duration: 400 });
    }
  };

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    const host = hostRef.current;
    if (!host) return;

    void (async () => {
      try {
        const [ml, mapStyle] = await Promise.all([
          loadMapLibre(),
          loadTooDooMapStyle(),
        ]);
        if (cancelled || mapRef.current) return;

        mlRef.current = ml;
        const map = new ml.Map({
          container: host,
          style: mapStyle,
          center: [center.longitude, center.latitude],
          zoom,
          interactive,
          attributionControl: false,
          // High-DPR screens (and DPR-3 device emulation) explode the WebGL
          // framebuffer size — cap it, the map still looks sharp at 2x.
          pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
          // Skip raster/symbol fade-in animations.
          fadeDuration: 0,
        });
        mapRef.current = map;

        const emitViewport = () => {
          try {
            const [[west, south], [east, north]] = map.getBounds().toArray();
            onViewportChangeRef.current?.({ west, south, east, north });
          } catch {
            // Bounds unavailable before first render.
          }
        };

        map.on('load', () => {
          map.resize();
          syncPins(map, ml);
          syncRouteLines(map, ml, routeRef.current, walkingRouteRef.current, routeFitSigRef);
          syncUserLocation(map, ml);
          emitViewport();
        });
        map.on('moveend', emitViewport);

        const onWinResize = () => map.resize();
        window.addEventListener('resize', onWinResize);
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => map.resize());
          resizeObserver.observe(host);
        }

        (map as MlMap & { __cleanup?: () => void }).__cleanup = () => {
          window.removeEventListener('resize', onWinResize);
        };
      } catch {
        // Map failed to load — leave empty shell.
      }
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      const map = mapRef.current as (MlMap & { __cleanup?: () => void }) | null;
      map?.__cleanup?.();
      markerByIdRef.current.forEach((entry) => entry.marker.remove());
      markerByIdRef.current.clear();
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [MAP_PAINT_VERSION]);

  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!map || !ml) return;
    syncRouteLines(map, ml, routeLine, walkingRouteLine, routeFitSigRef);
  }, [routeLine, walkingRouteLine]);

  // Only follow center/zoom prop changes — never reset the camera just because
  // route lines were cleared (deselect on the explore map).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (routeRef.current?.length || walkingRouteRef.current?.length) return;
    map.setCenter([center.longitude, center.latitude]);
    map.setZoom(zoom);
  }, [center.latitude, center.longitude, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!map || !ml) return;
    syncPins(map, ml);
  }, [fitPins, pins, mode]);

  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!map || !ml) return;
    syncUserLocation(map, ml);
  }, [showUserLocation]);

  return (
    <View style={[styles.fill, { backgroundColor: shellBg }, style]}>
      <div
        ref={hostRef}
        style={{ width: '100%', height: '100%', backgroundColor: shellBg }}
      />
      <Text style={styles.attribution} pointerEvents="none">
        {MAP_ATTRIBUTION}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
  },
  attribution: {
    position: 'absolute',
    left: 6,
    bottom: 4,
    zIndex: 2,
    fontSize: 9,
    color: 'rgba(0,0,0,0.55)',
    backgroundColor: 'rgba(255,255,255,0.75)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
});
