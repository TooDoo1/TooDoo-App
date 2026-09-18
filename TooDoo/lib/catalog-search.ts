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

/**
 * Backend event-intent matching understands "event" / "evenemang", but not English plural "events".
 * Also pull an explicit city from phrases like "i Helsingborg" when the caller didn't pass one.
 */
export function normalizeCatalogSearchQuery(
  query: string,
  options?: { city?: string }
): { q: string; city?: string } {
  let q = query.trim().replace(/\s+/g, ' ');
  let city = options?.city?.trim() || undefined;

  // Whole-word only so business names like "Events AB" still match after rewrite.
  q = q.replace(/\bevents\b/gi, 'evenemang');

  if (!city) {
    const cityMatch = q.match(/\b(?:i|in|på)\s+([A-Za-zÅÄÖåäöÉéÜü][A-Za-zÅÄÖåäöÉéÜü\-]*(?:\s+[A-Za-zÅÄÖåäöÉéÜü\-]+)?)\b/i);
    const extracted = cityMatch?.[1]?.trim();
    const blocked = /^(helgen|kväll|kvallen|kvällar|dag|dagar|närheten|stan|centrum|sommar|vinter)$/i;
    if (extracted && extracted.length >= 2 && !blocked.test(extracted)) {
      city = extracted;
    }
  }

  return {
    q: q.slice(0, 100),
    ...(city ? { city } : {}),
  };
}

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
  const events = cards.filter((card) => card.resultKind === 'event');
  const deals = cards
    .filter(
      (card) =>
        card.resultKind !== 'event' &&
        card.deal !== false &&
        (card.orderIds?.length ?? 0) > 0
    )
    .sort((a, b) => getOfferClaimedCount(b) - getOfferClaimedCount(a));
  // Keep event hits visible under "Populärt" — they never have claimable deals.
  return [...events, ...deals];
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

/** Lightweight result from the unified `GET /search` + `POST /search/natural` endpoints. */
type UnifiedSearchResult = {
  type?: 'business' | 'order' | 'event';
  id?: string;
  label?: string;
  subtitle?: string;
  city?: string;
  category?: { id?: string; name?: string; icon?: string } | null;
  business?: { id?: string; name?: string };
  startDate?: number;
  endDate?: number;
  source?: string;
  image?: string;
  distanceKm?: number;
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

function mapEventSearchHitToCard(result: UnifiedSearchResult): OfferCardItem | null {
  const id = String(result.id ?? '').trim();
  if (!id) return null;

  const imageUri = normalizeImageUrl(result.image);
  // Prefer https — Visit Sweden sometimes returns http:// assets that browsers block on HTTPS pages.
  const secureImageUri =
    imageUri && imageUri.startsWith('http://')
      ? `https://${imageUri.slice('http://'.length)}`
      : imageUri;
  const locality = decodeSearchHtml(String(result.subtitle ?? result.city ?? '').trim());
  const sourceRaw = String(result.source ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  const eventSource =
    sourceRaw === 'VISIT_SWEDEN' ? ('VISIT_SWEDEN' as const) : ('MUNICIPIO' as const);
  const title = decodeSearchHtml(result.label?.trim() || 'Evenemang');

  return {
    id,
    resultKind: 'event',
    eventSource,
    title,
    image: {
      uri:
        secureImageUri ??
        `https://picsum.photos/seed/${encodeURIComponent(`event-${id}`)}/300/200`,
    },
    categoryName: 'Evenemang',
    deal: false,
    orderIds: [],
    Adress: locality || 'Evenemang',
    Website: '',
    kortbeskrivning: locality || 'Evenemang',
    långbeskrivning: '',
    ...(typeof result.distanceKm === 'number' && Number.isFinite(result.distanceKm)
      ? { distanceKm: result.distanceKm }
      : {}),
  };
}

function decodeSearchHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#8211;/gi, '–')
    .replace(/&#8212;/gi, '—')
    .replace(/&#8220;/gi, '“')
    .replace(/&#8221;/gi, '”')
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCharCode(n) : _;
    })
    .trim();
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

type HydrationTask =
  | { kind: 'order'; id: string; rank: number }
  | { kind: 'business'; id: string; rank: number }
  | { kind: 'event'; card: OfferCardItem; rank: number };

async function hydrateTasks(tasks: HydrationTask[]): Promise<(OfferCardItem | null)[]> {
  const ordered: (OfferCardItem | null)[] = new Array(tasks.length).fill(null);

  for (let i = 0; i < tasks.length; i += SEARCH_HYDRATE_CONCURRENCY) {
    const batch = tasks.slice(i, i + SEARCH_HYDRATE_CONCURRENCY);
    const cards = await Promise.all(
      batch.map((task) => {
        if (task.kind === 'event') return Promise.resolve(task.card);
        if (task.kind === 'order') return hydrateOrderCard(task.id);
        return hydrateBusinessCard(task.id);
      })
    );
    cards.forEach((card, index) => {
      ordered[i + index] = card;
    });
  }

  // Keep null slots so callers can align cards with the original API rank.
  return ordered;
}

function normalizeSearchResultType(
  result: UnifiedSearchResult
): 'business' | 'order' | 'event' {
  const raw = String(result.type ?? '')
    .trim()
    .toLowerCase();
  if (raw === 'event' || raw === 'order' || raw === 'business') {
    return raw;
  }
  // Cached public events always carry Municipio / Visit Sweden source.
  const source = String(result.source ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (source === 'MUNICIPIO' || source === 'VISIT_SWEDEN') {
    return 'event';
  }
  return 'business';
}

/**
 * Build hydration tasks from unified search hits while preserving API rank.
 * Event hits become cards immediately; business/order hits are hydrated via detail GETs.
 * Events do not consume the detail-hydrate budget so they are not dropped when
 * many businesses rank above them.
 */
function buildHydrationTasks(
  results: UnifiedSearchResult[],
  hydrateLimit: number
): HydrationTask[] {
  const tasks: HydrationTask[] = [];
  const reservedBusinessIds = new Set<string>();
  const reservedEventIds = new Set<string>();
  let detailBudgetUsed = 0;

  for (let rank = 0; rank < results.length; rank += 1) {
    const result = results[rank];
    if (!result?.id) continue;
    const type = normalizeSearchResultType(result);

    if (type === 'event') {
      const eventId = String(result.id);
      if (reservedEventIds.has(eventId)) continue;
      const card = mapEventSearchHitToCard(result);
      if (!card) continue;
      reservedEventIds.add(eventId);
      tasks.push({ kind: 'event', card, rank });
      continue;
    }

    if (detailBudgetUsed >= hydrateLimit) {
      // Keep scanning — later ranks may still include events.
      continue;
    }

    if (type === 'order') {
      const businessId = result.business?.id ? String(result.business.id) : undefined;
      if (businessId) {
        if (reservedBusinessIds.has(businessId)) continue;
        reservedBusinessIds.add(businessId);
      }
      tasks.push({ kind: 'order', id: String(result.id), rank });
      detailBudgetUsed += 1;
    } else {
      // Default / type: "business" — treat unknown as business for forward compatibility.
      const businessId = String(result.id);
      if (reservedBusinessIds.has(businessId)) continue;
      reservedBusinessIds.add(businessId);
      tasks.push({ kind: 'business', id: businessId, rank });
      detailBudgetUsed += 1;
    }
  }

  return tasks;
}

async function finalizeSearchCards(
  tasks: HydrationTask[],
  knownCards?: OfferCardItem[]
): Promise<OfferCardItem[]> {
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
    const key = `${card.resultKind ?? 'business'}:${card.id}`;
    if (seenCardIds.has(key)) continue;
    seenCardIds.add(key);
    deduped.push(card);
  }

  try {
    return await hydrateOfferCardImages(deduped, { knownCards });
  } catch {
    return deduped;
  }
}

/**
 * Unified catalog search. Calls `GET /search` (businesses + event-intent public events),
 * then hydrates business hits via GET /business/:id. Event hits use the search payload.
 * Results stay in API relevance order. Orders/deals are not returned from search.
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
  const normalized = normalizeCatalogSearchQuery(query, { city: options.city });
  const q = normalized.q;
  if (q.length < 2) {
    return [];
  }

  const hydrateLimit = Math.min(
    options.maxHydrate ?? SEARCH_HYDRATE_LIMIT,
    SEARCH_HYDRATE_LIMIT_MAX
  );

  const params = new URLSearchParams({
    q,
    take: String(Math.min(options.take ?? 24, 50)),
    skip: String(options.skip ?? 0),
  });
  if (options.categoryName) {
    params.set('categoryName', options.categoryName);
  }
  if (normalized.city) {
    params.set('city', normalized.city);
  }

  const results = await fetchUnifiedSearch(params);
  const tasks = buildHydrationTasks(results, hydrateLimit);
  return finalizeSearchCards(tasks, options.knownCards);
}

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

/**
 * AI hybrid / natural search via `POST /search/natural`.
 * Voice entry must send `source: "voice"` with a Bearer token (use authFetch).
 * Same mixed business + event result shape as GET /search.
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
  const normalized = normalizeCatalogSearchQuery(query, { city: options.city });
  const q = normalized.q;
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
  if (normalized.city) body.city = normalized.city;
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
  const tasks = buildHydrationTasks(results, hydrateLimit);
  return finalizeSearchCards(tasks, options.knownCards);
}
