import { apiUrl, normalizeImageUrl } from '@/lib/api';
import { hydrateOfferCardImages } from '@/lib/business-image';
import { haversineKm, isPlausibleSwedenCoordinate } from '@/lib/geo';
import {
  formatBusinessAddress,
  isActiveOffer,
  mapApiOrderToCardItem,
  parseOrdersFromBusinessRecord,
  resolveBusinessCategoryIds,
  resolveBusinessCategoryNames,
  resolveBusinessSubcategoryName,
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

export function isWeekendSearchQuery(query: string) {
  const n = query.trim().toLocaleLowerCase('sv-SE');
  return n === 'helg' || n === 'helgen' || n === 'weekend';
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

/** Lightweight result from unified search and `GET /business/for-you/now`. */
export type UnifiedSearchResult = {
  type?: 'business' | 'order' | 'event';
  id?: string;
  label?: string;
  subtitle?: string;
  city?: string;
  category?: { id?: string; name?: string; slug?: string; icon?: string } | null;
  /** Nested on hydrated business records; search hits may omit this. */
  categories?: Array<{
    id?: string;
    name?: string;
    icon?: string;
    subcategories?: Array<{ id?: string; name?: string; slug?: string | null }>;
  }>;
  business?: { id?: string; name?: string };
  startDate?: number;
  endDate?: number;
  source?: string;
  image?: string | { publicUrl?: string; url?: string } | null;
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

function resultImageUri(result: UnifiedSearchResult): string | undefined {
  const raw =
    typeof result.image === 'string'
      ? result.image
      : result.image && typeof result.image === 'object'
        ? result.image.publicUrl ?? result.image.url
        : undefined;
  const imageUri = normalizeImageUrl(raw);
  // Prefer https — Visit Sweden sometimes returns http:// assets that browsers block on HTTPS pages.
  if (imageUri && imageUri.startsWith('http://')) {
    return `https://${imageUri.slice('http://'.length)}`;
  }
  return imageUri;
}

function mapEventSource(
  source: string | undefined
): NonNullable<OfferCardItem['eventSource']> {
  const sourceRaw = String(source ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (sourceRaw === 'VISIT_SWEDEN') return 'VISIT_SWEDEN';
  if (sourceRaw === 'BUSINESS') return 'BUSINESS';
  return 'MUNICIPIO';
}

function mapEventSearchHitToCard(result: UnifiedSearchResult): OfferCardItem | null {
  const id = String(result.id ?? '').trim();
  if (!id) return null;

  const secureImageUri = resultImageUri(result);
  const locality = decodeSearchHtml(String(result.subtitle ?? result.city ?? '').trim());
  const eventSource = mapEventSource(result.source);
  const title = decodeSearchHtml(result.label?.trim() || 'Evenemang');
  const categoryName = result.category?.name?.trim() || 'Evenemang';

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
    categoryId: result.category?.id,
    categoryName,
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

function mapBusinessSearchHitToCard(result: UnifiedSearchResult): OfferCardItem | null {
  const id = String(result.id ?? '').trim();
  if (!id) return null;

  const imageUri = resultImageUri(result);
  const title = decodeSearchHtml(result.label?.trim() || 'Okänd verksamhet');
  const locality = decodeSearchHtml(String(result.city ?? result.subtitle ?? '').trim());
  const subtitle = decodeSearchHtml(String(result.subtitle ?? '').trim());

  const subcategoryName = resolveBusinessSubcategoryName(result);

  return {
    id,
    title,
    image: {
      uri: imageUri ?? `https://picsum.photos/seed/${encodeURIComponent(id)}/300/200`,
    },
    categoryId: result.category?.id,
    categoryName: result.category?.name?.trim() || subtitle || undefined,
    ...(subcategoryName ? { subcategoryName } : {}),
    deal: false,
    orderIds: [],
    Adress: locality || 'Adress saknas',
    Website: '',
    kortbeskrivning: subtitle,
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

  const subcategoryName = resolveBusinessSubcategoryName(business);

  if (activeOrders.length > 0) {
    const base = mapApiOrderToCardItem({ ...activeOrders[0], business }, 0);
    return {
      ...base,
      id: businessId,
      categoryId: categoryIds[0] ?? base.categoryId,
      categoryIds,
      categoryNames: resolveBusinessCategoryNames(business),
      subcategoryName: subcategoryName ?? base.subcategoryName,
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
      openingHours: business?.openingHours ?? base.openingHours,
    };
  }

  const imageUri = normalizeImageUrl(
    business?.image?.publicUrl ??
      business?.image?.url ??
      business?.imageUrl ??
      business?.imageAsset?.publicUrl
  );
  const categoryNames = resolveBusinessCategoryNames(business);

  return {
    id: businessId,
    title: business?.name ?? 'Okänd verksamhet',
    image: {
      uri: imageUri ?? `https://picsum.photos/seed/${encodeURIComponent(businessId)}/300/200`,
    },
    categoryId: categoryIds[0] ?? business?.categoryId ?? business?.category?.id,
    categoryIds,
    categoryName:
      business?.categoryName ??
      business?.category?.name ??
      categoryNames[0],
    categoryNames,
    subcategoryName,
    deal: false,
    orderIds: [],
    Adress: formatBusinessAddress(business) || 'Adress saknas',
    latitude: business?.latitude ?? undefined,
    longitude: business?.longitude ?? undefined,
    Telefon: business?.contactPhone ?? undefined,
    Website: business?.website ?? '',
    kortbeskrivning: business?.description ?? '',
    långbeskrivning: business?.description ?? '',
    openingHours: business?.openingHours,
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
  | { kind: 'business'; id: string; rank: number; fallback?: UnifiedSearchResult }
  | { kind: 'event'; card: OfferCardItem; rank: number }
  | { kind: 'ready'; card: OfferCardItem; rank: number };

async function hydrateTasks(tasks: HydrationTask[]): Promise<(OfferCardItem | null)[]> {
  const ordered: (OfferCardItem | null)[] = new Array(tasks.length).fill(null);

  for (let i = 0; i < tasks.length; i += SEARCH_HYDRATE_CONCURRENCY) {
    const batch = tasks.slice(i, i + SEARCH_HYDRATE_CONCURRENCY);
    const cards = await Promise.all(
      batch.map(async (task) => {
        if (task.kind === 'event' || task.kind === 'ready') return task.card;
        if (task.kind === 'order') {
          const orderCard = await hydrateOrderCard(task.id);
          return orderCard;
        }
        const hydrated = await hydrateBusinessCard(task.id);
        if (hydrated) {
          return task.fallback ? overlaySearchDistance(hydrated, task.fallback) : hydrated;
        }
        return task.fallback ? mapBusinessSearchHitToCard(task.fallback) : null;
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
  // Cached public events and in-app business events carry a source discriminator.
  const source = String(result.source ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (source === 'MUNICIPIO' || source === 'VISIT_SWEDEN' || source === 'BUSINESS') {
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
  hydrateLimit: number,
  knownCards?: OfferCardItem[]
): HydrationTask[] {
  const knownById = new Map<string, OfferCardItem>();
  for (const card of knownCards ?? []) {
    if (!card?.id || card.resultKind === 'event') continue;
    if (!knownById.has(card.id)) knownById.set(card.id, card);
  }

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

    if (type === 'order') {
      const businessId = result.business?.id ? String(result.business.id) : undefined;
      if (businessId) {
        if (reservedBusinessIds.has(businessId)) continue;
        reservedBusinessIds.add(businessId);
        const known = knownById.get(businessId);
        if (known) {
          tasks.push({ kind: 'ready', card: overlaySearchDistance(known, result), rank });
          continue;
        }
      }
      if (detailBudgetUsed >= hydrateLimit) continue;
      tasks.push({ kind: 'order', id: String(result.id), rank });
      detailBudgetUsed += 1;
      continue;
    }

    const businessId = String(result.id);
    if (reservedBusinessIds.has(businessId)) continue;
    reservedBusinessIds.add(businessId);
    const known = knownById.get(businessId);
    if (known) {
      tasks.push({ kind: 'ready', card: overlaySearchDistance(known, result), rank });
      continue;
    }
    if (detailBudgetUsed >= hydrateLimit) {
      const lightweight = mapBusinessSearchHitToCard(result);
      if (lightweight) tasks.push({ kind: 'ready', card: lightweight, rank });
      continue;
    }
    tasks.push({ kind: 'business', id: businessId, rank, fallback: result });
    detailBudgetUsed += 1;
  }

  return tasks;
}

function overlaySearchDistance(card: OfferCardItem, result: UnifiedSearchResult): OfferCardItem {
  if (typeof result.distanceKm === 'number' && Number.isFinite(result.distanceKm)) {
    return { ...card, distanceKm: result.distanceKm };
  }
  return card;
}

const WEEKEND_COMPANY_QUERIES = ['afterwork', 'restaurang', 'bar', 'bowling'] as const;

function unifiedSearchParams(q: string, take: number, city?: string) {
  const params = new URLSearchParams({
    q,
    take: String(Math.min(take, 50)),
    skip: '0',
  });
  if (city?.trim()) params.set('city', city.trim());
  return params;
}

function uniqueSearchHits(hits: UnifiedSearchResult[]) {
  const seen = new Set<string>();
  const out: UnifiedSearchResult[] = [];
  for (const hit of hits) {
    const id = String(hit?.id ?? '').trim();
    if (!id) continue;
    const key = `${normalizeSearchResultType(hit)}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}

function interleaveSearchHits(
  companies: UnifiedSearchResult[],
  events: UnifiedSearchResult[],
  take: number
) {
  const mixed: UnifiedSearchResult[] = [];
  let i = 0;
  let j = 0;
  while (mixed.length < take && (i < companies.length || j < events.length)) {
    if (i < companies.length) mixed.push(companies[i++]);
    if (mixed.length >= take) break;
    if (j < events.length) mixed.push(events[j++]);
  }
  return mixed;
}

/** "helgen" is event-intent on the backend — also pull weekend places so the mix isn't only evenemang. */
async function fetchWeekendUnifiedResults(options: { take: number; city?: string; skip?: number }) {
  const take = Math.min(options.take, 50);
  const skip = options.skip ?? 0;
  const city = options.city;
  const [weekendHits, ...companyBuckets] = await Promise.all([
    fetchUnifiedSearch(unifiedSearchParams('helgen', 20, city)),
    ...WEEKEND_COMPANY_QUERIES.map((q) => fetchUnifiedSearch(unifiedSearchParams(q, 10, city))),
  ]);

  const events = uniqueSearchHits(
    weekendHits.filter((hit) => normalizeSearchResultType(hit) === 'event')
  );
  const companies = uniqueSearchHits([
    ...weekendHits.filter((hit) => normalizeSearchResultType(hit) !== 'event'),
    ...companyBuckets.flat().filter((hit) => normalizeSearchResultType(hit) !== 'event'),
  ]);

  return interleaveSearchHits(companies, events, take + skip).slice(skip, skip + take);
}

async function finalizeSearchCards(
  tasks: HydrationTask[],
  knownCards?: OfferCardItem[],
  options?: { skipImageHydrate?: boolean }
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

  if (options?.skipImageHydrate) return deduped;

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

  const results =
    isWeekendSearchQuery(q) && !options.categoryName
      ? await fetchWeekendUnifiedResults({
          take: Math.min(options.take ?? 24, 50),
          skip: options.skip ?? 0,
          city: normalized.city,
        })
      : await fetchUnifiedSearch(
          (() => {
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
            return params;
          })()
        );
  const tasks = buildHydrationTasks(results, hydrateLimit, options.knownCards);
  return finalizeSearchCards(tasks, options.knownCards);
}

/**
 * Turn mixed `type: "business" | "event"` hits (search or `/business/for-you/now`)
 * into home cards, preserving API rank. Known business cards skip a detail GET.
 */
export async function cardsFromUnifiedResults(
  results: UnifiedSearchResult[],
  options: {
    maxHydrate?: number;
    knownCards?: OfferCardItem[];
    /** Skip per-business image GETs — use for Rekommenderat / Visa alla paint. */
    skipImageHydrate?: boolean;
  } = {}
): Promise<OfferCardItem[]> {
  const hydrateLimit = Math.min(
    options.maxHydrate ?? SEARCH_HYDRATE_LIMIT,
    SEARCH_HYDRATE_LIMIT_MAX
  );
  const tasks = buildHydrationTasks(results, hydrateLimit, options.knownCards);
  return finalizeSearchCards(tasks, options.knownCards, {
    skipImageHydrate: options.skipImageHydrate,
  });
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

  if (isWeekendSearchQuery(q) && !options.categoryName) {
    return searchCatalog(query, {
      city: options.city,
      take: options.take,
      skip: options.skip,
      maxHydrate: options.maxHydrate,
      knownCards: options.knownCards,
    });
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
  const tasks = buildHydrationTasks(results, hydrateLimit, options.knownCards);
  return finalizeSearchCards(tasks, options.knownCards);
}
