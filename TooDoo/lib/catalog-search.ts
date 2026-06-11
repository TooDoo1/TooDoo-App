import { apiUrl, normalizeImageUrl } from '@/lib/api';
import { hydrateOfferCardImages } from '@/lib/business-image';
import { haversineKm, isPlausibleSwedenCoordinate } from '@/lib/geo';
import {
  formatBusinessAddress,
  mapApiOrderToCardItem,
  type OfferCardItem,
} from '@/lib/home-offers';

export type SearchResultsView = 'all' | 'near' | 'hot';

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

function mapBusinessSearchResult(business: any): OfferCardItem {
  const businessId = String(business?.id ?? business?._id ?? 'business');
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
    categoryId: business?.categoryId ?? business?.category?.id,
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

type SearchResponse = {
  results?: unknown[];
  total?: number;
};

async function fetchSearchResults(path: string, params: URLSearchParams): Promise<unknown[]> {
  const response = await fetch(apiUrl(`${path}?${params.toString()}`));
  if (!response.ok) {
    return [];
  }

  const json = (await response.json().catch(() => ({}))) as SearchResponse & {
    orders?: unknown[];
    businesses?: unknown[];
  };

  if (Array.isArray(json.results)) return json.results;
  if (Array.isArray(json.orders)) return json.orders;
  if (Array.isArray(json.businesses)) return json.businesses;
  return [];
}

/**
 * Backend catalog search (orders + businesses). The API ranks matches server-side.
 */
export async function searchCatalog(
  query: string,
  options: {
    categoryName?: string;
    city?: string;
    take?: number;
    skip?: number;
    knownCards?: OfferCardItem[];
  } = {}
): Promise<OfferCardItem[]> {
  const q = query.trim();
  if (q.length < 2) {
    return [];
  }

  const params = new URLSearchParams({
    q,
    take: String(options.take ?? 30),
    skip: String(options.skip ?? 0),
  });
  if (options.categoryName) {
    params.set('categoryName', options.categoryName);
  }
  if (options.city) {
    params.set('city', options.city);
  }

  const [orderRows, businessRows] = await Promise.all([
    fetchSearchResults('/orders/search', params),
    fetchSearchResults('/business/search', params),
  ]);

  const orderCards = orderRows.map((order, index) => mapApiOrderToCardItem(order, index));
  const businessCards = businessRows.map((business) => mapBusinessSearchResult(business));

  const businessesWithOrderHits = new Set(orderCards.map((card) => card.id));
  const businessesOnly = businessCards.filter((card) => !businessesWithOrderHits.has(card.id));

  const merged = [...orderCards, ...businessesOnly];

  try {
    return await hydrateOfferCardImages(merged, {
      knownCards: options.knownCards,
    });
  } catch {
    return merged;
  }
}
