import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiUrl } from '@/lib/api';

const LOCAL_RECENT_KEY = 'toodoo.recentSearches';
const LOCAL_RECENT_MAX = 12;
const MIN_QUERY_LENGTH = 2;

export type PopularSearchRow = {
  query: string;
  city?: string;
  searchCount?: number;
};

function normalizeQuery(raw: string) {
  return raw.trim().replace(/\s+/g, ' ');
}

function queryKey(value: string) {
  return value.toLocaleLowerCase('sv-SE');
}

export async function loadLocalRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const queries: string[] = [];
    for (const item of parsed) {
      const query = typeof item === 'string' ? normalizeQuery(item) : '';
      if (query.length < MIN_QUERY_LENGTH) continue;
      const key = queryKey(query);
      if (seen.has(key)) continue;
      seen.add(key);
      queries.push(query);
      if (queries.length >= LOCAL_RECENT_MAX) break;
    }
    return queries;
  } catch {
    return [];
  }
}

export async function persistLocalRecentSearches(queries: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCAL_RECENT_KEY, JSON.stringify(queries.slice(0, LOCAL_RECENT_MAX)));
  } catch {
    // Ignore storage failures — recents still work in memory for this session.
  }
}

export function prependLocalRecentSearch(queries: string[], raw: string): string[] {
  const query = normalizeQuery(raw);
  if (query.length < MIN_QUERY_LENGTH) return queries;
  const key = queryKey(query);
  return [query, ...queries.filter((item) => queryKey(item) !== key)].slice(0, LOCAL_RECENT_MAX);
}

export async function fetchPopularSearches(options?: {
  city?: string;
  take?: number;
}): Promise<PopularSearchRow[]> {
  const take = Math.min(Math.max(options?.take ?? 20, 1), 50);
  const params = new URLSearchParams({ take: String(take) });
  if (options?.city?.trim()) {
    params.set('city', options.city.trim());
  }

  const response = await fetch(apiUrl(`/search/recent?${params.toString()}`));
  if (!response.ok) return [];

  const json = (await response.json().catch(() => null)) as unknown;
  const rows = Array.isArray(json)
    ? json
    : json && typeof json === 'object' && Array.isArray((json as { results?: unknown }).results)
      ? (json as { results: unknown[] }).results
      : [];

  const seen = new Set<string>();
  const popular: PopularSearchRow[] = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as { query?: unknown; city?: unknown; searchCount?: unknown };
    const query = typeof record.query === 'string' ? normalizeQuery(record.query) : '';
    if (query.length < MIN_QUERY_LENGTH) continue;
    const key = queryKey(query);
    if (seen.has(key)) continue;
    seen.add(key);
    popular.push({
      query,
      city: typeof record.city === 'string' ? record.city.trim() : undefined,
      searchCount: typeof record.searchCount === 'number' ? record.searchCount : undefined,
    });
  }

  return popular.sort((a, b) => (b.searchCount ?? 0) - (a.searchCount ?? 0));
}
