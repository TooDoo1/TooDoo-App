/** One-shot handoff: map → home search overlay. */

type PendingHomeSearch = {
  query: string;
  fromMap: boolean;
};

let pending: PendingHomeSearch | null = null;

export function requestOpenHomeSearch(
  query = '',
  options?: { fromMap?: boolean }
) {
  pending = {
    query,
    fromMap: Boolean(options?.fromMap),
  };
}

export function consumeOpenHomeSearch(): PendingHomeSearch | null {
  const next = pending;
  pending = null;
  return next;
}
