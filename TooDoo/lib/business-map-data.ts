import { apiUrl, normalizeImageUrl } from '@/lib/api';
import { fetchApprovedBusinessesCatalog, fetchCategoriesCatalog } from '@/lib/catalog-cache';
import { fetchBusinessEvents } from '@/lib/business-events';
import { haversineKm, isPlausibleSwedenCoordinate, type Coords } from '@/lib/geo';
import { resolveBusinessCategoryIds } from '@/lib/home-offers';
import {
  getHomeNearbyBusinessesCache,
  peekHomeNearbyBusinessesCache,
  setHomeNearbyBusinessesCache,
  type NearbyBusinessCard,
} from '@/lib/home-list-cache';
import {
  getOrderBusinessId,
  isActiveOffer,
  parseOrdersList,
} from '@/lib/offers';

/** Default map center — Helsingborg city (slightly inland so the coast isn’t the middle). */
export const MAP_DEFAULT_CENTER = { lat: 56.0465, lng: 12.715 } as const;

/** Show at most this many pins at once — the 10 closest to the view center. */
export const MAP_MAX_PINS = 10;

/** Filter map businesses by free-text search (name, address, category). */
export function filterBusinessesByQuery(
  businesses: MapBusiness[],
  query: string
): MapBusiness[] {
  const q = query.trim().toLowerCase();
  if (!q) return businesses;
  return businesses.filter((b) => {
    const haystack = [b.name, b.address, b.categoryName, b.description]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

export type MapViewBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

/**
 * Pick the businesses to render for the current viewport: everything inside
 * the (slightly padded) bounds, closest to the view center first, capped.
 *
 * `keepIds` (the previously rendered pins) get priority while still in view,
 * so small pans don't constantly swap markers in and out — recreating marker
 * DOM and reloading pin images on every move is a major lag source.
 */
export function filterBusinessesForViewport(
  businesses: MapBusiness[],
  bounds: MapViewBounds | null,
  maxPins = MAP_MAX_PINS,
  keepIds?: ReadonlySet<string>
): MapBusiness[] {
  let centerLat = MAP_DEFAULT_CENTER.lat;
  let centerLng = MAP_DEFAULT_CENTER.lng;
  let inView = businesses;

  if (bounds) {
    const padLat = (bounds.north - bounds.south) * 0.1;
    const padLng = (bounds.east - bounds.west) * 0.1;
    inView = businesses.filter(
      (b) =>
        b.latitude >= bounds.south - padLat &&
        b.latitude <= bounds.north + padLat &&
        b.longitude >= bounds.west - padLng &&
        b.longitude <= bounds.east + padLng
    );
    centerLat = (bounds.north + bounds.south) / 2;
    centerLng = (bounds.east + bounds.west) / 2;
  }

  if (inView.length <= maxPins) return inView;

  const byDistance = [...inView].sort(
    (a, b) =>
      haversineKm(centerLat, centerLng, a.latitude, a.longitude) -
      haversineKm(centerLat, centerLng, b.latitude, b.longitude)
  );

  if (!keepIds || keepIds.size === 0) return byDistance.slice(0, maxPins);

  const kept = byDistance.filter((b) => keepIds.has(b.id)).slice(0, maxPins);
  if (kept.length >= maxPins) return kept;
  const keptIds = new Set(kept.map((b) => b.id));
  const fill = byDistance.filter((b) => !keptIds.has(b.id));
  return [...kept, ...fill.slice(0, maxPins - kept.length)];
}

export type MapBusiness = {
  id: string;
  name: string;
  imageUri?: string;
  address: string;
  description?: string;
  latitude: number;
  longitude: number;
  distanceKm?: number;
  categoryName?: string;
  hasEvent?: boolean;
  hasOffer?: boolean;
};

function parseBusinesses(json: unknown): any[] {
  if (Array.isArray(json)) return json;
  const obj = json as Record<string, unknown>;
  if (Array.isArray(obj?.businesses)) return obj.businesses;
  if (Array.isArray(obj?.data)) return obj.data;
  return [];
}

function pickImageUri(business: any): string | undefined {
  const raw =
    business?.image?.publicUrl ??
    business?.image?.url ??
    business?.imageUrl ??
    business?.logoUrl ??
    business?.logo?.url ??
    (Array.isArray(business?.images) ? business.images[0] : undefined);
  return normalizeImageUrl(raw) ?? undefined;
}

function parseLatLng(business: any): { lat: number; lng: number } | null {
  const lat = typeof business?.latitude === 'number' ? business.latitude : Number(business?.latitude);
  const lng = typeof business?.longitude === 'number' ? business.longitude : Number(business?.longitude);
  if (isPlausibleSwedenCoordinate(lat, lng)) {
    return { lat, lng };
  }
  // Some records store lon/lat swapped — try the reverse once.
  if (isPlausibleSwedenCoordinate(lng, lat)) {
    return { lat: lng, lng: lat };
  }
  return null;
}

export function cardToMapBusiness(card: NearbyBusinessCard): MapBusiness | null {
  const latitude = card.latitude;
  const longitude = card.longitude;
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !isPlausibleSwedenCoordinate(latitude, longitude)
  ) {
    return null;
  }
  return {
    id: card.id,
    name: card.title,
    imageUri: card.image?.uri || undefined,
    address: card.Adress,
    description: card.kortbeskrivning,
    latitude,
    longitude,
    distanceKm: card.distanceKm,
    categoryName: card.categoryName,
    hasEvent: card.hasEvent,
    hasOffer: card.hasOffer,
  };
}

function pickCategoryName(business: any): string | undefined {
  if (typeof business?.categoryName === 'string' && business.categoryName.trim()) {
    return business.categoryName.trim();
  }
  if (typeof business?.category?.name === 'string' && business.category.name.trim()) {
    return business.category.name.trim();
  }
  if (Array.isArray(business?.categories) && business.categories[0]) {
    const first = business.categories[0];
    if (typeof first === 'string' && first.trim()) return first.trim();
    if (typeof first?.name === 'string' && first.name.trim()) return first.name.trim();
  }
  return undefined;
}

async function loadActivitySets(): Promise<{
  eventIds: Set<string>;
  offerIds: Set<string>;
}> {
  const eventIds = new Set<string>();
  const offerIds = new Set<string>();
  try {
    const [events, ordersRes] = await Promise.all([
      fetchBusinessEvents(),
      fetch(apiUrl('/orders')),
    ]);
    events.forEach((event) => {
      if (event.businessId) eventIds.add(event.businessId);
    });
    const ordersJson = await ordersRes.json().catch(() => []);
    parseOrdersList(ordersJson).forEach((order) => {
      if (!isActiveOffer(order)) return;
      const businessId = getOrderBusinessId(order);
      if (businessId) offerIds.add(businessId);
    });
  } catch {
    // Activity dots stay inactive if feeds fail.
  }
  return { eventIds, offerIds };
}

export async function loadMapBusinesses(coords: Coords | null): Promise<MapBusiness[]> {
  const activityPromise = loadActivitySets();

  try {
    const [json, categoriesRaw] = await Promise.all([
      fetchApprovedBusinessesCatalog(),
      fetchCategoriesCatalog().catch(() => [] as unknown[]),
    ]);
    const { eventIds, offerIds } = await activityPromise;
    const raw = parseBusinesses(json);

    // Businesses store category ids — resolve names via the categories catalog
    // (same as the home screen) so pin colors match the category chips.
    const categoryNameById = new Map<string, string>();
    (categoriesRaw as any[]).forEach((category) => {
      const id = category?.id ?? category?._id;
      if (id && typeof category?.name === 'string' && category.name.trim()) {
        categoryNameById.set(String(id), category.name.trim());
      }
    });
    const nextCards: NearbyBusinessCard[] = [];
    const mapped: MapBusiness[] = [];

    for (const b of raw) {
      const id = String(b?.id ?? b?._id ?? '');
      if (!id) continue;
      const parsed = parseLatLng(b);
      if (!parsed) continue;
      const { lat, lng } = parsed;
      const name = String(b?.name ?? b?.title ?? 'Företag').trim() || 'Företag';
      const address = [b?.address, b?.city].filter(Boolean).join(', ') || '';
      const description = typeof b?.description === 'string' ? b.description : '';
      const categoryName =
        pickCategoryName(b) ??
        categoryNameById.get(resolveBusinessCategoryIds(b)[0] ?? '');
      const distanceKm =
        coords != null ? haversineKm(coords.lat, coords.lng, lat, lng) : undefined;
      const imageUri = pickImageUri(b);
      const hasEvent = eventIds.has(id);
      const hasOffer = offerIds.has(id);
      mapped.push({
        id,
        name,
        imageUri,
        address,
        description,
        latitude: lat,
        longitude: lng,
        distanceKm,
        categoryName,
        hasEvent,
        hasOffer,
      });
      nextCards.push({
        id,
        title: name,
        image: { uri: imageUri ?? '' },
        Adress: address,
        kortbeskrivning: description,
        långbeskrivning: description,
        latitude: lat,
        longitude: lng,
        distanceKm,
        categoryName,
        hasEvent,
        hasOffer,
      });
    }

    if (nextCards.length > 0) {
      setHomeNearbyBusinessesCache(nextCards);
    }
    if (mapped.length > 0) {
      return mapped.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    }
  } catch {
    // fall through to cache
  }

  const { eventIds, offerIds } = await activityPromise;
  const cached =
    getHomeNearbyBusinessesCache() ?? peekHomeNearbyBusinessesCache() ?? [];
  return cached
    .map(cardToMapBusiness)
    .filter((item): item is MapBusiness => Boolean(item))
    .map((item) => ({
      ...item,
      hasEvent: item.hasEvent ?? eventIds.has(item.id),
      hasOffer: item.hasOffer ?? offerIds.has(item.id),
    }));
}

/** Sync snapshot from home nearby cache — used so the map can mount with pins immediately. */
export function peekCachedMapBusinesses(): MapBusiness[] {
  const cached =
    getHomeNearbyBusinessesCache() ?? peekHomeNearbyBusinessesCache() ?? [];
  return cached
    .map(cardToMapBusiness)
    .filter((item): item is MapBusiness => Boolean(item));
}
