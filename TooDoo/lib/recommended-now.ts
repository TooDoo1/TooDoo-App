import { apiUrl } from '@/lib/api';
import { cardsFromUnifiedResults, type UnifiedSearchResult } from '@/lib/catalog-search';
import type { OfferCardItem } from '@/lib/home-offers';

const STOCKHOLM_TZ = 'Europe/Stockholm';

export type RecommendedNowMoment = {
  id: 'morning' | 'lunch' | 'afternoon' | 'evening' | 'late';
  title: string;
  subtitle: string;
  searchQuery: string;
  categories: string[];
  keywords: string[];
};

type RankableCard = {
  id: string;
  title?: string;
  categoryName?: string;
  kortbeskrivning?: string;
  långbeskrivning?: string;
  erbjudande?: string | string[];
  deal?: boolean;
  distanceKm?: number;
};

export function stockholmHour(now: Date = new Date()): number {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: STOCKHOLM_TZ,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now)
  );
  return Number.isFinite(hour) ? hour : now.getHours();
}

export function getRecommendedNowMoment(now: Date = new Date()): RecommendedNowMoment {
  const hour = stockholmHour(now);

  if (hour < 11) {
    return {
      id: 'morning',
      title: 'Rekommenderat just nu',
      subtitle: 'Frukost & fika',
      searchQuery: 'frukost',
      categories: ['mat'],
      keywords: [
        'frukost',
        'brunch',
        'fika',
        'café',
        'cafe',
        'bageri',
        'bakery',
        'kaffe',
        'breakfast',
      ],
    };
  }

  if (hour < 14) {
    return {
      id: 'lunch',
      title: 'Rekommenderat just nu',
      subtitle: 'Lunch i närheten',
      searchQuery: 'lunch',
      categories: ['mat'],
      keywords: [
        'lunch',
        'dagens',
        'restaurang',
        'sallad',
        'sushi',
        'pizza',
        'hamburgare',
        'burger',
        'wrap',
        'poke',
        'thai',
        'indisk',
        'ramen',
      ],
    };
  }

  if (hour < 17) {
    return {
      id: 'afternoon',
      title: 'Rekommenderat just nu',
      subtitle: 'Fika & shopping',
      searchQuery: 'fika',
      categories: ['mat', 'shopping', 'skönhet'],
      keywords: ['fika', 'café', 'cafe', 'glass', 'shopping', 'butik', 'spa', 'salong'],
    };
  }

  if (hour < 22) {
    return {
      id: 'evening',
      title: 'Rekommenderat just nu',
      subtitle: 'Ikväll',
      searchQuery: 'middag',
      categories: ['mat', 'nöje', 'noje', 'kultur'],
      keywords: [
        'middag',
        'dinner',
        'afterwork',
        'restaurang',
        'bar',
        'bio',
        'konsert',
        'live',
        'pub',
        'vin',
      ],
    };
  }

  return {
    id: 'late',
    title: 'Rekommenderat just nu',
    subtitle: 'Sent i stan',
    searchQuery: 'pizza',
    categories: ['mat', 'nöje', 'noje'],
    keywords: ['pizza', 'kebab', 'bar', 'natt', 'hamburger', 'burgare', 'sushi'],
  };
}

function cardHaystack(card: RankableCard) {
  const offers = Array.isArray(card.erbjudande)
    ? card.erbjudande.join(' ')
    : card.erbjudande ?? '';
  return [
    card.title,
    card.categoryName,
    card.kortbeskrivning,
    card.långbeskrivning,
    offers,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('sv-SE');
}

export function scoreCardForMoment(card: RankableCard, moment: RecommendedNowMoment): number {
  const hay = ` ${cardHaystack(card)} `;
  const category = (card.categoryName ?? '').trim().toLocaleLowerCase('sv-SE');
  let score = 0;

  if (category && moment.categories.some((hint) => category.includes(hint) || hint.includes(category))) {
    score += 8;
  }

  for (const keyword of moment.keywords) {
    const needle = keyword.trim().toLocaleLowerCase('sv-SE');
    if (needle.length < 2) continue;
    if (hay.includes(needle)) score += needle.length >= 5 ? 6 : 4;
  }

  if (card.deal) score += 2;

  if (typeof card.distanceKm === 'number' && Number.isFinite(card.distanceKm)) {
    if (card.distanceKm <= 1.5) score += 3;
    else if (card.distanceKm <= 4) score += 1;
  }

  return score;
}

export function pickRecommendedNowCards<T extends RankableCard>(
  cards: T[],
  moment: RecommendedNowMoment,
  limit = 8
): T[] {
  const unique: T[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    if (!card?.id || seen.has(card.id)) continue;
    seen.add(card.id);
    unique.push(card);
  }

  const ranked = unique
    .map((card) => ({ card, score: scoreCardForMoment(card, moment) }))
    .sort((a, b) => b.score - a.score);

  const matched = ranked.filter((row) => row.score > 0).map((row) => row.card);
  if (matched.length >= 3) {
    return matched.slice(0, limit);
  }

  const filler = ranked.map((row) => row.card).filter((card) => !matched.some((hit) => hit.id === card.id));
  return [...matched, ...filler].slice(0, limit);
}

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

export type RecommendedNowFeed = {
  moment: string;
  helg: boolean;
  title: string;
  subtitle: string;
  searchQuery: string;
  cards: OfferCardItem[];
};

type RecommendedNowResponse = {
  moment?: string;
  helg?: boolean;
  title?: string;
  subtitle?: string;
  searchQuery?: string;
  results?: UnifiedSearchResult[];
};

/**
 * Personalized “Rekommenderat just nu” from GET /business/for-you/now.
 * Optional Bearer token reranks with interests / vibes / recent visits.
 */
export async function fetchRecommendedNow(options: {
  authFetch?: AuthFetch;
  city?: string;
  coords?: { lat: number; lng: number } | null;
  categoryName?: string;
  take?: number;
  skip?: number;
  knownCards?: OfferCardItem[];
  /**
   * Detail GETs per unknown hit. Default 0 — search hits + knownCards are enough
   * for Rekommenderat paint; opening hours merge in from the home catalog later.
   */
  maxHydrate?: number;
}): Promise<RecommendedNowFeed | null> {
  const take = Math.min(Math.max(options.take ?? 8, 1), 20);
  const params = new URLSearchParams({ take: String(take) });
  const skip = Math.max(options.skip ?? 0, 0);
  if (skip > 0) params.set('skip', String(skip));
  const city = options.city?.trim();
  if (city) params.set('city', city);
  const categoryName = options.categoryName?.trim();
  if (categoryName) params.set('categoryName', categoryName);
  const lat = options.coords?.lat;
  const lng = options.coords?.lng;
  if (
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    typeof lng === 'number' &&
    Number.isFinite(lng)
  ) {
    params.set('lat', String(lat));
    params.set('lng', String(lng));
  }

  const path = `/business/for-you/now?${params.toString()}`;

  try {
    const response = options.authFetch
      ? await options.authFetch(path)
      : await fetch(apiUrl(path));
    if (!response.ok) return null;

    const json = (await response.json().catch(() => ({}))) as RecommendedNowResponse;
    const results = Array.isArray(json.results) ? json.results : [];
    const cards = await cardsFromUnifiedResults(results, {
      maxHydrate: options.maxHydrate ?? 0,
      knownCards: options.knownCards,
      skipImageHydrate: true,
    });

    const fallback = getRecommendedNowMoment();
    return {
      moment: typeof json.moment === 'string' && json.moment.trim() ? json.moment.trim() : fallback.id,
      helg: Boolean(json.helg),
      title:
        typeof json.title === 'string' && json.title.trim()
          ? json.title.trim()
          : fallback.title,
      subtitle:
        typeof json.subtitle === 'string' && json.subtitle.trim()
          ? json.subtitle.trim()
          : fallback.subtitle,
      searchQuery:
        typeof json.searchQuery === 'string' && json.searchQuery.trim()
          ? json.searchQuery.trim()
          : fallback.searchQuery,
      cards,
    };
  } catch {
    return null;
  }
}
