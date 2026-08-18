import { apiUrl, normalizeImageUrl } from '@/lib/api';
import { hydrateOfferCardImages } from '@/lib/business-image';
import { haversineKm, isPlausibleSwedenCoordinate } from '@/lib/geo';
import {
  formatBusinessAddress,
  isActiveOffer,
  mapApiOrderToCardItem,
  parseOrdersFromBusinessRecord,
  resolveBusinessCategoryIds,
  type OfferCardItem,
} from '@/lib/home-offers';

export type SearchResultsView = 'all' | 'near' | 'hot';

/** Default cap on detail lookups per search to bound network cost while hydrating cards. */
const SEARCH_HYDRATE_LIMIT = 20;
const SEARCH_HYDRATE_LIMIT_MAX = 40;
const SEARCH_HYDRATE_CONCURRENCY = 4;

function getOfferClaimedCount(card: OfferCardItem) {
  const raw = Array.isArray(card.erbjudandeclaimade)
    ? card.erbjudandeclaimade[0]
    : card.erbjudandeclaimade;
  const claimed = Number(raw ?? 0);
  return Number.isFinite(claimed) ? claimed : 0;
}

export function sortSearchResultsNearYou(
  cards: OfferCardItem[],
  coords: { lat: number; lng: number } | null
) {
  const withDistance = coords
    ? cards.map((card) => {
        if (typeof card.distanceKm === 'number') {
          return card;
        }
        if (
          typeof card.latitude === 'number' &&
          typeof card.longitude === 'number' &&
          isPlausibleSwedenCoordinate(card.latitude, card.longitude)
        ) {
          return {
            ...card,
            distanceKm: haversineKm(coords.lat, coords.lng, card.latitude, card.longitude),
          };
        }
        return card;
      })
    : cards;

  return [...withDistance].sort((a, b) => {
    const da = typeof a.distanceKm === 'number' ? a.distanceKm : Number.POSITIVE_INFINITY;
    const db = typeof b.distanceKm === 'number' ? b.distanceKm : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return Number(b.deal) - Number(a.deal);
  });
}

export function sortSearchResultsHot(cards: OfferCardItem[]) {
  return [...cards]
    .filter((card) => card.deal !== false && (card.orderIds?.length ?? 0) > 0)
    .sort((a, b) => getOfferClaimedCount(b) - getOfferClaimedCount(a));
}

export function sortSearchResultsForView(
  cards: OfferCardItem[],
  view: SearchResultsView,
  coords: { lat: number; lng: number } | null
) {
  if (view === 'near') return sortSearchResultsNearYou(cards, coords);
  if (view === 'hot') return sortSearchResultsHot(cards);
  return cards;
}

/** Lightweight result from the unified `GET /search` + `GET /search/suggestions` endpoints. */
type UnifiedSearchResult = {
  type?: 'business' | 'order';
  id?: string;
  label?: string;
  subtitle?: string;
  city?: string;
  category?: { id?: string; name?: string; icon?: string };
  business?: { id?: string; name?: string };
};

type UnifiedSearchResponse = {
  results?: UnifiedSearchResult[];
  total?: number;
  totalCapped?: boolean;
  /** Backend may return "keyword" or "ai-hybrid" — clients must not filter on this. */
  source?: string;
};

async function fetchUnifiedSearch(params: URLSearchParams): Promise<UnifiedSearchResult[]> {
  const response = await fetch(apiUrl(`/search?${params.toString()}`));
  if (!response.ok) {
    return [];
  }
  const json = (await response.json().catch(() => ({}))) as UnifiedSearchResponse;
  return Array.isArray(json.results) ? json.results : [];
}

function mapBusinessRecordToCard(business: any, orders: any[]): OfferCardItem {
  const businessId = String(business?.id ?? business?._id ?? 'business');
  const activeOrders = orders.filter((order) => isActiveOffer(order));
  const categoryIds = resolveBusinessCategoryIds(business);

  if (activeOrders.length > 0) {
    const base = mapApiOrderToCardItem({ ...activeOrders[0], business }, 0);
    return {
      ...base,
      id: businessId,
      categoryId: categoryIds[0] ?? base.categoryId,
      categoryIds,
      orderIds: activeOrders.map((order, index) =>
        String(order?.id ?? order?._id ?? `${businessId}-order-${index}`)
      ),
      erbjudande: activeOrders.map((order) => order?.title ?? 'Erbjudande'),
      erbjudandepris: activeOrders.map((order) => String(order?.price ?? 0)),
      erbjudandeoriginalpris: activeOrders.map((order) =>
        order?.originalPrice !== undefined && order?.originalPrice !== null
          ? String(order.originalPrice)
          : ''
      ),
      erbjudandeclaimade: activeOrders.map((order) =>
        String(order?.claimedRedemptions ?? order?.claimedCount ?? 0)
      ),
      erbjudandemängd: activeOrders.map((order) => String(order?.maxRedemptions ?? 0)),
      erbjudandelängd: activeOrders.map((order) => order?.orderTimeTo ?? ''),
    };
  }

  const imageUri = normalizeImageUrl(
    business?.image?.publicUrl ??
      business?.image?.url ??
      business?.imageUrl ??
      business?.imageAsset?.publicUrl
  );

  return {
    id: businessId,
    title: business?.name ?? 'Okänd verksamhet',
    image: {
      uri: imageUri ?? `https://picsum.photos/seed/${encodeURIComponent(businessId)}/300/200`,
    },
    categoryId: categoryIds[0] ?? business?.categoryId ?? business?.category?.id,
    categoryIds,
    categoryName: business?.categoryName ?? business?.category?.name,
    deal: false,
    orderIds: [],
    Adress: formatBusinessAddress(business) || 'Adress saknas',
    latitude: business?.latitude ?? undefined,
    longitude: business?.longitude ?? undefined,
    Telefon: business?.contactPhone ?? undefined,
    Website: business?.website ?? '',
    kortbeskrivning: business?.description ?? '',
    långbeskrivning: business?.description ?? '',
  };
}

async function hydrateOrderCard(orderId: string): Promise<OfferCardItem | null> {
  try {
    const response = await fetch(apiUrl(`/orders/${encodeURIComponent(orderId)}`));
    if (!response.ok) return null;
    const json = await response.json().catch(() => ({}));
    const order = (json as any)?.order ?? json;
    if (!order || (!order.id && !order._id)) return null;
    return mapApiOrderToCardItem(order, 0);
  } catch {
    return null;
  }
}

async function hydrateBusinessCard(businessId: string): Promise<OfferCardItem | null> {
  try {
    const response = await fetch(apiUrl(`/business/${encodeURIComponent(businessId)}`));
    if (!response.ok) return null;
    const json = await response.json().catch(() => ({}));
    const business = (json as any)?.business ?? json;
    if (!business || (!business.id && !business._id)) return null;
    const orders = parseOrdersFromBusinessRecord({ ...business, id: businessId });
    return mapBusinessRecordToCard(business, orders);
  } catch {
    return null;
  }
}

type HydrationTask = { kind: 'order' | 'business'; id: string };

async function hydrateTasks(tasks: HydrationTask[]): Promise<(OfferCardItem | null)[]> {
  const ordered: (OfferCardItem | null)[] = new Array(tasks.length).fill(null);

  for (let i = 0; i < tasks.length; i += SEARCH_HYDRATE_CONCURRENCY) {
    const batch = tasks.slice(i, i + SEARCH_HYDRATE_CONCURRENCY);
    const cards = await Promise.all(
      batch.map((task) =>
        task.kind === 'order' ? hydrateOrderCard(task.id) : hydrateBusinessCard(task.id)
      )
    );
    cards.forEach((card, index) => {
      ordered[i + index] = card;
    });
  }

  // Keep null slots so callers can align cards with the original API rank.
  return ordered;
}

/**
 * Unified catalog search. Calls the backend `GET /search` (approved businesses only),
 * then hydrates each lightweight hit into a full card via GET /business/:id.
 * Results stay in relevance order. Orders are not returned from search.
 */
export async function searchCatalog(
  query: string,
  options: {
    categoryName?: string;
    city?: string;
    take?: number;
    skip?: number;
    /** Max detail lookups used to hydrate hits into full cards (defaults to 20). */
    maxHydrate?: number;
    knownCards?: OfferCardItem[];
  } = {}
): Promise<OfferCardItem[]> {
  const q = query.trim();
  if (q.length < 2) {
    return [];
  }

  const hydrateLimit = Math.min(
    options.maxHydrate ?? SEARCH_HYDRATE_LIMIT,
    SEARCH_HYDRATE_LIMIT_MAX
  );

  const params = new URLSearchParams({
    q: q.slice(0, 100),
    take: String(Math.min(options.take ?? 24, 50)),
    skip: String(options.skip ?? 0),
  });
  if (options.categoryName) {
    params.set('categoryName', options.categoryName);
  }
  if (options.city) {
    params.set('city', options.city);
  }

  const results = await fetchUnifiedSearch(params);

  // Preserve relevance order, dedupe by business so one business yields one card.
  const seenBusinessIds = new Set<string>();
  const tasks: HydrationTask[] = [];

  for (const result of results) {
    if (!result?.id) continue;

    if (result.type === 'order') {
      const businessId = result.business?.id ? String(result.business.id) : undefined;
      if (businessId) {
        if (seenBusinessIds.has(businessId)) continue;
        seenBusinessIds.add(businessId);
      }
      tasks.push({ kind: 'order', id: String(result.id) });
    } else {
      const businessId = String(result.id);
      if (seenBusinessIds.has(businessId)) continue;
      seenBusinessIds.add(businessId);
      tasks.push({ kind: 'business', id: businessId });
    }

    if (tasks.length >= hydrateLimit) break;
  }

  const cards = await hydrateTasks(tasks);

  // A high-ranking order and a separate business hit can resolve to the same business.
  const deduped: OfferCardItem[] = [];
  const seenCardIds = new Set<string>();
  for (const card of cards) {
    if (!card) continue;
    if (seenCardIds.has(card.id)) continue;
    seenCardIds.add(card.id);
    deduped.push(card);
  }

  try {
    return await hydrateOfferCardImages(deduped, {
      knownCards: options.knownCards,
    });
  } catch {
    return deduped;
  }
}

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

/**
 * AI hybrid / natural search via `POST /search/natural`.
 * Voice entry must send `source: "voice"` with a Bearer token (use authFetch).
 * Response `source` may be `"keyword"` or `"ai-hybrid"` — treat any 200 `results` as success.
 */
export async function searchNatural(
  query: string,
  authFetch: AuthFetch,
  options: {
    city?: string;
    categoryName?: string;
    source?: 'voice' | 'typed' | 'fallback';
    take?: number;
    skip?: number;
    maxHydrate?: number;
    knownCards?: OfferCardItem[];
  } = {}
): Promise<OfferCardItem[]> {
  const q = query.trim();
  if (q.length < 2) {
    return [];
  }

  const hydrateLimit = Math.min(
    options.maxHydrate ?? SEARCH_HYDRATE_LIMIT,
    SEARCH_HYDRATE_LIMIT_MAX
  );

  const body: Record<string, unknown> = {
    q: q.slice(0, 500),
    source: options.source ?? 'typed',
    take: Math.min(options.take ?? 24, 50),
    skip: options.skip ?? 0,
  };
  if (options.city) body.city = options.city;
  if (options.categoryName) body.categoryName = options.categoryName;

  const response = await authFetch('/search/natural', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    // 503 = AI search disabled / missing GPT key. Keyword GET /search still works
    // and may itself fall back to hybrid when AI is available.
    if (response.status === 503) {
      return searchCatalog(query, {
        city: options.city,
        categoryName: options.categoryName,
        take: options.take,
        skip: options.skip,
        maxHydrate: options.maxHydrate,
        knownCards: options.knownCards,
      });
    }
    const err = new Error(`NATURAL_SEARCH_${response.status}`);
    (err as Error & { status?: number }).status = response.status;
    throw err;
  }

  const json = (await response.json().catch(() => ({}))) as UnifiedSearchResponse;
  const results = Array.isArray(json.results) ? json.results : [];

  // Keep exact API relevance order. Dedupe by business after hydrate, always
  // preferring the earlier (higher-ranked) hit when the same business appears twice.
  const tasks: Array<HydrationTask & { rank: number }> = [];
  const reservedBusinessIds = new Set<string>();

  for (let rank = 0; rank < results.length; rank += 1) {
    const result = results[rank];
    if (!result?.id) continue;

    if (result.type === 'order') {
      const businessId = result.business?.id ? String(result.business.id) : undefined;
      if (businessId) {
        if (reservedBusinessIds.has(businessId)) continue;
        reservedBusinessIds.add(businessId);
      }
      tasks.push({ kind: 'order', id: String(result.id), rank });
    } else {
      const businessId = String(result.id);
      if (reservedBusinessIds.has(businessId)) continue;
      reservedBusinessIds.add(businessId);
      tasks.push({ kind: 'business', id: businessId, rank });
    }

    if (tasks.length >= hydrateLimit) break;
  }

  const hydrated = await hydrateTasks(tasks);
  const rankedCards: Array<{ card: OfferCardItem; rank: number }> = [];
  for (let i = 0; i < tasks.length; i += 1) {
    const card = hydrated[i];
    if (!card) continue;
    rankedCards.push({ card, rank: tasks[i].rank });
  }
  rankedCards.sort((a, b) => a.rank - b.rank);

  const deduped: OfferCardItem[] = [];
  const seenCardIds = new Set<string>();
  for (const { card } of rankedCards) {
    if (seenCardIds.has(card.id)) continue;
    seenCardIds.add(card.id);
    deduped.push(card);
  }

  try {
    return await hydrateOfferCardImages(deduped, {
      knownCards: options.knownCards,
    });
  } catch {
    return deduped;
  }
}
