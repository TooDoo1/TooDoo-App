import type { Router } from 'expo-router';

import type { BusinessEventItem } from '@/lib/business-events';
import { COMPANY_DETAIL_PATH } from '@/lib/detail-navigation';
import { loadCompanyDetail } from '@/lib/load-company-detail';

function compactParams(params: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, string] => {
      const value = entry[1];
      return value != null && value !== '';
    })
  );
}

export function openEventDetail(
  router: Router,
  event: BusinessEventItem,
  returnTo: 'index' | 'evenemang' = 'index'
) {
  const remoteImageUri =
    event.image &&
    typeof event.image === 'object' &&
    'uri' in event.image &&
    typeof event.image.uri === 'string'
      ? event.image.uri
      : '';

  void loadCompanyDetail({ businessId: event.businessId });

  router.push({
    pathname: COMPANY_DETAIL_PATH,
    params: compactParams({
      returnTo,
      mapResetNonce: String(Date.now()),
      id: event.businessId,
      claimBusinessId: event.businessId,
      claimEventId: event.id,
      title: event.businessName,
      deal: '0',
      imageUri: remoteImageUri,
      Adress: event.businessAddress,
    }),
  });
}
