import { apiUrl, fetchWithTimeout } from '@/lib/api';
import { fetchCategoriesCatalog } from '@/lib/catalog-cache';
import { fetchJsonWithEtag } from '@/lib/etag-cache';
import { resolveEventFeedCity } from '@/lib/events-feed';
import type { Coords } from '@/lib/geo';

/** Default page size for city-scoped list requests. */
export const NEARBY_PAGE_SIZE = 24;

/** Hard caps — never pull the national catalog for these surfaces. */
export const UTFORSKA_BUSINESS_CAP = 72;
export const MAP_BUSINESS_CANDIDATE_CAP = 48;
export const NARA_DIG_BUSINESS_CAP = 60;
export const NEARBY_RADIUS_M = 5000;

/** Slim city list row from GET /business/city-cards (and nearby/batch). */
export type CityCard = {
  id: string;
  name: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
  categoryName?: string;
  hasOffer?: boolean;
  hasEvent?: boolean;
  openingHours?: unknown;
  distanceKm?: number;
};

/** Pin-only row from GET /map/pins. */
export type MapPinCard = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  imageUrl?: string;
  hasOffer?: boolean;
  hasEvent?: boolean;
};

export type FetchApprovedBusinessPageOptions = {
  city?: string | null;
  skip?: number;
  take?: number;
  coords?: Coords | null;
  /** When coords are set, request server distance sort. */
  sortByDistance?: boolean;
  signal?: AbortSignal;
};

export type CityBusinessSource = 'city-cards' | 'nearby' | 'business';

export type CatalogLikeBusiness = {
  id: string;
  name: string;
  city?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
  categoryName?: string;
  categoryId?: string;
  categoryIds?: string[];
  category?: { id?: string; name?: string };
  openingHours?: unknown;
  hasOffer?: boolean;
  hasEvent?: boolean;
  status?: string;
  distanceKm?: number;
};

function parseBusinessesPayload(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  const obj = json as Record<string, unknown>;
  if (Array.isArray(obj?.businesses)) return obj.businesses;
  if (Array.isArray(obj?.items)) return obj.items;
  if (Array.isArray(obj?.data)) return obj.data;
  if (Array.isArray(obj?.cards)) return obj.cards;
  if (Array.isArray(obj?.pins)) return obj.pins;
  return [];
}

export function parseCityCards(json: unknown): CityCard[] {
  const out: CityCard[] = [];
  parseBusinessesPayload(json).forEach((row, index) => {
    const item = row as Record<string, unknown>;
    const id = item?.id ?? item?._id;
    if (id == null) return;
    const lat =
      typeof item.latitude === 'number'
        ? item.latitude
        : typeof item.lat === 'number'
          ? item.lat
          : undefined;
    const lng =
      typeof item.longitude === 'number'
        ? item.longitude
        : typeof item.lng === 'number'
          ? item.lng
          : undefined;
    const categoryFromNested =
      item.category &&
      typeof item.category === 'object' &&
      typeof (item.category as { name?: unknown }).name === 'string'
        ? String((item.category as { name: string }).name)
        : undefined;
    const distanceKm =
      typeof item.distanceKm === 'number' && Number.isFinite(item.distanceKm)
        ? item.distanceKm
        : undefined;
    out.push({
      id: String(id),
      name: typeof item.name === 'string' ? item.name : `Företag ${index + 1}`,
      city: typeof item.city === 'string' ? item.city : undefined,
      latitude: lat,
      longitude: lng,
      imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : undefined,
      categoryName:
        typeof item.categoryName === 'string' ? item.categoryName : categoryFromNested,
      hasOffer: Boolean(item.hasOffer ?? item.hasActiveOffer),
      hasEvent: Boolean(item.hasEvent),
      openingHours: item.openingHours,
      distanceKm,
    });
  });
  return out;
}

let categoryNameToIdPromise: Promise<Map<string, string>> | null = null;

async function getCategoryNameToIdMap(): Promise<Map<string, string>> {
  if (!categoryNameToIdPromise) {
    categoryNameToIdPromise = (async () => {
      const map = new Map<string, string>();
      try {
        const categories = (await fetchCategoriesCatalog()) as Array<{
          id?: string;
          _id?: string;
          name?: string;
        }>;
        for (const category of categories) {
          const id = category?.id ?? category?._id;
          const name = category?.name?.trim();
          if (!id || !name) continue;
          map.set(name.toLocaleLowerCase('sv-SE'), String(id));
        }
      } catch {
        // Category chips still work by name where supported.
      }
      return map;
    })();
  }
  return categoryNameToIdPromise;
}

/** Normalize a city-card into the catalog-shaped object existing mappers expect. */
export function cityCardToCatalogBusiness(
  card: CityCard,
  categoryNameToId?: Map<string, string>
): CatalogLikeBusiness {
  const categoryName = card.categoryName?.trim();
  const categoryId = categoryName
    ? categoryNameToId?.get(categoryName.toLocaleLowerCase('sv-SE'))
    : undefined;
  return {
    id: card.id,
    name: card.name,
    city: card.city,
    // city-cards has no street address — keep city so labels aren't empty.
    address: card.city,
    latitude: card.latitude,
    longitude: card.longitude,
    imageUrl: card.imageUrl,
    categoryName,
    categoryId,
    categoryIds: categoryId ? [categoryId] : undefined,
    category: categoryName
      ? { id: categoryId, name: categoryName }
      : undefined,
    openingHours: card.openingHours,
    hasOffer: Boolean(card.hasOffer),
    hasEvent: Boolean(card.hasEvent),
    status: 'APPROVED',
    distanceKm: card.distanceKm,
  };
}

async function cardsToCatalog(cards: CityCard[]): Promise<CatalogLikeBusiness[]> {
  const categoryNameToId = await getCategoryNameToIdMap();
  return cards.map((card) => cityCardToCatalogBusiness(card, categoryNameToId));
}

/**
 * One page from GET /business/city-cards (city required by API).
 * Supports take + skip, and optional lat/lng + sort=distance.
 */
export async function fetchCityCardsPage(
  options: FetchApprovedBusinessPageOptions = {}
): Promise<CityCard[]> {
  const take = Math.min(Math.max(options.take ?? NEARBY_PAGE_SIZE, 1), 100);
  const skip = Math.max(options.skip ?? 0, 0);
  const city = options.city?.trim();
  if (!city) {
    throw new Error('city-cards requires city');
  }

  const params = new URLSearchParams();
  params.set('city', city);
  params.set('take', String(take));
  if (skip > 0) params.set('skip', String(skip));
  if (options.coords && (options.sortByDistance || options.coords)) {
    params.set('lat', String(options.coords.lat));
    params.set('lng', String(options.coords.lng));
    if (options.sortByDistance !== false) {
      params.set('sort', 'distance');
    }
  }

  const url = apiUrl(`/business/city-cards?${params.toString()}`);
  const { status, json } = await fetchJsonWithEtag<unknown>({
    url,
    cacheKey: `city-cards:${params.toString()}`,
    useEtag: true,
    init: { signal: options.signal },
  });
  if (status === 304 && json != null) {
    return parseCityCards(json);
  }
  if (status < 200 || status >= 300) {
    throw new Error(`city-cards failed: ${status}`);
  }
  return parseCityCards(json ?? []);
}

/** GET /business/nearby — slim cards sorted by distance. */
export async function fetchNearbyBusinessCards(options: {
  coords: Coords;
  take?: number;
  radiusM?: number;
  signal?: AbortSignal;
}): Promise<CityCard[]> {
  const take = Math.min(Math.max(options.take ?? NARA_DIG_BUSINESS_CAP, 1), 100);
  const radius = Math.max(options.radiusM ?? NEARBY_RADIUS_M, 100);
  const params = new URLSearchParams({
    lat: String(options.coords.lat),
    lng: String(options.coords.lng),
    radius: String(radius),
    take: String(take),
  });
  const res = await fetchWithTimeout(apiUrl(`/business/nearby?${params.toString()}`), {
    signal: options.signal,
  });
  if (!res.ok) {
    throw new Error(`nearby failed: ${res.status}`);
  }
  return parseCityCards(await res.json().catch(() => []));
}

/** GET /map/pins — pin-ready rows with offer/event flags. */
export async function fetchMapPins(options: {
  city: string;
  take?: number;
  signal?: AbortSignal;
}): Promise<MapPinCard[]> {
  const city = options.city.trim();
  if (!city) throw new Error('map/pins requires city');
  const take = Math.min(Math.max(options.take ?? MAP_BUSINESS_CANDIDATE_CAP, 1), 100);
  const params = new URLSearchParams({
    city,
    take: String(take),
  });
  const res = await fetchWithTimeout(apiUrl(`/map/pins?${params.toString()}`), {
    signal: options.signal,
  });
  if (!res.ok) {
    throw new Error(`map/pins failed: ${res.status}`);
  }
  const cards = parseCityCards(await res.json().catch(() => []));
  return cards
    .filter(
      (card) =>
        typeof card.latitude === 'number' &&
        Number.isFinite(card.latitude) &&
        typeof card.longitude === 'number' &&
        Number.isFinite(card.longitude)
    )
    .map((card) => ({
      id: card.id,
      name: card.name,
      latitude: card.latitude as number,
      longitude: card.longitude as number,
      imageUrl: card.imageUrl,
      hasOffer: card.hasOffer,
      hasEvent: card.hasEvent,
    }));
}

/** GET /business/batch?ids= — slim city-card rows for many ids. */
export async function fetchBusinessBatch(
  ids: string[],
  signal?: AbortSignal
): Promise<CityCard[]> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))].slice(0, 50);
  if (unique.length === 0) return [];
  const params = new URLSearchParams({ ids: unique.join(',') });
  const res = await fetchWithTimeout(apiUrl(`/business/batch?${params.toString()}`), {
    signal,
  });
  if (!res.ok) {
    throw new Error(`business batch failed: ${res.status}`);
  }
  return parseCityCards(await res.json().catch(() => []));
}

/** GET /business/popular-cards — slim popular list. */
export async function fetchPopularCards(options: {
  city?: string | null;
  take?: number;
  signal?: AbortSignal;
}): Promise<CityCard[]> {
  const take = Math.min(Math.max(options.take ?? 10, 1), 50);
  const params = new URLSearchParams({ take: String(take) });
  const city = options.city?.trim();
  if (city) params.set('city', city);
  const res = await fetchWithTimeout(
    apiUrl(`/business/popular-cards?${params.toString()}`),
    { signal: options.signal }
  );
  if (!res.ok) {
    throw new Error(`popular-cards failed: ${res.status}`);
  }
  return parseCityCards(await res.json().catch(() => []));
}

/**
 * One page of approved businesses.
 * Prefers slim city-cards when a city is known; falls back to fat GET /business.
 */
export async function fetchApprovedBusinessPage(
  options: FetchApprovedBusinessPageOptions = {}
): Promise<unknown[]> {
  const take = Math.min(Math.max(options.take ?? NEARBY_PAGE_SIZE, 1), 100);
  const skip = Math.max(options.skip ?? 0, 0);
  const city = options.city?.trim();

  if (city) {
    try {
      const cards = await fetchCityCardsPage({
        city,
        take,
        skip,
        coords: options.coords,
        sortByDistance: options.sortByDistance ?? Boolean(options.coords),
        signal: options.signal,
      });
      return cardsToCatalog(cards);
    } catch {
      // Fall through to /business.
    }
  }

  const params = new URLSearchParams();
  params.set('status', 'APPROVED');
  params.set('take', String(take));
  if (skip > 0) params.set('skip', String(skip));
  if (city) params.set('city', city);

  const res = await fetchWithTimeout(apiUrl(`/business?${params.toString()}`), {
    signal: options.signal,
  });
  if (!res.ok) {
    throw new Error(`business page failed: ${res.status}`);
  }
  const json = await res.json().catch(() => []);
  return parseBusinessesPayload(json);
}

export type FetchCityBusinessesOptions = {
  city?: string | null;
  coords?: Coords | null;
  /** Total businesses to return (across pages). */
  take?: number;
  pageSize?: number;
  /** Prefer GET /business/nearby when coords exist. */
  preferNearby?: boolean;
  radiusM?: number;
  signal?: AbortSignal;
};

/**
 * City-scoped businesses for Utforska / Nära dig / map.
 * Prefers nearby (with coords) or city-cards; falls back to paged GET /business.
 */
export async function fetchCityApprovedBusinesses(
  options: FetchCityBusinessesOptions = {}
): Promise<{
  businesses: unknown[];
  city?: string;
  hasMore: boolean;
  source: CityBusinessSource;
}> {
  const pageSize = Math.min(Math.max(options.pageSize ?? NEARBY_PAGE_SIZE, 1), 100);
  const take = Math.min(Math.max(options.take ?? pageSize, 1), 200);
  const city =
    options.city?.trim() ||
    resolveEventFeedCity(options.city, options.coords) ||
    undefined;

  if (options.preferNearby && options.coords) {
    try {
      const nearby = await fetchNearbyBusinessCards({
        coords: options.coords,
        take,
        radiusM: options.radiusM,
        signal: options.signal,
      });
      return {
        businesses: await cardsToCatalog(nearby),
        city,
        hasMore: nearby.length >= take,
        source: 'nearby',
      };
    } catch {
      // Fall through to city-cards.
    }
  }

  if (city) {
    try {
      const out: CatalogLikeBusiness[] = [];
      let skip = 0;
      let hasMore = true;

      while (out.length < take) {
        const batchTake = Math.min(pageSize, take - out.length);
        const page = await fetchCityCardsPage({
          city,
          skip,
          take: batchTake,
          coords: options.coords,
          sortByDistance: Boolean(options.coords),
          signal: options.signal,
        });
        out.push(...(await cardsToCatalog(page)));
        if (page.length < batchTake) {
          hasMore = false;
          break;
        }
        skip += page.length;
        if (skip >= take) {
          hasMore = true;
          break;
        }
      }

      return {
        businesses: out.slice(0, take),
        city,
        hasMore,
        source: 'city-cards',
      };
    } catch {
      // Fall through to fat /business paging.
    }
  }

  const out: unknown[] = [];
  let skip = 0;
  let hasMore = true;

  while (out.length < take) {
    const batchTake = Math.min(pageSize, take - out.length);
    const params = new URLSearchParams();
    params.set('status', 'APPROVED');
    params.set('take', String(batchTake));
    if (skip > 0) params.set('skip', String(skip));
    if (city) params.set('city', city);

    const res = await fetchWithTimeout(apiUrl(`/business?${params.toString()}`), {
      signal: options.signal,
    });
    if (!res.ok) {
      throw new Error(`business page failed: ${res.status}`);
    }
    const page = parseBusinessesPayload(await res.json().catch(() => []));
    out.push(...page);
    if (page.length < batchTake) {
      hasMore = false;
      break;
    }
    skip += page.length;
    if (skip >= take) {
      hasMore = true;
      break;
    }
  }

  return { businesses: out.slice(0, take), city, hasMore, source: 'business' };
}
