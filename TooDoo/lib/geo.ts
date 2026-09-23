import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

export type Coords = { lat: number; lng: number };

/** Rough bounds for southern Sweden — rejects null island and obvious bad data. */
export function isPlausibleSwedenCoordinate(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 54 && lat <= 70 && lng >= 10 && lng <= 26;
}

const NOMINATIM_USER_AGENT = 'TooDooApp/1.0 (contact: support@toodoo.app)';

function withSwedenHint(address: string): string {
  const lower = address.toLowerCase();
  if (
    lower.includes('sverige') ||
    lower.includes('sweden') ||
    /,?\s*se\s*$/i.test(address)
  ) {
    return address;
  }
  return `${address}, Sverige`;
}

/** Photon (Komoot) — CORS-friendly and reliable from web browsers. */
async function geocodeAddressPhoton(address: string): Promise<Coords | null> {
  try {
    const response = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=5&lang=default`,
      { headers: { Accept: 'application/json' } }
    );
    if (!response.ok) return null;
    const json = (await response.json()) as {
      features?: Array<{
        properties?: { countrycode?: string };
        geometry?: { coordinates?: [number, number] };
      }>;
    };
    const features = Array.isArray(json.features) ? json.features : [];
    const preferred =
      features.find((f) => f.properties?.countrycode?.toUpperCase() === 'SE') ??
      features[0];
    const pair = preferred?.geometry?.coordinates;
    if (!pair || pair.length < 2) return null;
    const [lng, lat] = pair;
    if (isPlausibleSwedenCoordinate(lat, lng)) {
      return { lat, lng };
    }
  } catch {
    // ignore
  }
  return null;
}

/** Nominatim raw lookup (often blocked/rate-limited in browsers). */
async function geocodeAddressNominatimRaw(address: string): Promise<Coords | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=se&q=${encodeURIComponent(address)}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': NOMINATIM_USER_AGENT,
        },
      }
    );
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('json')) return null;
    const results: Array<{ lat: string; lon: string }> = await response.json();
    const firstResult = results?.[0];
    const lat = Number(firstResult?.lat);
    const lng = Number(firstResult?.lon);
    if (isPlausibleSwedenCoordinate(lat, lng)) {
      return { lat, lng };
    }
  } catch {
    // ignore
  }
  return null;
}

/** Try Photon first (web-friendly), then Nominatim; retry with a Sweden hint. */
export async function geocodeAddressNominatim(address: string): Promise<Coords | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const attempts = [trimmed, withSwedenHint(trimmed)];
  for (const query of attempts) {
    const photon = await geocodeAddressPhoton(query);
    if (photon) return photon;
    const nominatim = await geocodeAddressNominatimRaw(query);
    if (nominatim) return nominatim;
  }
  return null;
}

/** Great-circle distance between two coordinates, in kilometers. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** Format a distance in km for display badges. */
export function formatDistanceKm(distanceKm?: number): string | null {
  if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm)) return null;
  if (distanceKm < 1) {
    return `${Math.max(0, Math.round(distanceKm * 1000))} m`;
  }
  const text = distanceKm >= 10 ? distanceKm.toFixed(0) : distanceKm.toFixed(1);
  return `${text} km`;
}

const GEOCODE_CACHE_PREFIX = 'toodoo_geocode_';
const webGeocodeCache = new Map<string, Coords | null>();

async function cacheNativeGeocodeResult(key: string, coords: Coords | null) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(coords));
  } catch {
    // ignore cache write errors
  }
}

/** Geocode a postal address to coordinates, caching results (and misses). */
export async function geocodeAddressCached(address: string): Promise<Coords | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;
  const cacheKey = trimmed.toLowerCase();

  if (Platform.OS === 'web') {
    // Don't cache misses — CORS/rate-limit failures would lock out retries.
    if (webGeocodeCache.has(cacheKey)) {
      const hit = webGeocodeCache.get(cacheKey);
      if (hit) return hit;
    }
    const result = await geocodeAddressNominatim(trimmed);
    if (result) webGeocodeCache.set(cacheKey, result);
    return result;
  }

  const key = `${GEOCODE_CACHE_PREFIX}${cacheKey}`;

  try {
    const cached = await AsyncStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
        return parsed;
      }
      // Ignore cached misses so a previous Nominatim failure can recover via Photon.
    }
  } catch {
    // ignore cache read errors
  }

  try {
    const results = await Location.geocodeAsync(trimmed);
    const first = results?.[0];
    if (
      first &&
      isPlausibleSwedenCoordinate(first.latitude, first.longitude)
    ) {
      const coords: Coords = { lat: first.latitude, lng: first.longitude };
      await cacheNativeGeocodeResult(key, coords);
      return coords;
    }
  } catch {
    // Native geocoder unavailable — fall through to Nominatim.
  }

  const fallback = await geocodeAddressNominatim(trimmed);
  if (fallback) {
    await cacheNativeGeocodeResult(key, fallback);
  }
  return fallback;
}

export type DistanceCard = {
  id: string;
  Adress: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
};

/** Attach km distance from stored coordinates when geocoding is unavailable. */
export function applyHaversineDistances<T extends DistanceCard>(
  cards: T[],
  userCoords: Coords
): T[] {
  return cards.map((card) => {
    const lat = card.latitude;
    const lng = card.longitude;
    if (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      isPlausibleSwedenCoordinate(lat, lng)
    ) {
      return {
        ...card,
        distanceKm: haversineKm(userCoords.lat, userCoords.lng, lat, lng),
      };
    }

    return card;
  });
}

/** Resolve distances from geocoded addresses, falling back to stored coordinates. */
export async function fillMissingDistancesFromAddresses<T extends DistanceCard>(
  cards: T[],
  userCoords: Coords,
  options?: { maxGeocode?: number }
): Promise<T[]> {
  const maxGeocode = options?.maxGeocode ?? 24;
  const distanceById = new Map<string, number>();

  const geocodeCandidates = cards
    .filter((card) => card.Adress && card.Adress !== 'Adress saknas')
    .slice(0, maxGeocode);

  for (const card of geocodeCandidates) {
    const geo = await geocodeAddressCached(card.Adress);
    if (geo) {
      distanceById.set(
        card.id,
        haversineKm(userCoords.lat, userCoords.lng, geo.lat, geo.lng)
      );
    }
  }

  const withCoordFallback = applyHaversineDistances(cards, userCoords);

  return withCoordFallback.map((card) => {
    const geocoded = distanceById.get(card.id);
    return typeof geocoded === 'number' ? { ...card, distanceKm: geocoded } : card;
  });
}

/** Reverse-geocode coordinates to a city name suitable for the user profile `location` field. */
export async function reverseGeocodeCity(coords: Coords): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: coords.lat,
      longitude: coords.lng,
    });
    const first = results?.[0];
    const city = first?.city ?? first?.subregion ?? first?.region;
    const trimmed = typeof city === 'string' ? city.trim() : '';
    return trimmed || null;
  } catch {
    return null;
  }
}

type BrowserGeolocationPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

async function queryBrowserGeolocationPermission(): Promise<BrowserGeolocationPermission> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return 'unknown';
  }

  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') {
      return status.state;
    }
  } catch {
    // Safari / older browsers may not support querying geolocation.
  }

  return 'unknown';
}

async function readCoordsFromBrowser(options?: {
  timeout?: number;
  maximumAge?: number;
}): Promise<Coords | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => resolve(null),
      {
        enableHighAccuracy: false,
        timeout: options?.timeout ?? 10000,
        maximumAge: options?.maximumAge ?? 60000,
      }
    );
  });
}

async function readCoordsFromDevice(): Promise<Coords | null> {
  const position =
    (await Location.getLastKnownPositionAsync()) ??
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  if (position?.coords) {
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  }
  return null;
}

/** True when foreground location permission was already granted. */
export async function hasForegroundLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    const permission = await queryBrowserGeolocationPermission();
    if (permission === 'granted') return true;
    if (permission === 'denied') return false;
    const cached = await readCoordsFromBrowser({ timeout: 1500, maximumAge: 600_000 });
    return cached != null;
  }
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/** Read coordinates only when permission is already granted (no permission prompt). */
export async function getUserCoordsIfGranted(): Promise<Coords | null> {
  if (Platform.OS === 'web') {
    const permission = await queryBrowserGeolocationPermission();
    if (permission === 'denied' || permission === 'prompt') return null;
    if (permission === 'granted') {
      return readCoordsFromBrowser();
    }

    // Safari often lacks the Permissions API — try a cached position only.
    // A short timeout still can prompt on some browsers, so keep maximumAge high
    // and treat failure as "not granted yet".
    return readCoordsFromBrowser({ timeout: 800, maximumAge: 600_000 });
  }
  try {
    if (!(await hasForegroundLocationPermission())) return null;
    return await readCoordsFromDevice();
  } catch {
    return null;
  }
}

/** Request foreground location permission and resolve the user's coordinates (or null). */
export async function getUserCoords(): Promise<Coords | null> {
  if (Platform.OS === 'web') return readCoordsFromBrowser();
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    return await readCoordsFromDevice();
  } catch {
    return null;
  }
}

/**
 * Preferred app location: selected custom place, otherwise device GPS.
 * Use this for distances, map origin, and “near you” sorting.
 */
export async function getEffectiveUserCoords(): Promise<Coords | null> {
  const { getActiveCustomLocationCoords } = await import('@/lib/custom-locations');
  const custom = await getActiveCustomLocationCoords();
  if (custom) return custom;
  return getUserCoords();
}

/** Like getUserCoordsIfGranted, but honors an active custom location first. */
export async function getEffectiveUserCoordsIfGranted(): Promise<Coords | null> {
  const { getActiveCustomLocationCoords } = await import('@/lib/custom-locations');
  const custom = await getActiveCustomLocationCoords();
  if (custom) return custom;
  return getUserCoordsIfGranted();
}

/** Resolve the user's position for map directions (reuse grant or ask once on web). */
export async function resolveMapOriginCoords(): Promise<Coords | null> {
  const { getActiveCustomLocationCoords } = await import('@/lib/custom-locations');
  const custom = await getActiveCustomLocationCoords();
  if (custom) return custom;

  const grantedCoords = await getUserCoordsIfGranted();
  if (grantedCoords) return grantedCoords;

  if (Platform.OS === 'web') {
    const permission = await queryBrowserGeolocationPermission();
    if (permission === 'denied') return null;
    return getUserCoords();
  }

  return null;
}

export type ResolvedUserLocation = {
  coords: Coords;
  city: string;
};

/**
 * Resolve the user's city from device location.
 * When requestPermission is false, only runs if permission was already granted.
 */
export async function resolveUserCityFromDevice(options?: {
  requestPermission?: boolean;
}): Promise<ResolvedUserLocation | null> {
  const requestPermission = options?.requestPermission ?? false;
  const coords = requestPermission
    ? await getEffectiveUserCoords()
    : await getEffectiveUserCoordsIfGranted();
  if (!coords) return null;
  const city = await reverseGeocodeCity(coords);
  if (!city) return null;
  return { coords, city };
}
