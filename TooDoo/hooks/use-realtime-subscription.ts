import { useEffect, useRef } from 'react';
import { useRealtime } from '@/context/realtime-context';
import type { RealtimeEvent } from '@/lib/realtime';

type RealtimeSubscriptionOptions = {
  enabled?: boolean;
  filter?: (event: RealtimeEvent) => boolean;
};

export function useRealtimeSubscription(
  handler: (event: RealtimeEvent) => void,
  options?: RealtimeSubscriptionOptions
) {
  const { subscribe } = useRealtime();
  const handlerRef = useRef(handler);
  const filterRef = useRef(options?.filter);
  handlerRef.current = handler;
  filterRef.current = options?.filter;
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;

    return subscribe((event) => {
      const filter = filterRef.current;
      if (filter && !filter(event)) return;
      handlerRef.current(event);
    });
  }, [enabled, subscribe]);
}
