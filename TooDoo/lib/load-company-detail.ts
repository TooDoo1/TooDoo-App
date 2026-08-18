import { apiUrl, normalizeImageUrl } from '@/lib/api';
import {
  getCachedCompanyDetail,
  invalidateCompanyDetailCache,
  patchCachedCompanyDetailImages,
  setCachedCompanyDetail,
} from '@/lib/company-detail-cache';

export { invalidateCompanyDetailCache };
import { isActiveOffer, resolveBusinessIdFromOrder } from '@/lib/home-offers';

export type CompanyDetailLoadResult = {
  business: any;
  orders: any[];
  images: Record<string, string>;
  counts: Record<string, { claimed: number; total: number }>;
};

function extractOrdersFromBusinessPayload(businessObj: any, json: any) {
  return (
    (Array.isArray(businessObj?.activeOrders) && businessObj.activeOrders) ||
    (Array.isArray(businessObj?.orders) && businessObj.orders) ||
    (Array.isArray(businessObj?.active_orders) && businessObj.active_orders) ||
    (Array.isArray(json?.activeOrders) && json.activeOrders) ||
    (Array.isArray(json?.orders) && json.orders) ||
    []
  );
}

async function fetchOrderById(orderId: string) {
  const orderRes = await fetch(apiUrl(`/orders/${encodeURIComponent(orderId)}`));
  const orderJson = await orderRes.json().catch(() => ({}));
  return (orderJson as any)?.order ?? (orderJson as any);
}

async function fetchBusinessById(businessId: string) {
  const res = await fetch(apiUrl(`/business/${encodeURIComponent(businessId)}`));
  const json = await res.json().catch(() => ({}));
  const businessObj = (json as any)?.business ?? (json as any);
  return {
    businessObj,
    ordersRaw: extractOrdersFromBusinessPayload(businessObj, json),
  };
}

/** Public click counter used by GET /business/popular ranking. */
export function recordBusinessProfileClick(businessId?: string) {
  const id = businessId?.trim();
  if (!id) return;
  void fetch(apiUrl(`/business/${encodeURIComponent(id)}/click`), {
    method: 'POST',
  }).catch(() => undefined);
}

export function collectOrderMeta(
  order: any,
  images: Record<string, string>,
  counts: Record<string, { claimed: number; total: number }>
) {
  const orderId = String(order?.id ?? order?._id ?? order?.orderId ?? '');
  if (!orderId) return;

  const raw =
    order?.imageUrl ??
    order?.imageAsset?.publicUrl ??
    order?.imageAsset?.url ??
    order?.image?.publicUrl ??
    order?.image?.url;
  const normalized = normalizeImageUrl(raw);
  if (normalized) images[orderId] = normalized;

  const claimed = Number(order?.claimedRedemptions ?? order?.claimedCount ?? NaN);
  const total = Number(order?.maxRedemptions ?? NaN);
  if (Number.isFinite(claimed) || Number.isFinite(total)) {
    counts[orderId] = {
      claimed: Number.isFinite(claimed) ? claimed : 0,
      total: Number.isFinite(total) ? total : 0,
    };
  }
}

function buildResult(
  businessObj: any,
  ordersRaw: any[]
): CompanyDetailLoadResult {
  const images: Record<string, string> = {};
  const counts: Record<string, { claimed: number; total: number }> = {};
  ordersRaw.forEach((order) => collectOrderMeta(order, images, counts));

  return {
    business: businessObj,
    orders: ordersRaw.filter((order) => isActiveOffer(order)),
    images,
    counts,
  };
}

export async function loadCompanyDetail(options: {
  businessId?: string;
  claimOrderId?: string;
  forceRefresh?: boolean;
}): Promise<CompanyDetailLoadResult | null> {
  let businessId = options.businessId;
  let bootstrapOrder: any = null;

  if (businessId && options.forceRefresh) {
    invalidateCompanyDetailCache(businessId);
  }

  if (businessId && !options.forceRefresh) {
    const cached = getCachedCompanyDetail(businessId);
    if (cached) {
      return {
        business: cached.business,
        orders: cached.orders,
        images: cached.images,
        counts: cached.counts,
      };
    }
  }

  if (!businessId && options.claimOrderId) {
    bootstrapOrder = await fetchOrderById(options.claimOrderId);
    businessId = resolveBusinessIdFromOrder(bootstrapOrder);
  }

  if (!businessId && !bootstrapOrder) {
    return null;
  }

  let businessObj: any = bootstrapOrder?.business ?? null;
  let ordersRaw: any[] = [];

  if (businessId) {
    const fetched = await fetchBusinessById(businessId);
    businessObj = fetched.businessObj ?? businessObj;
    ordersRaw = fetched.ordersRaw;
  }

  if (options.claimOrderId) {
    const focusId = String(options.claimOrderId);
    const hasFocus = ordersRaw.some(
      (order) => String(order?.id ?? order?._id ?? '') === focusId
    );
    if (!hasFocus) {
      if (
        !bootstrapOrder ||
        String(bootstrapOrder?.id ?? bootstrapOrder?._id ?? '') !== focusId
      ) {
        bootstrapOrder = await fetchOrderById(focusId);
      }
      if (bootstrapOrder) {
        ordersRaw = [bootstrapOrder, ...ordersRaw];
      }
    }
  }

  const result = buildResult(businessObj, ordersRaw);

  if (businessId) {
    setCachedCompanyDetail(businessId, {
      business: result.business,
      orders: result.orders,
      images: result.images,
      counts: result.counts,
    });
  }

  return result;
}

export async function enrichCompanyDetailImages(
  businessId: string | undefined,
  ordersRaw: any[],
  existingImages: Record<string, string>,
  existingCounts: Record<string, { claimed: number; total: number }>
) {
  const missingOfferIds = ordersRaw
    .map((order) => String(order?.id ?? order?._id ?? ''))
    .filter((orderId) => orderId && !existingImages[orderId])
    .slice(0, 3);

  if (missingOfferIds.length === 0) {
    return null;
  }

  const images = { ...existingImages };
  const counts = { ...existingCounts };

  await Promise.all(
    missingOfferIds.map(async (orderId) => {
      try {
        const orderObj = await fetchOrderById(orderId);
        collectOrderMeta(orderObj, images, counts);
      } catch {
        // ignore per-order failures
      }
    })
  );

  if (businessId) {
    patchCachedCompanyDetailImages(businessId, images, counts);
  }

  return { images, counts };
}
