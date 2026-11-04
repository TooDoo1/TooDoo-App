import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

export type CategoryLike = {
  categoryId?: string;
  categoryIds?: string[];
  categoryName?: string;
  /** All assigned category labels when a business has more than one. */
  categoryNames?: string[];
  categoryIcon?: string;
};

/** Same red as the "Nära dig" section icon. */
export const OFFERS_CATEGORY_ACCENT = '#ff3b30';
const FALLBACK_ACCENT = '#9b5de5';

const ICON_ACCENTS: Record<string, string> = {
  restaurant: '#34c759',
  movie: '#af52de',
  'shopping-bag': '#ffd60a',
  shopping: '#ffd60a',
  'heart-pulse': '#ff2d55',
  heart: '#ff2d55',
  dumbbell: '#32ade6',
  football: '#32ade6',
  plane: '#64d2ff',
  airplane: '#64d2ff',
  users: '#0a84ff',
  people: '#0a84ff',
  sparkles: '#af52de',
  landmark: '#ff9f0a',
  'color-palette': '#ff9f0a',
};

export function getCategoryIconName(label: string): ComponentProps<typeof Ionicons>['name'] {
  const name = label.toLowerCase();
  if (name.includes('erbjud')) return 'pricetag-outline';
  if (name.includes('mat') || name.includes('food') || name.includes('restaur') || name.includes('kiosk') || name.includes('café') || name.includes('cafe') || name.includes('fika') || name.includes('pizza') || name.includes('gatukök') || name.includes('gatukok') || name.includes('bager')) return 'restaurant-outline';
  if (name.includes('event') || name.includes('evenemang')) return 'calendar-outline';
  if (name.includes('familj') || name.includes('family') || name.includes('barn')) return 'people-outline';
  if (name.includes('sport') || name.includes('träning') || name.includes('fitness')) return 'football-outline';
  if (name.includes('hälsa') || name.includes('health')) return 'heart-outline';
  if (name.includes('skön') || name.includes('beauty') || name.includes('spa')) return 'sparkles-outline';
  if (name.includes('nöje') || name.includes('entertain') || name.includes('bio')) return 'film-outline';
  if (name.includes('kläder') || name.includes('shopping') || name.includes('butik')) return 'bag-outline';
  if (name.includes('kultur') || name.includes('museum') || name.includes('teater')) return 'color-palette-outline';
  return 'grid-outline';
}

/** Canonical accents for the nine TooDoo categories. */
const CATEGORY_ACCENTS: Record<string, string> = {
  mat: '#34c759',
  nöje: '#af52de',
  noje: '#af52de',
  shopping: '#ffd60a',
  hälsa: '#ff2d55',
  halsa: '#ff2d55',
  sport: '#32ade6',
  resor: '#64d2ff',
  familj: '#0a84ff',
  skönhet: '#af52de',
  skonhet: '#af52de',
  kultur: '#ff9f0a',
};

export function getCategoryAccentColor(categoryName?: string): string {
  const name = (categoryName ?? '').trim();
  if (!name) return FALLBACK_ACCENT;
  const key = name.toLocaleLowerCase('sv-SE');
  if (key.includes('erbjud')) return OFFERS_CATEGORY_ACCENT;
  if (CATEGORY_ACCENTS[key]) return CATEGORY_ACCENTS[key];

  switch (getCategoryIconName(name)) {
    case 'restaurant-outline':
      return '#34c759';
    case 'calendar-outline':
      return '#ff3b30';
    case 'film-outline':
    case 'sparkles-outline':
      return '#af52de';
    case 'people-outline':
      return '#0a84ff';
    case 'football-outline':
      return '#32ade6';
    case 'heart-outline':
      return '#ff2d55';
    case 'bag-outline':
      return '#ffd60a';
    case 'airplane-outline':
      return '#64d2ff';
    case 'color-palette-outline':
      return '#ff9f0a';
    default:
      return FALLBACK_ACCENT;
  }
}

const nameByCategoryId = new Map<string, string>();
const accentByCategoryId = new Map<string, string>();

function accentFromIcon(icon?: string): string | undefined {
  if (!icon) return undefined;
  const key = icon.trim().toLowerCase().replace(/-outline$/, '');
  return ICON_ACCENTS[key];
}

/** Keep id → color in sync with GET /category so map pins can color without a name field. */
export function rememberCategories(raw: unknown[] | null | undefined) {
  if (!Array.isArray(raw)) return;
  for (const category of raw) {
    if (!category || typeof category !== 'object') continue;
    const rec = category as { id?: unknown; _id?: unknown; name?: unknown; icon?: unknown };
    const id = String(rec.id ?? rec._id ?? '').trim();
    const name = typeof rec.name === 'string' ? rec.name.trim() : '';
    if (!id) continue;
    if (name) {
      nameByCategoryId.set(id, name);
      accentByCategoryId.set(id, getCategoryAccentColor(name));
    }
    const fromIcon = accentFromIcon(typeof rec.icon === 'string' ? rec.icon : undefined);
    if (fromIcon && !accentByCategoryId.has(id)) {
      accentByCategoryId.set(id, fromIcon);
    }
  }
}

/** All category labels for a card — primary name, explicit names, then id → name map. */
export function getCategoryLabelsForItem(item: CategoryLike): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();

  const push = (raw?: string) => {
    const name = (raw ?? '').trim();
    if (!name) return;
    const key = name.toLocaleLowerCase('sv-SE');
    if (seen.has(key)) return;
    seen.add(key);
    labels.push(name);
  };

  if (Array.isArray(item.categoryNames)) {
    for (const name of item.categoryNames) push(name);
  }
  push(item.categoryName);

  const ids = [
    ...(Array.isArray(item.categoryIds) ? item.categoryIds : []),
    item.categoryId,
  ].filter((id): id is string => Boolean(id && String(id).trim()));

  for (const id of ids) {
    push(nameByCategoryId.get(String(id)));
  }

  return labels;
}

export function getCategoryAccentForItem(item: CategoryLike): string {
  const labels = getCategoryLabelsForItem(item);
  if (labels.length > 0) {
    const named = getCategoryAccentColor(labels[0]);
    if (named !== FALLBACK_ACCENT) return named;
  }

  const named = getCategoryAccentColor(item.categoryName);
  if (item.categoryName?.trim() && named !== FALLBACK_ACCENT) return named;

  const ids = [
    item.categoryId,
    ...(Array.isArray(item.categoryIds) ? item.categoryIds : []),
  ].filter((id): id is string => Boolean(id && String(id).trim()));

  for (const id of ids) {
    const fromId = accentByCategoryId.get(String(id));
    if (fromId) return fromId;
    const mappedName = nameByCategoryId.get(String(id));
    if (mappedName) return getCategoryAccentColor(mappedName);
  }

  const fromIcon = accentFromIcon(item.categoryIcon);
  if (fromIcon) return fromIcon;

  return named;
}

export function darkenHexColor(hex: string, amount = 0.14): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;

  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  const r = clamp(Number.parseInt(normalized.slice(0, 2), 16) * (1 - amount));
  const g = clamp(Number.parseInt(normalized.slice(2, 4), 16) * (1 - amount));
  const b = clamp(Number.parseInt(normalized.slice(4, 6), 16) * (1 - amount));

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function getOnAccentTextColor(accent: string): string {
  const hex = accent.replace('#', '');
  if (hex.length !== 6) return '#ffffff';
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#131720' : '#ffffff';
}
