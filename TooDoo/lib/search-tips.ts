import { apiUrl } from '@/lib/api';
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
};

export type SearchTipItem = {
  label: string;
  kind: 'tip' | 'business' | 'event';
  id?: string;
};

type SuggestionsResponse = {
  results?: Array<Partial<SearchSuggestion> & { label?: string }>;
  take?: number;
};

type UnifiedSearchResponse = {
  results?: Array<Partial<SearchSuggestion> & { label?: string; type?: string; source?: string }>;
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

function labelsToTips(labels: string[], take: number): SearchTipItem[] {
  return uniqueTipItems(
    labels.map((label) => ({ label, kind: 'tip' as const })),
    take
  );
}

function mapSuggestionRows(
  rows: SuggestionsResponse['results'],
  take: number
): SearchTipItem[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  const tips: SearchTipItem[] = [];
  for (const row of rows) {
    const label = typeof row?.label === 'string' ? row.label.trim() : '';
    if (!label) continue;
    const type = String(row?.type ?? 'business').toLowerCase();
    tips.push({
      label,
      kind: type === 'event' ? 'event' : 'business',
      id: row?.id ? String(row.id) : undefined,
    });
  }

  return uniqueTipItems(tips, take);
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
  return uniqueTipItems(tips, 8);
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
    return [];
  }

  const json = (await response.json().catch(() => ({}))) as SuggestionsResponse;
  return mapSuggestionRows(json.results, take);
}

/** Pull event hits from unified search — suggestions endpoint is business-only. */
async function fetchEventSearchTips(q: string, take: number, city?: string) {
  const normalized = normalizeCatalogSearchQuery(q, { city });
  const params = new URLSearchParams({
    q: normalized.q,
    take: String(Math.min(Math.max(take * 2, 8), 24)),
  });
  if (normalized.city) {
    params.set('city', normalized.city);
  }

  const response = await fetch(apiUrl(`/search?${params.toString()}`));
  if (!response.ok) {
    return [];
  }

  const json = (await response.json().catch(() => ({}))) as UnifiedSearchResponse;
  const rows = Array.isArray(json.results) ? json.results : [];
  const tips: SearchTipItem[] = [];

  for (const row of rows) {
    const type = String(row?.type ?? '').toLowerCase();
    const source = String(row?.source ?? '')
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_');
    const isEvent =
      type === 'event' || source === 'MUNICIPIO' || source === 'VISIT_SWEDEN';
    if (!isEvent) continue;

    const label = decodeHtmlEntities(typeof row?.label === 'string' ? row.label : '');
    if (!label) continue;
    tips.push({
      label,
      kind: 'event',
      id: row?.id ? String(row.id) : undefined,
    });
    if (tips.length >= take) break;
  }

  return tips;
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
      const [eventTips, businessTips] = await Promise.all([
        fetchEventSearchTips(q, Math.min(take, 5), options?.city),
        fetchBusinessSuggestions(q, take, options?.city),
      ]);
      const merged = uniqueTipItems([...eventTips, ...businessTips], take);
      if (merged.length > 0) {
        return merged;
      }
    } else if (options?.isLoggedIn && options.authFetch) {
      const personalized = await fetchPersonalizedTips(options.authFetch, take);
      if (personalized.length > 0) {
        return personalized;
      }
    } else {
      const categoryTips = await fetchCategoryTips(take);
      if (categoryTips.length > 0) {
        return categoryTips;
      }
    }
  } catch {
    // fall through to local defaults
  }

  return labelsToTips(DEFAULT_SEARCH_TIPS, take);
}
