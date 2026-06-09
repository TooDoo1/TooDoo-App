import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

export type CategoryLike = {
  categoryId?: string;
  categoryName?: string;
};

export function getCategoryIconName(label: string): ComponentProps<typeof Ionicons>['name'] {
  const name = label.toLowerCase();
  if (name.includes('erbjud')) return 'pricetag-outline';
  if (name.includes('mat') || name.includes('food') || name.includes('restaur')) return 'restaurant-outline';
  if (name.includes('event') || name.includes('evenemang')) return 'calendar-outline';
  if (name.includes('familj') || name.includes('family') || name.includes('barn')) return 'people-outline';
  if (name.includes('sport') || name.includes('träning') || name.includes('fitness')) return 'football-outline';
  if (name.includes('hälsa') || name.includes('health')) return 'heart-outline';
  if (name.includes('skön') || name.includes('beauty') || name.includes('spa')) return 'sparkles-outline';
  if (name.includes('nöje') || name.includes('entertain') || name.includes('bio')) return 'film-outline';
  if (name.includes('kläder') || name.includes('shopping') || name.includes('butik')) return 'bag-outline';
  if (name.includes('resa') || name.includes('travel')) return 'airplane-outline';
  return 'grid-outline';
}

export function getCategoryAccentColor(categoryName?: string): string {
  const name = (categoryName ?? '').trim();
  if (!name) return '#9b5de5';
  if (name.toLowerCase().includes('erbjud')) return '#ff7a00';

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
    default:
      return '#9b5de5';
  }
}

export function getCategoryAccentForItem(item: CategoryLike): string {
  return getCategoryAccentColor(item.categoryName);
}
