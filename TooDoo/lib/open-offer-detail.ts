import type { Router } from 'expo-router';

import { COMPANY_DETAIL_PATH } from '@/lib/detail-navigation';
import type { OfferCardItem } from '@/lib/home-offers';
import { isPlaceholderNavigationId } from '@/lib/home-offers';
import { schedulePrefetchImageUris } from '@/lib/image-prefetch';
import { IMAGE_DISPLAY_WIDTH, sizedImageUrl } from '@/lib/image-url';
import { loadCompanyDetail } from '@/lib/load-company-detail';

function compactParams(params: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, string] => {
      const value = entry[1];
      return value != null && value !== '';
    })
  );
}

export function openOfferDetail(
  router: Router,
  card: OfferCardItem,
  returnTo: 'index' | 'heta' | 'slutarsnart' = 'index'
) {
  const remoteImageUri =
    typeof card.image === 'object' && card.image && 'uri' in card.image && typeof card.image.uri === 'string'
      ? card.image.uri
      : '';

  const focusedOrderId = card.orderIds?.[0] ? String(card.orderIds[0]) : undefined;
  const businessId = isPlaceholderNavigationId(card.id) ? undefined : card.id;

  void loadCompanyDetail({
    businessId,
    claimOrderId: focusedOrderId,
  });

  if (remoteImageUri) {
    schedulePrefetchImageUris(
      [sizedImageUrl(remoteImageUri, IMAGE_DISPLAY_WIDTH.hero) ?? remoteImageUri],
      1
    );
  }

  router.push({
    pathname: COMPANY_DETAIL_PATH,
    params: compactParams({
      returnTo,
      mapResetNonce: String(Date.now()),
      id: businessId ?? focusedOrderId,
      claimBusinessId: businessId,
      claimOrderId: focusedOrderId,
      title: card.title,
      deal: card.deal ? '1' : '0',
      imageUri: remoteImageUri,
      Adress: card.Adress,
      latitude: card.latitude != null ? String(card.latitude) : undefined,
      longitude: card.longitude != null ? String(card.longitude) : undefined,
      Telefon: card.Telefon,
      Website: card.Website,
    }),
  });
}
