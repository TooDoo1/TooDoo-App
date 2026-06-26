import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

export type Coords = { lat: number; lng: number };

/** Rough bounds for southern Sweden — rejects null island and obvious bad data. */
export function isPlausibleSwedenCoordinate(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 54 && lat <= 70 && lng >= 10 && lng <= 26;
}

const NOMINATIM_USER_AGENT = 'TooDooApp/1.0 (contact: support@toodoo.app)';

/** Geocode a postal address via Nominatim (works on web and native). */
export async function geocodeAddressNominatim(address: string): Promise<Coords | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=se&q=${encodeURIComponent(trimmed)}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': NOMINATIM_USER_AGENT,
        },
      }
    );
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
    if (webGeocodeCache.has(cacheKey)) {
      return webGeocodeCache.get(cacheKey) ?? null;
    }
    const result = await geocodeAddressNominatim(trimmed);
    webGeocodeCache.set(cacheKey, result);
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
      // Cached "no result" marker — don't retry.
      return null;
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
  await cacheNativeGeocodeResult(key, fallback);
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
    if (permission === 'denied') return null;
    if (permission === 'granted') {
      return readCoordsFromBrowser();
    }

    // Safari often lacks the Permissions API — try a cached position from an earlier grant.
    return readCoordsFromBrowser({ timeout: 2500, maximumAge: 600_000 });
  }
  try {
    if (!(await hasForegroundLocationPermission())) return null;
    return await readCoordsFromDevice();
  } catch {
    return null;
  }
}

/** Resolve the user's position for map directions (reuse grant or ask once on web). */
export async function resolveMapOriginCoords(): Promise<Coords | null> {
  const grantedCoords = await getUserCoordsIfGranted();
  if (grantedCoords) return grantedCoords;

  if (Platform.OS === 'web') {
    const permission = await queryBrowserGeolocationPermission();
    if (permission === 'denied') return null;
    return getUserCoords();
  }

  return null;
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
  const coords = requestPermission ? await getUserCoords() : await getUserCoordsIfGranted();
  if (!coords) return null;
  const city = await reverseGeocodeCity(coords);
  if (!city) return null;
  return { coords, city };
}
