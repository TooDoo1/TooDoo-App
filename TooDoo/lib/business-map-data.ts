import { apiUrl, normalizeImageUrl } from '@/lib/api';
import { searchCatalog } from '@/lib/catalog-search';
import { fetchBusinessEvents } from '@/lib/business-events';
import {
  geocodeAddressCached,
  haversineKm,
  isPlausibleSwedenCoordinate,
  type Coords,
} from '@/lib/geo';
import { resolveBusinessCategoryIds } from '@/lib/home-offers';
import { fetchApprovedBusinessesCatalog, fetchCategoriesCatalog } from '@/lib/catalog-cache';
import { rememberCategories } from '@/lib/category-colors';
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

/**
 * Far-out budget — kept high so overlapping companies can collapse into
 * count clusters instead of being dropped from the map.
 */
export const MAP_MAX_PINS = 56;

/** When the view is street-level, show every on-screen company up to this. */
export const MAP_MAX_PINS_ZOOMED = 96;

function pinBudgetForBounds(bounds: MapViewBounds | null, base = MAP_MAX_PINS): number {
  if (!bounds) return base;
  const midLat = (bounds.north + bounds.south) / 2;
  const latKm = Math.abs(bounds.north - bounds.south) * 111.32;
  const lngKm =
    Math.abs(bounds.east - bounds.west) * 111.32 * Math.cos((midLat * Math.PI) / 180);
  const spanKm = Math.max(latKm, lngKm);
  if (spanKm <= 1.4) return MAP_MAX_PINS_ZOOMED;
  if (spanKm <= 3) return 80;
  if (spanKm <= 6) return 68;
  if (spanKm <= 12) return 60;
  return base;
}

/** Filter map businesses by free-text search (name, address, category). */
export function filterBusinessesByQuery(
  businesses: MapBusiness[],
  query: string
): MapBusiness[] {
  const q = query.trim().toLocaleLowerCase('sv-SE');
  if (!q) return businesses;
  return businesses.filter((b) => {
    const haystack = [b.name, b.address, b.categoryName, b.description]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('sv-SE');
    return haystack.includes(q);
  });
}

function mergeMapBusiness(primary: MapBusiness | undefined, next: MapBusiness) {
  if (!primary) return next;
  if (hasMapPinCoords(next) && !hasMapPinCoords(primary)) {
    return {
      ...next,
      categoryName: next.categoryName || primary.categoryName,
      categoryId: next.categoryId || primary.categoryId,
      categoryIcon: next.categoryIcon || primary.categoryIcon,
    };
  }
  return {
    ...primary,
    ...next,
    latitude: hasMapPinCoords(next) ? next.latitude : primary.latitude,
    longitude: hasMapPinCoords(next) ? next.longitude : primary.longitude,
    pendingGeocode: hasMapPinCoords(next) ? false : primary.pendingGeocode && next.pendingGeocode,
    categoryName: next.categoryName || primary.categoryName,
    categoryId: next.categoryId || primary.categoryId,
    categoryIcon: next.categoryIcon || primary.categoryIcon,
  };
}

/** Search the live catalog (same as home search), then geocode hits so they can pin. */
export async function searchMapBusinesses(
  query: string,
  known: MapBusiness[],
  coords: Coords | null
): Promise<MapBusiness[]> {
  const q = query.trim();
  if (q.length < 2) return known;

  const local = filterBusinessesByQuery(known, q);
  const byId = new Map(local.map((item) => [item.id, item]));

  try {
    const cards = await searchCatalog(q, { take: 24, maxHydrate: 16 });
    for (const card of cards) {
      if (card.resultKind === 'event') continue;
      const existing = known.find((item) => item.id === card.id) ?? byId.get(card.id);
      if (existing && hasMapPinCoords(existing)) {
        byId.set(card.id, existing);
        continue;
      }

      const address =
        card.Adress && card.Adress !== 'Adress saknas' ? card.Adress : existing?.address ?? '';
      let latitude = existing?.latitude ?? card.latitude ?? Number.NaN;
      let longitude = existing?.longitude ?? card.longitude ?? Number.NaN;
      let pendingGeocode = !isPlausibleSwedenCoordinate(latitude, longitude);

      if (pendingGeocode && address) {
        const geo = await geocodeAddressCached(address);
        if (geo) {
          latitude = geo.lat;
          longitude = geo.lng;
          pendingGeocode = false;
        }
      }

      const next: MapBusiness = {
        id: card.id,
        name: card.title,
        imageUri: card.image?.uri || existing?.imageUri,
        address,
        description: card.kortbeskrivning || existing?.description,
        latitude,
        longitude,
        distanceKm:
          !pendingGeocode && coords
            ? haversineKm(coords.lat, coords.lng, latitude, longitude)
            : existing?.distanceKm ?? card.distanceKm,
        categoryName: card.categoryName || existing?.categoryName,
        categoryId: card.categoryId || existing?.categoryId,
        hasEvent: existing?.hasEvent,
        hasOffer: existing?.hasOffer ?? Boolean(card.deal),
        pendingGeocode,
      };
      byId.set(card.id, mergeMapBusiness(existing, next));
    }
  } catch {
    // Keep local matches if catalog search fails.
  }

  if (byId.size === 0) {
    try {
      const raw = parseBusinesses(await fetchApprovedBusinessesCatalog());
      const needle = q.toLocaleLowerCase('sv-SE');
      for (const business of raw) {
        const id = String(business?.id ?? business?._id ?? '');
        if (!id) continue;
        const name = String(business?.name ?? business?.title ?? '').trim();
        const address = [business?.address, business?.city].filter(Boolean).join(', ');
        const haystack = `${name} ${address}`.toLocaleLowerCase('sv-SE');
        if (!haystack.includes(needle)) continue;
        const parsed = parseLatLng(business);
        let latitude = parsed?.lat ?? Number.NaN;
        let longitude = parsed?.lng ?? Number.NaN;
        let pendingGeocode = !parsed;
        if (pendingGeocode && address) {
          const geo = await geocodeAddressCached(address);
          if (geo) {
            latitude = geo.lat;
            longitude = geo.lng;
            pendingGeocode = false;
          }
        }
        byId.set(id, {
          id,
          name: name || 'Företag',
          imageUri: pickImageUri(business),
          address,
          description: typeof business?.description === 'string' ? business.description : '',
          latitude,
          longitude,
          distanceKm:
            !pendingGeocode && coords
              ? haversineKm(coords.lat, coords.lng, latitude, longitude)
              : undefined,
          categoryName: pickCategoryName(business),
          categoryId: resolveBusinessCategoryIds(business)[0],
          categoryIcon: pickCategoryIcon(business),
          pendingGeocode,
        });
      }
    } catch {
      // ignore
    }
  }

  return [...byId.values()];
}

export function mergeSearchHitsIntoMapBusinesses(
  known: MapBusiness[],
  hits: MapBusiness[]
): MapBusiness[] {
  if (hits.length === 0) return known;
  const byId = new Map(known.map((item) => [item.id, item]));
  for (const hit of hits) {
    byId.set(hit.id, mergeMapBusiness(byId.get(hit.id), hit));
  }
  return [...byId.values()];
}

export type MapViewBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

/**
 * Spread picks across the viewport so a far zoom doesn't only keep the
 * downtown clump (which then collapses into one giant cluster badge).
 */
function pickSpatiallySpread(
  businesses: MapBusiness[],
  bounds: MapViewBounds,
  cap: number
): MapBusiness[] {
  if (businesses.length <= cap) return businesses;

  const centerLat = (bounds.north + bounds.south) / 2;
  const centerLng = (bounds.east + bounds.west) / 2;
  const grid = Math.max(3, Math.min(8, Math.ceil(Math.sqrt(cap))));
  const latSpan = Math.max(1e-6, bounds.north - bounds.south);
  const lngSpan = Math.max(1e-6, bounds.east - bounds.west);

  const buckets = new Map<string, MapBusiness[]>();
  for (const business of businesses) {
    const x = Math.min(
      grid - 1,
      Math.max(0, Math.floor(((business.longitude - bounds.west) / lngSpan) * grid))
    );
    const y = Math.min(
      grid - 1,
      Math.max(0, Math.floor(((business.latitude - bounds.south) / latSpan) * grid))
    );
    const key = `${x}:${y}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(business);
    else buckets.set(key, [business]);
  }

  for (const bucket of buckets.values()) {
    bucket.sort(
      (a, b) =>
        haversineKm(centerLat, centerLng, a.latitude, a.longitude) -
        haversineKm(centerLat, centerLng, b.latitude, b.longitude)
    );
  }

  const queues = [...buckets.values()].sort((a, b) => b.length - a.length);
  const picked: MapBusiness[] = [];
  const seen = new Set<string>();
  let progressed = true;
  while (picked.length < cap && progressed) {
    progressed = false;
    for (const queue of queues) {
      if (picked.length >= cap) break;
      while (queue.length > 0) {
        const next = queue.shift()!;
        if (seen.has(next.id)) continue;
        seen.add(next.id);
        picked.push(next);
        progressed = true;
        break;
      }
    }
  }
  return picked;
}

/**
 * Pick the businesses to render for the current viewport.
 *
 * Sticky: pins already on screen stay until they leave a soft pad, so the
 * set doesn't reshuffle on every small pan. New slots are filled with a
 * spatial spread across the view.
 */
export function filterBusinessesForViewport(
  businesses: MapBusiness[],
  bounds: MapViewBounds | null,
  maxPins = MAP_MAX_PINS,
  keepIds?: ReadonlySet<string>
): MapBusiness[] {
  const cap = pinBudgetForBounds(bounds, maxPins);

  if (!bounds) {
    return businesses.slice(0, cap);
  }

  const padLat = (bounds.north - bounds.south) * 0.08;
  const padLng = (bounds.east - bounds.west) * 0.08;
  const inView = businesses.filter(
    (b) =>
      b.latitude >= bounds.south - padLat &&
      b.latitude <= bounds.north + padLat &&
      b.longitude >= bounds.west - padLng &&
      b.longitude <= bounds.east + padLng
  );

  if (inView.length <= cap) return inView;

  const byId = new Map(inView.map((b) => [b.id, b]));
  const sticky: MapBusiness[] = [];
  if (keepIds) {
    for (const id of keepIds) {
      const held = byId.get(id);
      if (held) sticky.push(held);
      if (sticky.length >= cap) break;
    }
  }

  if (sticky.length >= cap) return sticky.slice(0, cap);

  const stickyIds = new Set(sticky.map((b) => b.id));
  const newcomers = inView.filter((b) => !stickyIds.has(b.id));
  const fillers = pickSpatiallySpread(newcomers, bounds, cap - sticky.length);
  return [...sticky, ...fillers];
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
  categoryId?: string;
  categoryIcon?: string;
  hasEvent?: boolean;
  hasOffer?: boolean;
  /** Address is known but coordinates are still being geocoded. */
  pendingGeocode?: boolean;
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

function asNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim()) return Number(value);
  return NaN;
}

function parseLatLng(business: any): { lat: number; lng: number } | null {
  const pairs: Array<{ lat: number; lng: number }> = [];
  const lat = asNumber(
    business?.latitude ?? business?.lat ?? business?.geoLat ?? business?.geo?.lat
  );
  const lng = asNumber(
    business?.longitude ??
      business?.lng ??
      business?.lon ??
      business?.long ??
      business?.geoLng ??
      business?.geo?.lng ??
      business?.geo?.lon
  );
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    pairs.push({ lat, lng });
  }

  const point =
    business?.location?.coordinates ??
    business?.geometry?.coordinates ??
    business?.position?.coordinates ??
    business?.geo?.coordinates;
  if (Array.isArray(point) && point.length >= 2) {
    const first = asNumber(point[0]);
    const second = asNumber(point[1]);
    // GeoJSON is [lng, lat]; also try the reverse if fields were stored swapped.
    pairs.push({ lat: second, lng: first });
    pairs.push({ lat: first, lng: second });
  }

  for (const pair of pairs) {
    if (isPlausibleSwedenCoordinate(pair.lat, pair.lng)) return pair;
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
    categoryId: card.categoryId,
    hasEvent: card.hasEvent,
    hasOffer: card.hasOffer,
  };
}

function pickCategoryIcon(business: any): string | undefined {
  const icon =
    business?.category?.icon ??
    (Array.isArray(business?.categories) ? business.categories[0]?.icon : undefined) ??
    business?.categoryIcon;
  return typeof icon === 'string' && icon.trim() ? icon.trim() : undefined;
}

function pickCategoryName(business: any): string | undefined {
  if (typeof business?.categoryName === 'string' && business.categoryName.trim()) {
    return business.categoryName.trim();
  }
  if (typeof business?.category?.name === 'string' && business.category.name.trim()) {
    return business.category.name.trim();
  }
  if (Array.isArray(business?.categoryNames)) {
    const named = business.categoryNames.find(
      (value: unknown) => typeof value === 'string' && value.trim()
    );
    if (named) return String(named).trim();
  }
  if (Array.isArray(business?.categories) && business.categories[0]) {
    const first = business.categories[0];
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

const GEOCODE_CONCURRENCY = 4;

function sortMapBusinesses(list: MapBusiness[]) {
  return [...list].sort((a, b) => {
    if (a.pendingGeocode && !b.pendingGeocode) return 1;
    if (!a.pendingGeocode && b.pendingGeocode) return -1;
    return (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);
  });
}

function toNearbyCard(item: MapBusiness): NearbyBusinessCard {
  return {
    id: item.id,
    title: item.name,
    image: { uri: item.imageUri ?? '' },
    Adress: item.address,
    kortbeskrivning: item.description,
    långbeskrivning: item.description,
    latitude: item.latitude,
    longitude: item.longitude,
    distanceKm: item.distanceKm,
    categoryName: item.categoryName,
    categoryId: item.categoryId,
    hasEvent: item.hasEvent,
    hasOffer: item.hasOffer,
  };
}

export function hasMapPinCoords(business: MapBusiness) {
  return (
    !business.pendingGeocode &&
    isPlausibleSwedenCoordinate(business.latitude, business.longitude)
  );
}

export async function loadMapBusinesses(
  coords: Coords | null,
  onUpdate?: (businesses: MapBusiness[]) => void
): Promise<MapBusiness[]> {
  const activityPromise = loadActivitySets();

  try {
    const [json, categoriesRaw] = await Promise.all([
      fetchApprovedBusinessesCatalog(),
      fetchCategoriesCatalog().catch(() => [] as unknown[]),
    ]);
    const { eventIds, offerIds } = await activityPromise;
    const raw = parseBusinesses(json);

    const categoryNameById = new Map<string, string>();
    (categoriesRaw as any[]).forEach((category) => {
      const id = category?.id ?? category?._id;
      if (id && typeof category?.name === 'string' && category.name.trim()) {
        categoryNameById.set(String(id), category.name.trim());
      }
    });

    rememberCategories(categoriesRaw as unknown[]);
    rememberCategories(
      raw.flatMap((b) => [
        b?.category,
        ...(Array.isArray(b?.categories) ? b.categories : []),
      ])
    );

    const ready: MapBusiness[] = [];
    const pending: MapBusiness[] = [];

    for (const b of raw) {
      const id = String(b?.id ?? b?._id ?? '');
      if (!id) continue;
      const name = String(b?.name ?? b?.title ?? 'Företag').trim() || 'Företag';
      const address = [b?.address, b?.city].filter(Boolean).join(', ') || '';
      const description = typeof b?.description === 'string' ? b.description : '';
      const categoryName =
        pickCategoryName(b) ??
        categoryNameById.get(resolveBusinessCategoryIds(b)[0] ?? '');
      const categoryId = resolveBusinessCategoryIds(b)[0];
      const categoryIcon = pickCategoryIcon(b);
      const imageUri = pickImageUri(b);
      const hasEvent = eventIds.has(id);
      const hasOffer = offerIds.has(id);
      const parsed = parseLatLng(b);
      const base = {
        id,
        name,
        imageUri,
        address,
        description,
        categoryName,
        categoryId,
        categoryIcon,
        hasEvent,
        hasOffer,
      };

      if (parsed) {
        ready.push({
          ...base,
          latitude: parsed.lat,
          longitude: parsed.lng,
          distanceKm:
            coords != null
              ? haversineKm(coords.lat, coords.lng, parsed.lat, parsed.lng)
              : undefined,
        });
      } else if (address.trim()) {
        pending.push({
          ...base,
          latitude: Number.NaN,
          longitude: Number.NaN,
          pendingGeocode: true,
        });
      }
    }

    let current = sortMapBusinesses([...ready, ...pending]);
    onUpdate?.(current);

    for (let i = 0; i < pending.length; i += GEOCODE_CONCURRENCY) {
      const batch = pending.slice(i, i + GEOCODE_CONCURRENCY);
      const resolved = await Promise.all(
        batch.map(async (item) => {
          const geo = await geocodeAddressCached(item.address);
          if (!geo) return item;
          return {
            ...item,
            latitude: geo.lat,
            longitude: geo.lng,
            pendingGeocode: false,
            distanceKm:
              coords != null
                ? haversineKm(coords.lat, coords.lng, geo.lat, geo.lng)
                : undefined,
          };
        })
      );
      const byId = new Map(current.map((item) => [item.id, item]));
      resolved.forEach((item) => byId.set(item.id, item));
      current = sortMapBusinesses([...byId.values()]);
      onUpdate?.(current);
    }

    const pinCards = current.filter(hasMapPinCoords).map(toNearbyCard);
    if (pinCards.length > 0) {
      setHomeNearbyBusinessesCache(pinCards);
    }
    if (current.some(hasMapPinCoords)) {
      return current;
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
      distanceKm:
        coords != null
          ? haversineKm(coords.lat, coords.lng, item.latitude, item.longitude)
          : item.distanceKm,
      hasEvent: item.hasEvent ?? eventIds.has(item.id),
      hasOffer: item.hasOffer ?? offerIds.has(item.id),
    }))
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
}

/** Sync snapshot from home nearby cache — used so the map can mount with pins immediately. */
export function peekCachedMapBusinesses(): MapBusiness[] {
  const cached =
    getHomeNearbyBusinessesCache() ?? peekHomeNearbyBusinessesCache() ?? [];
  return cached
    .map(cardToMapBusiness)
    .filter((item): item is MapBusiness => Boolean(item));
}
