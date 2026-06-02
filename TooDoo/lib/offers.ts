export function isActiveOffer(order: any, nowMs: number = Date.now()): boolean {
  if (order?.isActive === false) return false;
  const status = String(order?.status ?? '').toUpperCase();
  if (status === 'INACTIVE' || status === 'EXPIRED' || status === 'CANCELLED') return false;

  const max = Number(order?.maxRedemptions ?? 0);
  const claimed = Number(order?.claimedRedemptions ?? order?.claimedCount ?? 0);
  if (max > 0 && claimed >= max) return false;

  const fromMs = order?.orderTimeFrom ? Date.parse(order.orderTimeFrom) : NaN;
  if (!Number.isNaN(fromMs) && fromMs > nowMs) return false;

  const toMs = order?.orderTimeTo ? Date.parse(order.orderTimeTo) : NaN;
  if (!Number.isNaN(toMs) && toMs < nowMs) return false;

  return true;
}

export function parseOrdersList(json: unknown): any[] {
  if (Array.isArray(json)) return json;
  const obj = json as Record<string, unknown>;
  if (Array.isArray(obj?.orders)) return obj.orders;
  if (Array.isArray(obj?.data)) return obj.data;
  return [];
}

export function getOrderId(order: any): string | null {
  const id = order?.id ?? order?._id;
  return id ? String(id) : null;
}

export function getOrderBusinessId(order: any): string | null {
  const raw = order?.businessId ?? order?.business?.id ?? order?.business?._id;
  return raw ? String(raw) : null;
}
