import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

import { fetchCategoriesCatalog } from '@/lib/catalog-cache';
import { getCategoryIconName } from '@/lib/category-colors';
import { getHomeScreenSnapshot } from '@/lib/home-list-cache';

export const ALL_CATEGORIES_ID = 'all';

export type CategoryFilterItem = {
  id: string;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
};

function parseCatalogCategories(raw: unknown): Array<{ id: string; label: string }> {
  const list = Array.isArray(raw) ? raw : [];
  const items: Array<{ id: string; label: string }> = [];
  const seen = new Set<string>();

  list.forEach((category, index) => {
    const id = String(
      (category as { id?: string; _id?: string })?.id ??
        (category as { _id?: string })?._id ??
        `category-${index}`
    );
    const label =
      typeof (category as { name?: string })?.name === 'string'
        ? (category as { name: string }).name.trim()
        : '';
    if (!id || !label || seen.has(id)) return;
    seen.add(id);
    items.push({ id, label });
  });

  return items;
}

export function cachedCategoryFilters(): Array<{ id: string; label: string }> {
  return (getHomeScreenSnapshot()?.categoryFilters ?? []).filter(
    (item) => item.id && item.label
  );
}

export function buildQuickCategoryChips(
  categories: Array<{ id: string; label: string }>
): CategoryFilterItem[] {
  const familj = categories.find((cat) => {
    const label = cat.label.trim().toLowerCase();
    return label.includes('familj') || label.includes('family') || label.includes('barn');
  });
  const rest = categories.filter((cat) => cat !== familj);
  return [
    { id: ALL_CATEGORIES_ID, label: 'Alla' },
    ...(familj ? [familj] : []),
    ...rest,
  ].map((cat) => ({ ...cat, icon: getCategoryIconName(cat.label) }));
}

export async function loadCategoryFilterChips(): Promise<CategoryFilterItem[]> {
  const raw = await fetchCategoriesCatalog().catch(() => []);
  const parsed = parseCatalogCategories(raw);
  return buildQuickCategoryChips(parsed.length > 0 ? parsed : cachedCategoryFilters());
}
