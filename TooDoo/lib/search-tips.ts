import { apiUrl } from '@/lib/api';
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
};

type SuggestionsResponse = {
  suggestions?: Array<Partial<SearchSuggestion> & { label?: string }>;
  take?: number;
};

export const DEFAULT_SEARCH_TIPS = [
  'pizza',
  'sushi',
  'live musik',
  'frukost',
  'shopping',
  'event',
  'lunch',
  'träning',
];

function uniqueLabels(values: string[], take: number) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of values) {
    const label = raw.trim();
    if (!label) continue;
    const key = label.toLocaleLowerCase('sv-SE');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(label);
    if (result.length >= take) break;
  }

  return result;
}

function mapSuggestionRows(rows: SuggestionsResponse['suggestions'], take: number) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const labels = rows
    .map((row) => (typeof row?.label === 'string' ? row.label.trim() : ''))
    .filter(Boolean);

  return uniqueLabels(labels, take);
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

export function mergeSearchTips(...groups: string[][]) {
  return uniqueLabels(groups.flat(), 8);
}

async function fetchBusinessSuggestions(q: string, take: number, city?: string) {
  const params = new URLSearchParams({
    q: q.trim(),
    take: String(take),
  });

  if (city?.trim()) {
    params.set('city', city.trim());
  }

  const response = await fetch(apiUrl(`/business/search/suggestions?${params.toString()}`));
  if (!response.ok) {
    return [];
  }

  const json = (await response.json().catch(() => ({}))) as SuggestionsResponse;
  return mapSuggestionRows(json.suggestions, take);
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

  return uniqueLabels([...fromInterestObjects, ...fromCategoryMap], take);
}

async function fetchCategoryTips(take: number) {
  const categories = await fetchCategoryOptions();
  return uniqueLabels(categories.map((category) => category.name), take);
}

export async function fetchSearchTips(options?: {
  take?: number;
  q?: string;
  city?: string;
  authFetch?: (path: string, init?: RequestInit) => Promise<Response>;
  isLoggedIn?: boolean;
}): Promise<string[]> {
  const take = options?.take ?? 8;
  const q = options?.q?.trim() ?? '';

  try {
    if (q.length >= 1) {
      const suggestions = await fetchBusinessSuggestions(q, take, options?.city);
      if (suggestions.length > 0) {
        return suggestions;
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

  return DEFAULT_SEARCH_TIPS.slice(0, take);
}
