import type { Coords } from '@/lib/geo';

export type RoutePoint = { latitude: number; longitude: number };

export type RouteMode = 'driving' | 'walking';

export type DrivingRoute = {
  coordinates: RoutePoint[];
  distanceMeters: number;
  durationSeconds: number;
  mode: RouteMode;
};

export type TravelRoutes = {
  driving: DrivingRoute | null;
  walking: DrivingRoute | null;
};

/**
 * Public OSRM demo only serves car profiles — `/walking` returns car times.
 * FOSSGIS foot routing (same stack OSM.org uses) for walking estimates.
 */
function osrmRouteUrl(from: Coords, to: Coords, mode: RouteMode): string {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const query = 'overview=full&geometries=geojson';
  if (mode === 'walking') {
    return `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${coords}?${query}`;
  }
  return `https://router.project-osrm.org/route/v1/driving/${coords}?${query}`;
}

async function fetchOsrmRoute(
  from: Coords,
  to: Coords,
  mode: RouteMode
): Promise<DrivingRoute | null> {
  if (
    !Number.isFinite(from.lat) ||
    !Number.isFinite(from.lng) ||
    !Number.isFinite(to.lat) ||
    !Number.isFinite(to.lng)
  ) {
    return null;
  }

  try {
    const res = await fetch(osrmRouteUrl(from, to, mode));
    if (!res.ok) return null;
    const json = (await res.json()) as {
      code?: string;
      routes?: Array<{
        distance: number;
        duration: number;
        geometry?: { coordinates?: [number, number][] };
      }>;
    };
    const route = json.routes?.[0];
    const coords = route?.geometry?.coordinates;
    if (!route || !coords?.length) return null;

    return {
      mode,
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      coordinates: coords.map(([lng, lat]) => ({
        latitude: lat,
        longitude: lng,
      })),
    };
  } catch {
    return null;
  }
}

/** Free routes via public OSRM / FOSSGIS servers (OSM data). */
export async function fetchTravelRoutes(
  from: Coords,
  to: Coords
): Promise<TravelRoutes> {
  const [driving, walking] = await Promise.all([
    fetchOsrmRoute(from, to, 'driving'),
    fetchOsrmRoute(from, to, 'walking'),
  ]);
  return { driving, walking };
}

/**
 * @deprecated Prefer fetchTravelRoutes — kept for callers that need a single polyline.
 * Prefers walking when the trip is short; otherwise driving.
 */
export async function fetchDrivingRoute(
  from: Coords,
  to: Coords
): Promise<DrivingRoute | null> {
  const { driving, walking } = await fetchTravelRoutes(from, to);
  if (walking && walking.distanceMeters <= 1800) {
    return walking;
  }
  return driving ?? walking;
}

export function formatRouteModeLabel(mode: RouteMode): string {
  return mode === 'walking' ? 'gång' : 'bil';
}

export function formatRouteSummary(route: DrivingRoute): string {
  const minutes = Math.max(1, Math.round(route.durationSeconds / 60));
  const km = route.distanceMeters / 1000;
  const distance =
    km < 1
      ? `${Math.round(route.distanceMeters)} m`
      : km < 10
        ? `${km.toFixed(1)} km`
        : `${Math.round(km)} km`;
  return `${minutes} min · ${distance}`;
}

/** OpenStreetMap directions — car or foot engine. */
export function buildOsmDirectionsUrl(
  from: RoutePoint,
  to: RoutePoint,
  mode: RouteMode = 'driving'
): string {
  const engine = mode === 'walking' ? 'fossgis_osrm_foot' : 'fossgis_osrm_car';
  return (
    `https://www.openstreetmap.org/directions?engine=${engine}&route=` +
    `${from.latitude}%2C${from.longitude}%3B${to.latitude}%2C${to.longitude}`
  );
}

/** Google Maps directions (opens in browser / Maps app). */
export function buildGoogleMapsDirectionsUrl(
  to: RoutePoint,
  from?: RoutePoint | null,
  mode: RouteMode = 'driving'
): string {
  const travelmode = mode === 'walking' ? 'walking' : 'driving';
  const params = new URLSearchParams({
    api: '1',
    destination: `${to.latitude},${to.longitude}`,
    travelmode,
  });
  if (
    from &&
    Number.isFinite(from.latitude) &&
    Number.isFinite(from.longitude)
  ) {
    params.set('origin', `${from.latitude},${from.longitude}`);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Google Maps place search by address when coordinates are unavailable. */
export function buildGoogleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
