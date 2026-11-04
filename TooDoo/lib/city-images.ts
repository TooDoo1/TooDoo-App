import { apiUrl, normalizeImageUrl } from '@/lib/api';

export type CityImage = {
  id: string;
  city?: string;
  cityKey?: string;
  publicUrl: string;
  sortOrder?: number;
  description?: string | null;
};

type CityImagesResponse = {
  images?: CityImage[];
};

const cache = new Map<string, { at: number; uris: string[] }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function cityCacheKey(city: string) {
  return city.trim().toLocaleLowerCase('sv-SE');
}

/** Unwrap Gmail/Google redirect wrappers sometimes stored as publicUrl. */
function unwrapCityImageUrl(raw?: unknown): string | undefined {
  const normalized = normalizeImageUrl(raw);
  if (!normalized) return undefined;
  try {
    const url = new URL(normalized);
    if (
      (url.hostname === 'www.google.com' || url.hostname === 'google.com') &&
      url.pathname === '/url'
    ) {
      const nested = url.searchParams.get('q') ?? url.searchParams.get('url');
      if (nested) return normalizeImageUrl(nested) ?? nested;
    }
  } catch {
    // keep normalized
  }
  return normalized;
}

/** Public city scenery for the home hero — GET /city-images?city= */
export async function fetchCityImageUris(city: string, take = 3): Promise<string[]> {
  const trimmed = city.trim();
  if (!trimmed) return [];

  const key = cityCacheKey(trimmed);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.uris.slice(0, take);
  }

  try {
    const res = await fetch(
      apiUrl(`/city-images?city=${encodeURIComponent(trimmed)}`)
    );
    if (!res.ok) {
      cache.set(key, { at: Date.now(), uris: [] });
      return [];
    }
    const json = (await res.json().catch(() => null)) as CityImagesResponse | null;
    const rows = Array.isArray(json?.images) ? json.images : [];
    const uris = rows
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((row) => unwrapCityImageUrl(row.publicUrl))
      .filter((uri): uri is string => Boolean(uri))
      .slice(0, Math.max(1, take));

    cache.set(key, { at: Date.now(), uris });
    return uris;
  } catch {
    return [];
  }
}

export function peekCityImageUris(city: string): string[] | null {
  const hit = cache.get(cityCacheKey(city));
  if (!hit) return null;
  if (Date.now() - hit.at >= CACHE_TTL_MS) return null;
  return hit.uris;
}

/** Seed the cache from GET /home cityImages so the hero skips a second round-trip. */
export function primeCityImageUris(city: string, uris: string[]) {
  const trimmed = city.trim();
  if (!trimmed) return;
  const clean = uris.map((uri) => unwrapCityImageUrl(uri)).filter((uri): uri is string => Boolean(uri));
  cache.set(cityCacheKey(trimmed), { at: Date.now(), uris: clean });
}

export function cityImageUrisFromRows(rows: CityImage[], take = 3): string[] {
  return rows
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((row) => unwrapCityImageUrl(row.publicUrl))
    .filter((uri): uri is string => Boolean(uri))
    .slice(0, Math.max(1, take));
}
