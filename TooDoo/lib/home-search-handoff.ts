/** One-shot handoff: map → home search overlay. */

type PendingHomeSearch = {
  query: string;
};

let pending: PendingHomeSearch | null = null;

export function requestOpenHomeSearch(query = '') {
  pending = { query };
}

export function consumeOpenHomeSearch(): PendingHomeSearch | null {
  const next = pending;
  pending = null;
  return next;
}
