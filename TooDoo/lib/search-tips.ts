import { apiUrl, normalizeImageUrl } from '@/lib/api';
import { normalizeCatalogSearchQuery } from '@/lib/catalog-search';
import {
  fetchCategoryOptions,
  normalizeInterestIds,
  type UserProfile,
} from '@/lib/profile';

export type SearchSuggestion = {
  type: string;
  id: string;
  label: string;
  subtitle?: string;
  city?: string;
  source?: string;
  image?: string;
};

export type SearchTipItem = {
  label: string;
  kind: 'tip' | 'business' | 'event';
  id?: string;
  subtitle?: string;
  /** Single thumbnail for a concrete business/event hit. */
  imageUri?: string;
  /** TikTok-style preview strip under a query tip. */
  previewImages?: string[];
};

type SuggestionsResponse = {
  results?: Array<Partial<SearchSuggestion> & { label?: string }>;
  take?: number;
};

type UnifiedSearchResponse = {
  results?: Array<
    Partial<SearchSuggestion> & {
      label?: string;
      type?: string;
      source?: string;
      image?: string;
      subtitle?: string;
      city?: string;
    }
  >;
};

/** `GET /search/suggestions` caps `take` at 10. */
const SUGGESTIONS_MAX_TAKE = 10;

export const DEFAULT_SEARCH_TIPS = [
  'pizza',
  'sushi',
  'live musik',
  'frukost',
  'shopping',
  'evenemang',
  'konsert',
  'lunch',
];

function uniqueTipItems(values: SearchTipItem[], take: number): SearchTipItem[] {
  const seen = new Set<string>();
  const result: SearchTipItem[] = [];

  for (const tip of values) {
    const label = tip.label.trim();
    if (!label) continue;
    const key = `${tip.kind}:${tip.id ?? label.toLocaleLowerCase('sv-SE')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...tip, label });
    if (result.length >= take) break;
  }

  return result;
}

/** Unique shops/events by id + label — never pads up to `take`. */
function uniqueShopTips(values: SearchTipItem[], take: number): SearchTipItem[] {
  const seenLabels = new Set<string>();
  const seenIds = new Set<string>();
  const result: SearchTipItem[] = [];

  for (const tip of values) {
    if (tip.kind !== 'business' && tip.kind !== 'event') continue;
    const label = tip.label.trim();
    if (!label) continue;
    const labelKey = label.toLocaleLowerCase('sv-SE');
    if (seenLabels.has(labelKey)) continue;
    if (tip.id) {
      if (seenIds.has(tip.id)) continue;
      seenIds.add(tip.id);
    }
    seenLabels.add(labelKey);
    result.push({ ...tip, label });
    if (result.length >= take) break;
  }

  return result;
}

function labelsToTips(labels: string[], take: number): SearchTipItem[] {
  return uniqueTipItems(
    labels.map((label) => ({ label, kind: 'tip' as const })),
    take
  );
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
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

function uniqueImageUris(values: Array<string | undefined>, take: number) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const uri = raw?.trim();
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    result.push(uri);
    if (result.length >= take) break;
  }
  return result;
}

function fallbackPreviewUri(seed: string) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed.slice(0, 48))}/160/160`;
}

export function getLocalSearchTips(query: string, names: string[], take = 8) {
  const q = query.trim().toLocaleLowerCase('sv-SE');
  if (!q) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of names) {
    const label = raw.trim();
    if (!label) continue;
    const key = label.toLocaleLowerCase('sv-SE');
    if (!key.includes(q) || seen.has(key)) continue;
    seen.add(key);
    result.push(label);
    if (result.length >= take) break;
  }

  return result;
}

/** Local catalog businesses matching the query — same shape as API shop suggestions. */
export function getLocalBusinessSearchTips(
  query: string,
  cards: Array<{
    id: string;
    title: string;
    categoryName?: string;
    resultKind?: 'business' | 'event';
  }>,
  take = 8
): SearchTipItem[] {
  const q = query.trim().toLocaleLowerCase('sv-SE');
  if (!q) return [];

  const tips: SearchTipItem[] = [];
  const seen = new Set<string>();

  for (const card of cards) {
    if (card.resultKind === 'event') continue;
    const label = card.title?.trim();
    if (!label) continue;
    const key = label.toLocaleLowerCase('sv-SE');
    if (!key.includes(q) || seen.has(key)) continue;
    seen.add(key);
    tips.push({
      label,
      kind: 'business',
      id: card.id,
      subtitle: card.categoryName?.trim() || 'Företag',
    });
    if (tips.length >= take) break;
  }

  return tips;
}

/** Max individual shop rows above the generic tips while typing. */
export const SEARCH_SHOP_TIPS_TAKE = 5;
const SEARCH_GENERIC_TIPS_TAKE = 8;

export function splitSearchTips(tips: SearchTipItem[]) {
  const shops = uniqueShopTips(tips, SEARCH_SHOP_TIPS_TAKE);
  const generics = uniqueTipItems(
    tips.filter((tip) => tip.kind === 'tip'),
    SEARCH_GENERIC_TIPS_TAKE
  );
  return { shops, generics };
}

export function mergeSearchTips(...groups: Array<Array<string | SearchTipItem>>) {
  const tips: SearchTipItem[] = [];
  for (const group of groups) {
    for (const item of group) {
      if (typeof item === 'string') {
        tips.push({ label: item, kind: 'tip' });
      } else if (item?.label) {
        tips.push(item);
      }
    }
  }
  const { shops, generics } = splitSearchTips(tips);
  return [...shops, ...generics];
}

async function fetchBusinessSuggestions(q: string, take: number, city?: string) {
  const params = new URLSearchParams({
    q: q.trim().slice(0, 100),
    take: String(Math.min(take, SUGGESTIONS_MAX_TAKE)),
  });

  if (city?.trim()) {
    params.set('city', city.trim());
  }

  const response = await fetch(apiUrl(`/search/suggestions?${params.toString()}`));
  if (!response.ok) {
    return [] as SearchTipItem[];
  }

  const json = (await response.json().catch(() => ({}))) as SuggestionsResponse;
  if (!Array.isArray(json.results)) return [];

  const tips: SearchTipItem[] = [];
  for (const row of json.results) {
    const label = typeof row?.label === 'string' ? row.label.trim() : '';
    if (!label) continue;
    const type = String(row?.type ?? 'business').toLowerCase();
    const id = row?.id ? String(row.id) : undefined;
    tips.push({
      label,
      kind: type === 'event' ? 'event' : 'business',
      id,
      subtitle:
        typeof row?.subtitle === 'string'
          ? row.subtitle
          : typeof row?.city === 'string'
            ? row.city
            : undefined,
      imageUri: normalizeImageUrl(row?.image) ?? (id ? fallbackPreviewUri(`biz-${id}`) : undefined),
    });
  }

  return uniqueTipItems(tips, take);
}

/** Unified search → tips with images + a query tip that carries a preview strip. */
async function fetchUnifiedSearchTips(q: string, take: number, city?: string) {
  const normalized = normalizeCatalogSearchQuery(q, { city });
  const params = new URLSearchParams({
    q: normalized.q,
    take: String(Math.min(Math.max(take * 2, 10), 24)),
  });
  if (normalized.city) {
    params.set('city', normalized.city);
  }

  const response = await fetch(apiUrl(`/search?${params.toString()}`));
  if (!response.ok) {
    return [] as SearchTipItem[];
  }

  const json = (await response.json().catch(() => ({}))) as UnifiedSearchResponse;
  const rows = Array.isArray(json.results) ? json.results : [];
  const hitTips: SearchTipItem[] = [];
  const previewPool: string[] = [];

  for (const row of rows) {
    const label = decodeHtmlEntities(typeof row?.label === 'string' ? row.label : '');
    if (!label) continue;

    const type = String(row?.type ?? '').toLowerCase();
    const source = String(row?.source ?? '')
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_');
    const isEvent =
      type === 'event' || source === 'MUNICIPIO' || source === 'VISIT_SWEDEN';
    const id = row?.id ? String(row.id) : undefined;
    const imageUri =
      normalizeImageUrl(row?.image) ??
      (id ? fallbackPreviewUri(`${isEvent ? 'event' : 'biz'}-${id}`) : undefined);

    if (imageUri) previewPool.push(imageUri);

    hitTips.push({
      label,
      kind: isEvent ? 'event' : 'business',
      id,
      subtitle:
        typeof row?.subtitle === 'string'
          ? decodeHtmlEntities(row.subtitle)
          : typeof row?.city === 'string'
            ? row.city
            : undefined,
      imageUri,
    });
  }

  const queryTip: SearchTipItem = {
    label: q.trim(),
    kind: 'tip',
    previewImages: uniqueImageUris(previewPool, 4),
  };

  return uniqueTipItems([queryTip, ...hitTips], take);
}

async function fetchPersonalizedTips(
  authFetch: (path: string, init?: RequestInit) => Promise<Response>,
  take: number
) {
  const [profileRes, categories] = await Promise.all([
    authFetch('/user/me'),
    fetchCategoryOptions(),
  ]);

  if (!profileRes.ok) {
    return [];
  }

  const profile = (await profileRes.json().catch(() => ({}))) as UserProfile;
  const interestIds = new Set(normalizeInterestIds(profile.interests));

  const fromInterestObjects = Array.isArray(profile.interests)
    ? profile.interests
        .map((item) => (typeof item === 'object' && item?.name ? String(item.name) : ''))
        .filter(Boolean)
    : [];

  const fromCategoryMap = categories
    .filter((category) => interestIds.has(category.id))
    .map((category) => category.name);

  return labelsToTips([...fromInterestObjects, ...fromCategoryMap], take);
}

async function fetchCategoryTips(take: number) {
  const categories = await fetchCategoryOptions();
  return labelsToTips(
    categories.map((category) => category.name),
    take
  );
}

export async function fetchSearchTips(options?: {
  take?: number;
  q?: string;
  city?: string;
  authFetch?: (path: string, init?: RequestInit) => Promise<Response>;
  isLoggedIn?: boolean;
}): Promise<SearchTipItem[]> {
  const take = options?.take ?? 8;
  const q = options?.q?.trim() ?? '';

  try {
    if (q.length >= 1) {
      const [businessTips, unifiedTips] = await Promise.all([
        fetchBusinessSuggestions(q, SEARCH_SHOP_TIPS_TAKE, options?.city),
        fetchUnifiedSearchTips(q, SEARCH_SHOP_TIPS_TAKE, options?.city),
      ]);
      const shopHits = uniqueShopTips([...businessTips, ...unifiedTips], SEARCH_SHOP_TIPS_TAKE);
      // Generics sit below the shop rows (pizza, sushi, …) — not instead of them.
      const generics = labelsToTips(DEFAULT_SEARCH_TIPS, SEARCH_GENERIC_TIPS_TAKE);
      if (shopHits.length > 0) {
        return [...shopHits, ...generics];
      }
      return [{ label: q, kind: 'tip' as const }, ...generics];
    }

    if (options?.isLoggedIn && options.authFetch) {
      const personalized = await fetchPersonalizedTips(options.authFetch, take);
      if (personalized.length > 0) {
        return personalized;
      }
    }

    const categoryTips = await fetchCategoryTips(take);
    if (categoryTips.length > 0) {
      return categoryTips;
    }
  } catch {
    // fall through to local defaults (empty-query only)
  }

  if (q.length >= 1) {
    return [{ label: q, kind: 'tip' }];
  }

  return labelsToTips(DEFAULT_SEARCH_TIPS, take);
}
