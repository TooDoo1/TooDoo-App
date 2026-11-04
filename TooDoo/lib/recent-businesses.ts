import { normalizeImageUrl } from '@/lib/api';
import {
  formatBusinessAddress,
  resolveBusinessCategoryIds,
  resolveBusinessCategoryNames,
  resolveBusinessSubcategoryName,
  type OfferCardItem,
} from '@/lib/home-offers';

export type RecentCompanyCard = OfferCardItem & {
  lastClickedAt?: string;
  clickCount?: number;
};

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

function parseRecentBusinessPayload(json: unknown): any[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj.businesses)) return obj.businesses;
    if (Array.isArray(obj.results)) return obj.results;
  }
  return [];
}

export function mapRecentBusinessToCard(business: any): RecentCompanyCard | null {
  const businessId = String(business?.id ?? business?._id ?? '').trim();
  if (!businessId) return null;

  const categoryIds = resolveBusinessCategoryIds(business);
  const categoryNames = resolveBusinessCategoryNames(business);
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
    categoryName:
      business?.categoryName ??
      business?.category?.name ??
      categoryNames[0],
    categoryNames,
    subcategoryName: resolveBusinessSubcategoryName(business),
    deal: false,
    orderIds: [],
    Adress: formatBusinessAddress(business) || 'Adress saknas',
    latitude: business?.latitude ?? undefined,
    longitude: business?.longitude ?? undefined,
    Telefon: business?.contactPhone ?? undefined,
    Website: business?.website ?? '',
    kortbeskrivning: business?.description ?? '',
    långbeskrivning: business?.description ?? '',
    lastClickedAt:
      typeof business?.lastClickedAt === 'string' ? business.lastClickedAt : undefined,
    clickCount: Number.isFinite(Number(business?.clickCount))
      ? Number(business.clickCount)
      : undefined,
  };
}

/** IDs present on the first fetch this app session. Resets on cold start. */
let sessionRecentBaseline: Set<string> | null = null;

export function resetRecentCompanyBaseline() {
  sessionRecentBaseline = null;
}

export function captureRecentCompanyBaseline(ids: string[]) {
  if (sessionRecentBaseline != null) return;
  sessionRecentBaseline = new Set(ids);
}

export function isNewRecentCompany(id: string): boolean {
  if (sessionRecentBaseline == null) return false;
  return !sessionRecentBaseline.has(id);
}

export function formatRecentVisitLabel(iso?: string): string | undefined {
  if (!iso) return undefined;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return undefined;

  const diffMs = Date.now() - then;
  if (diffMs < 0) return 'Nyss';

  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 2) return 'Nyss';
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} tim`;

  const days = Math.round(hours / 24);
  if (days === 1) return 'Igår';
  if (days < 7) return `${days} d`;
  return undefined;
}

export async function fetchRecentBusinesses(
  authFetch: AuthFetch,
  take = 20
): Promise<RecentCompanyCard[]> {
  const limit = Math.min(Math.max(take, 1), 50);
  try {
    const response = await authFetch(`/user/me/recent-businesses?take=${limit}`);
    if (!response.ok) return [];
    const json = await response.json().catch(() => null);
    const cards: RecentCompanyCard[] = [];
    const seen = new Set<string>();

    for (const row of parseRecentBusinessPayload(json)) {
      const card = mapRecentBusinessToCard(row);
      if (!card || seen.has(card.id)) continue;
      seen.add(card.id);
      cards.push(card);
    }

    captureRecentCompanyBaseline(cards.map((card) => card.id));
    return cards;
  } catch {
    return [];
  }
}
