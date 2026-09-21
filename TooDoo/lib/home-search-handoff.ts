/** One-shot handoff: map ↔ home search overlay. */

type PendingHomeSearch = {
  query: string;
  /** Reopen search already at rest (no fly-from-home morph). */
  fromMap: boolean;
  /** After opening at rest, morph the search bar back to its home position. */
  dismissAfterOpen: boolean;
};

let pending: PendingHomeSearch | null = null;

export function requestOpenHomeSearch(
  query = '',
  options?: { fromMap?: boolean; dismissAfterOpen?: boolean }
) {
  pending = {
    query,
    fromMap: Boolean(options?.fromMap),
    dismissAfterOpen: Boolean(options?.dismissAfterOpen),
  };
}

export function consumeOpenHomeSearch(): PendingHomeSearch | null {
  const next = pending;
  pending = null;
  return next;
}
