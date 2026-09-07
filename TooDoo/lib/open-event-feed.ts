import type { Router } from 'expo-router';

import type { EventFeedItem } from '@/lib/events-feed';
import { openEventDetail } from '@/lib/open-event-detail';

export function openEventFeedItem(
  router: Router,
  event: EventFeedItem,
  returnTo: 'index' | 'evenemang' = 'index'
) {
  if (event.source === 'business' && event.businessEvent) {
    openEventDetail(router, event.businessEvent, returnTo);
    return;
  }

  const id = event.municipioEvent?.id;
  if (!id) return;

  router.push({
    pathname: '/municipio-event-detail',
    params: {
      id,
      returnTo,
    },
  });
}
