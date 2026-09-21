import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useThemePreference } from '@/context/theme-preference-context';
import { loadTooDooMapStyle, MAP_PAINT_VERSION } from '@/lib/maplibre-brand';
import { createBusinessPinElement, businessPinMarkerOffset } from '@/lib/map-business-pin';
import { MAP_ATTRIBUTION, mapShellBackground } from '@/lib/map-style';
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
  style?: ViewStyle;
};

type MlMap = {
  remove: () => void;
  resize: () => void;
  setCenter: (c: [number, number]) => void;
  setZoom: (z: number) => void;
  fitBounds: (b: unknown, o?: object) => void;
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

function syncRouteLines(
  map: MlMap,
  ml: MapLibreGl,
  driving: RouteCoords | null | undefined,
  walking: RouteCoords | null | undefined
) {
  if (!map.isStyleLoaded?.()) return;

  upsertRouteLayer(map, driving, DRIVING_ROUTE);
  upsertRouteLayer(map, walking, WALKING_ROUTE);

  const boundsPoints = [...(driving ?? []), ...(walking ?? [])];
  if (!boundsPoints.length) return;

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
  style,
}: Props) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const shellBg = mapShellBackground(mode);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const mlRef = useRef<MapLibreGl | null>(null);
  const markersRef = useRef<MlMarker[]>([]);
  const userMarkerRef = useRef<MlMarker | null>(null);
  const onPinPressRef = useRef(onPinPress);
  onPinPressRef.current = onPinPress;
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  const fitPinsRef = useRef(fitPins);
  fitPinsRef.current = fitPins;
  const routeRef = useRef(routeLine);
  routeRef.current = routeLine;
  const walkingRouteRef = useRef(walkingRouteLine);
  walkingRouteRef.current = walkingRouteLine;
  const badgeBgRef = useRef(theme.screenBg);
  badgeBgRef.current = theme.cardBg;

  const syncPins = (map: MlMap, ml: MapLibreGl) => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    for (const pin of pinsRef.current) {
      const el = createPinElement(pin, badgeBgRef.current);
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        onPinPressRef.current?.(pin.id);
      });
      const marker = new ml.Marker({
        element: el,
        anchor: 'center',
        offset: businessPinMarkerOffset(pin.selected),
      })
        .setLngLat([pin.longitude, pin.latitude])
        .addTo(map);
      markersRef.current.push(marker);
    }
    if (routeRef.current?.length || walkingRouteRef.current?.length) {
      syncRouteLines(map, ml, routeRef.current, walkingRouteRef.current);
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
        });
        mapRef.current = map;

        map.on('load', () => {
          map.resize();
          syncPins(map, ml);
          syncRouteLines(map, ml, routeRef.current, walkingRouteRef.current);
        });

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
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
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
    syncRouteLines(map, ml, routeLine, walkingRouteLine);
  }, [routeLine, walkingRouteLine]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (routeLine?.length || walkingRouteLine?.length) return;
    map.setCenter([center.longitude, center.latitude]);
    map.setZoom(zoom);
  }, [center.latitude, center.longitude, zoom, routeLine, walkingRouteLine]);

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
    userMarkerRef.current?.remove();
    userMarkerRef.current = null;
    if (!showUserLocation) return;
    const el = document.createElement('div');
    el.style.cssText =
      'width:14px;height:14px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 0 0 4px rgba(59,130,246,0.25)';
    userMarkerRef.current = new ml.Marker({ element: el })
      .setLngLat([showUserLocation.longitude, showUserLocation.latitude])
      .addTo(map);
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
