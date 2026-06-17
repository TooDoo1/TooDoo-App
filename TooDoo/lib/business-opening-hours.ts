export type OpeningHoursDayKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export type OpeningHoursSlot = {
  from?: string;
  to?: string;
};

export type BusinessOpeningHours = Partial<Record<OpeningHoursDayKey, OpeningHoursSlot>>;

export const OPENING_HOURS_DAY_ORDER: OpeningHoursDayKey[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const DAY_LABELS_SV: Record<OpeningHoursDayKey, string> = {
  monday: 'Måndag',
  tuesday: 'Tisdag',
  wednesday: 'Onsdag',
  thursday: 'Torsdag',
  friday: 'Fredag',
  saturday: 'Lördag',
  sunday: 'Söndag',
};

const JS_DAY_TO_KEY: OpeningHoursDayKey[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

function parseTimeToMinutes(value?: string): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

function isValidDayKey(value: string): value is OpeningHoursDayKey {
  return OPENING_HOURS_DAY_ORDER.includes(value as OpeningHoursDayKey);
}

export function normalizeBusinessOpeningHours(raw: unknown): BusinessOpeningHours | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const normalized: BusinessOpeningHours = {};

  for (const [key, slot] of Object.entries(raw)) {
    if (!isValidDayKey(key) || !slot || typeof slot !== 'object' || Array.isArray(slot)) {
      continue;
    }

    const from = typeof slot.from === 'string' ? slot.from.trim() : undefined;
    const to = typeof slot.to === 'string' ? slot.to : undefined;
    if (!from && !to) continue;

    normalized[key] = {
      from: from || undefined,
      to: typeof to === 'string' ? to.trim() : undefined,
    };
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

export function formatOpeningHoursRange(slot?: OpeningHoursSlot): string | null {
  const from = slot?.from?.trim();
  const to = slot?.to?.trim();
  if (from && to) return `${from} – ${to}`;
  if (from) return `från ${from}`;
  if (to) return `till ${to}`;
  return null;
}

export function getOpeningHoursDayKey(date = new Date()): OpeningHoursDayKey {
  return JS_DAY_TO_KEY[date.getDay()] ?? 'monday';
}

export function isBusinessOpenNow(
  hours: BusinessOpeningHours | null | undefined,
  date = new Date()
): boolean | null {
  if (!hours) return null;

  const dayKey = getOpeningHoursDayKey(date);
  const slot = hours[dayKey];
  const fromMinutes = parseTimeToMinutes(slot?.from);
  const toMinutes = parseTimeToMinutes(slot?.to);
  if (fromMinutes == null || toMinutes == null) return false;

  const nowMinutes = date.getHours() * 60 + date.getMinutes();

  if (fromMinutes === toMinutes) {
    return false;
  }

  if (fromMinutes < toMinutes) {
    return nowMinutes >= fromMinutes && nowMinutes < toMinutes;
  }

  return nowMinutes >= fromMinutes || nowMinutes < toMinutes;
}

export type OpeningHoursDayRow = {
  key: OpeningHoursDayKey;
  label: string;
  hoursText: string;
  isToday: boolean;
};

export function getOpeningHoursWeekRows(
  hours: BusinessOpeningHours | null | undefined,
  date = new Date()
): OpeningHoursDayRow[] {
  const todayKey = getOpeningHoursDayKey(date);

  return OPENING_HOURS_DAY_ORDER.map((key) => {
    const range = formatOpeningHoursRange(hours?.[key]);
    return {
      key,
      label: DAY_LABELS_SV[key],
      hoursText: range ?? 'Stängt',
      isToday: key === todayKey,
    };
  });
}

export function getTodayOpeningHoursText(
  hours: BusinessOpeningHours | null | undefined,
  date = new Date()
): string | null {
  const dayKey = getOpeningHoursDayKey(date);
  return formatOpeningHoursRange(hours?.[dayKey]);
}
