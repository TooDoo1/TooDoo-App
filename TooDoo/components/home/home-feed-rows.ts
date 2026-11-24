/**
 * Row model for the virtualized Upptäck feed.
 * Each row is one section so FlashList can unmount below-fold rails.
 */

export type HomeFeedSpotlightRow = {
  key: string;
  kind: 'spotlight';
  id: string;
  label: string;
  scrollKey: string;
};

export type HomeFeedRow =
  | { key: string; kind: 'search-header' }
  | { key: string; kind: 'search-too-short' }
  | { key: string; kind: 'search-loading' }
  | { key: string; kind: 'search-carousel' }
  | { key: string; kind: 'search-hot' }
  | { key: string; kind: 'search-near' }
  | { key: string; kind: 'search-more' }
  | { key: string; kind: 'recommended' }
  | { key: string; kind: 'category'; id: string; label: string }
  | { key: string; kind: 'popular' }
  | { key: string; kind: 'events' }
  | { key: string; kind: 'near' }
  | { key: string; kind: 'recent' }
  | { key: string; kind: 'lunch' }
  | { key: string; kind: 'weekend' }
  | HomeFeedSpotlightRow
  | { key: string; kind: 'after-shopping'; id: string; label: string; scrollKey: string }
  | { key: string; kind: 'explore' };

/** Rough body heights (incl. title + margin) for sticky Utforska anchor before layout. */
export const HOME_FEED_ROW_ESTIMATE: Record<HomeFeedRow['kind'], number> = {
  'search-header': 40,
  'search-too-short': 48,
  'search-loading': 80,
  'search-carousel': 240,
  'search-hot': 320,
  'search-near': 240,
  'search-more': 520,
  recommended: 250,
  category: 240,
  popular: 340,
  events: 210,
  near: 230,
  recent: 190,
  lunch: 230,
  weekend: 230,
  spotlight: 230,
  'after-shopping': 230,
  explore: 520,
};

export function estimateExploreBodyY(rows: readonly HomeFeedRow[]): number {
  let y = 0;
  for (const row of rows) {
    if (row.kind === 'explore') return y;
    y += HOME_FEED_ROW_ESTIMATE[row.kind];
  }
  return y;
}
