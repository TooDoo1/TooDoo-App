import { getOrderNotClaimableReason } from '@/lib/order-claim-window';

export type ClaimApiPayload = {
  ok?: boolean;
  reason?: string;
  error?: string | { message?: string };
  message?: string;
  qrCode?: string | { code?: string; id?: string };
  code?: string;
  claim?: {
    qrCode?: string | { code?: string };
    code?: string;
  };
};

export function isPlaceholderOrderId(orderId?: string | null): boolean {
  if (!orderId) return true;
  return /^order-\d+$/.test(orderId);
}

export function extractOrderIdFromClaim(claim: any): string | undefined {
  const qrCodeObject = typeof claim?.qrCode === 'object' ? claim.qrCode : undefined;
  const embeddedOrder =
    claim?.order ??
    (typeof claim?.orderId === 'object' ? claim.orderId : undefined) ??
    qrCodeObject?.order ??
    (typeof qrCodeObject?.orderId === 'object' ? qrCodeObject.orderId : undefined);

  const orderId =
    typeof claim?.orderId === 'string'
      ? claim.orderId
      : embeddedOrder?.id ??
        embeddedOrder?._id ??
        (typeof qrCodeObject?.orderId === 'string' ? qrCodeObject.orderId : undefined);

  return orderId ? String(orderId) : undefined;
}

function parseClaimsList(payload: unknown): any[] {
  return Array.isArray(payload)
    ? payload
    : Array.isArray((payload as any)?.claims)
      ? (payload as any).claims
      : Array.isArray((payload as any)?.data)
        ? (payload as any).data
        : Array.isArray((payload as any)?.data?.claims)
          ? (payload as any).data.claims
          : [];
}

export function extractClaimCountByOrderId(payload: unknown): Map<string, number> {
  const counts = new Map<string, number>();

  parseClaimsList(payload).forEach((claim) => {
    const orderId = extractOrderIdFromClaim(claim);
    if (!orderId) return;
    counts.set(orderId, (counts.get(orderId) ?? 0) + 1);
  });

  return counts;
}

export function extractClaimedOrderIds(payload: unknown): Set<string> {
  return new Set(extractClaimCountByOrderId(payload).keys());
}

export function getOrderPerPersonLimit(order: unknown): number | null {
  const raw = (order as any)?.perPersonRedemptions;
  if (raw === null || raw === undefined || raw === '') {
    return 1;
  }
  const limit = Number(raw);
  if (!Number.isFinite(limit)) return 1;
  if (limit <= 0) return null;
  return limit;
}

export function hasReachedPerPersonClaimLimit(order: unknown, userClaimCount: number): boolean {
  const limit = getOrderPerPersonLimit(order);
  if (limit == null) return false;
  return userClaimCount >= limit;
}

export function extractClaimQrCode(payload: ClaimApiPayload | null | undefined): string | undefined {
  if (!payload) return undefined;

  const qr = payload.qrCode;
  if (typeof qr === 'string' && qr.trim()) return qr.trim();
  if (qr && typeof qr === 'object' && typeof qr.code === 'string' && qr.code.trim()) {
    return qr.code.trim();
  }

  if (typeof payload.code === 'string' && payload.code.trim()) return payload.code.trim();

  const claimQr = payload.claim?.qrCode;
  if (typeof claimQr === 'string' && claimQr.trim()) return claimQr.trim();
  if (claimQr && typeof claimQr === 'object' && typeof claimQr.code === 'string' && claimQr.code.trim()) {
    return claimQr.code.trim();
  }

  if (typeof payload.claim?.code === 'string' && payload.claim.code.trim()) {
    return payload.claim.code.trim();
  }

  return undefined;
}

export function isClaimFailureReason(reason: string): boolean {
  const normalized = reason.toUpperCase();
  return (
    normalized === 'ORDER_NOT_CLAIMABLE' ||
    normalized === 'MAX_REDEMPTIONS_REACHED' ||
    normalized.includes('PER_PERSON') ||
    normalized.includes('ALREADY') ||
    normalized.includes('DUPLICATE')
  );
}

export function isClaimApiSuccess(response: Response, payload: ClaimApiPayload): boolean {
  if (!response.ok) return false;
  if (payload.ok === false) return false;
  if (isClaimFailureReason(String(payload.reason ?? ''))) return false;
  return true;
}

export function isDuplicateClaimReason(payload: ClaimApiPayload, message = ''): boolean {
  const reason = String(payload.reason ?? '').toUpperCase();
  const normalized = message.toLowerCase();

  if (reason.includes('ALREADY') || reason.includes('DUPLICATE') || reason.includes('PER_PERSON')) {
    return true;
  }

  return (
    normalized.includes('already claimed') ||
    normalized.includes('already claim') ||
    normalized.includes('already exists') ||
    normalized.includes('redan claim') ||
    normalized.includes('redan registrerad')
  );
}

export function getClaimFailureMessage(
  payload: ClaimApiPayload,
  status: number,
  order?: unknown
): string {
  const reason = String(payload.reason ?? '').toUpperCase();

  if (reason === 'ORDER_NOT_CLAIMABLE') {
    return getOrderNotClaimableReason(order) ?? 'Erbjudandet går inte att claima just nu.';
  }

  if (reason === 'MAX_REDEMPTIONS_REACHED') {
    return 'Erbjudandet är fullclaimat (max antal uppnått).';
  }

  if (reason.includes('PER_PERSON') || reason.includes('ALREADY')) {
    return 'Du har redan claimat det här erbjudandet.';
  }

  const direct =
    payload.message ??
    (typeof payload.error === 'string' ? payload.error : payload.error?.message);

  if (typeof direct === 'string' && direct.trim()) {
    return direct.trim();
  }

  if (status === 401 || status === 403) {
    return 'Logga in igen för att claima erbjudanden.';
  }

  return `Kunde inte claima erbjudandet (${status})`;
}

export async function parseClaimResponse(response: Response): Promise<{
  payload: ClaimApiPayload;
  responseText: string;
}> {
  const responseText = await response.text();
  let payload: ClaimApiPayload = {};

  if (responseText) {
    try {
      payload = JSON.parse(responseText) as ClaimApiPayload;
    } catch {
      payload = { message: responseText };
    }
  }

  return { payload, responseText };
}
