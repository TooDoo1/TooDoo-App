import { useEffect, useMemo, useState } from 'react';

export const SEE_ALL_PAGE_SIZE = 20;

export function getTotalPages(itemCount: number, pageSize = SEE_ALL_PAGE_SIZE) {
  return Math.max(1, Math.ceil(itemCount / pageSize));
}

export function paginateItems<T>(items: T[], page: number, pageSize = SEE_ALL_PAGE_SIZE): T[] {
  const totalPages = getTotalPages(items.length, pageSize);
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const start = safePage * pageSize;
  return items.slice(start, start + pageSize);
}

export function usePaginatedList<T>(items: T[], resetKey?: string | number) {
  const [page, setPage] = useState(0);

  const totalPages = useMemo(() => getTotalPages(items.length), [items.length]);
  const safePage = Math.min(page, totalPages - 1);

  const pageItems = useMemo(
    () => paginateItems(items, safePage),
    [items, safePage]
  );

  useEffect(() => {
    setPage(0);
  }, [resetKey, items.length]);

  useEffect(() => {
    if (page > totalPages - 1) {
      setPage(Math.max(0, totalPages - 1));
    }
  }, [page, totalPages]);

  return {
    pageItems,
    page: safePage,
    totalPages,
    totalCount: items.length,
    canGoPrevious: safePage > 0,
    canGoNext: safePage < totalPages - 1,
    goToPrevious: () => setPage((current) => Math.max(0, current - 1)),
    goToNext: () => setPage((current) => Math.min(totalPages - 1, current + 1)),
  };
}
