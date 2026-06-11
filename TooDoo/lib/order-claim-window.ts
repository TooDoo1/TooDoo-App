const STOCKHOLM_TZ = 'Europe/Stockholm';

function parseHHmm(value: string): number | null {
  const trimmed = value.trim();
  const match =
    /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(trimmed) ??
    /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Parse validFrom/validTo — HH:mm strings or Prisma time-of-day ISO (1970-01-01T14:30:00.000Z). */
export function parseOrderDailyTime(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  const hhmm = parseHHmm(value);
  if (hhmm != null) return hhmm;

  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;

  const date = new Date(ms);
  if (date.getUTCFullYear() === 1970) {
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }

  return null;
}

export function getStockholmMinutesOfDay(nowMs: number = Date.now()): number {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: STOCKHOLM_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(nowMs));

  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

export function formatHHmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Calendar window when the offer is published (orderTimeFrom → orderTimeTo). */
export function isWithinOrderPublishWindow(order: any, nowMs: number = Date.now()): boolean {
  const fromMs = order?.orderTimeFrom ? Date.parse(order.orderTimeFrom) : NaN;
  if (Number.isFinite(fromMs) && nowMs < fromMs) return false;

  const toMs = order?.orderTimeTo ? Date.parse(order.orderTimeTo) : NaN;
  if (Number.isFinite(toMs) && nowMs > toMs) return false;

  return true;
}

/** Daily claim/redemption window in Europe/Stockholm (validFrom/validTo as HH:mm or API time ISO). */
export function isWithinDailyClaimWindow(order: any, nowMs: number = Date.now()): boolean {
  const fromMin = parseOrderDailyTime(order?.validFrom);
  const toMin = parseOrderDailyTime(order?.validTo);

  if (fromMin == null && toMin == null) return true;

  const nowMin = getStockholmMinutesOfDay(nowMs);

  if (fromMin != null && toMin != null) {
    if (fromMin <= toMin) {
      return nowMin >= fromMin && nowMin <= toMin;
    }
    return nowMin >= fromMin || nowMin <= toMin;
  }

  if (fromMin != null) return nowMin >= fromMin;
  if (toMin != null) return nowMin <= toMin;
  return true;
}

export function getOrderPublishEndMs(order: any): number | null {
  const toMs = order?.orderTimeTo ? Date.parse(order.orderTimeTo) : NaN;
  return Number.isFinite(toMs) ? toMs : null;
}

export function getOrderNotClaimableReason(order: any, nowMs: number = Date.now()): string | null {
  if (!order) {
    return 'Ordern går inte att claima just nu.';
  }

  if (order?.isActive === false) {
    return 'Ordern är inaktiv.';
  }

  if (!isWithinOrderPublishWindow(order, nowMs)) {
    const fromMs = order?.orderTimeFrom ? Date.parse(order.orderTimeFrom) : NaN;
    const toMs = order?.orderTimeTo ? Date.parse(order.orderTimeTo) : NaN;
    if (Number.isFinite(fromMs) && nowMs < fromMs) {
      return 'Erbjudandet har inte startat ännu.';
    }
    if (Number.isFinite(toMs) && nowMs > toMs) {
      return 'Erbjudandet har gått ut.';
    }
    return 'Erbjudandet är inte aktivt just nu.';
  }

  if (!isWithinDailyClaimWindow(order, nowMs)) {
    const fromMin = parseOrderDailyTime(order?.validFrom);
    const toMin = parseOrderDailyTime(order?.validTo);

    if (fromMin != null && toMin != null) {
      return `Erbjudandet kan claimas mellan ${formatHHmm(fromMin)} och ${formatHHmm(toMin)} (svensk tid).`;
    }
    if (fromMin != null) {
      return `Erbjudandet kan claimas från ${formatHHmm(fromMin)} (svensk tid).`;
    }
    if (toMin != null) {
      return `Erbjudandet kan claimas till ${formatHHmm(toMin)} (svensk tid).`;
    }
    return 'Erbjudandet kan inte claimas just nu (utanför dagens tidsfönster).';
  }

  const maxRedemptions = Number(order?.maxRedemptions ?? 0);
  const claimedCount = Number(order?.claimedRedemptions ?? order?.claimedCount ?? 0);
  if (maxRedemptions > 0 && Number.isFinite(claimedCount) && claimedCount >= maxRedemptions) {
    return 'Erbjudandet är fullclaimat (max antal uppnått).';
  }

  return null;
}
