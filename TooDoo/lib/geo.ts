import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

export type Coords = { lat: number; lng: number };

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
  const text = distanceKm >= 10 ? distanceKm.toFixed(0) : distanceKm.toFixed(1);
  return `${text} km`;
}

const GEOCODE_CACHE_PREFIX = 'toodoo_geocode_';

/** Geocode a postal address to coordinates, caching results (and misses) in AsyncStorage. */
export async function geocodeAddressCached(address: string): Promise<Coords | null> {
  if (Platform.OS === 'web' || !address) return null;
  const key = `${GEOCODE_CACHE_PREFIX}${address.trim().toLowerCase()}`;

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
    const results = await Location.geocodeAsync(address);
    const first = results?.[0];
    if (first && Number.isFinite(first.latitude) && Number.isFinite(first.longitude)) {
      const coords: Coords = { lat: first.latitude, lng: first.longitude };
      try {
        await AsyncStorage.setItem(key, JSON.stringify(coords));
      } catch {
        // ignore cache write errors
      }
      return coords;
    }
    try {
      await AsyncStorage.setItem(key, JSON.stringify(null));
    } catch {
      // ignore
    }
  } catch {
    // Geocoding unavailable / failed; skip.
  }
  return null;
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

async function readCoordsFromBrowser(): Promise<Coords | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
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

async function hasBrowserGeolocationPermission(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return false;
  }

  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state === 'granted';
  } catch {
    return false;
  }
}

/** True when foreground location permission was already granted. */
export async function hasForegroundLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return hasBrowserGeolocationPermission();
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
    if (!(await hasBrowserGeolocationPermission())) return null;
    return readCoordsFromBrowser();
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
