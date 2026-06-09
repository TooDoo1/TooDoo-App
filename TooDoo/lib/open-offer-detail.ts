import type { Router } from 'expo-router';

import { COMPANY_DETAIL_PATH } from '@/lib/detail-navigation';
import type { OfferCardItem } from '@/lib/home-offers';

function encodeListParam(
  value: string | string[] | number | number[] | Date | Date[] | undefined
) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return JSON.stringify(
      value.map((item) => (item instanceof Date ? item.toISOString() : String(item)))
    );
  }

  return value instanceof Date ? value.toISOString() : String(value);
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

  router.push({
    pathname: COMPANY_DETAIL_PATH,
    params: {
      returnTo,
      mapResetNonce: `${Date.now()}-${Math.random()}`,
      id: card.id,
      claimBusinessId: card.id,
      title: card.title,
      deal: card.deal ? '1' : '0',
      imageUri: remoteImageUri,
      Adress: card.Adress,
      latitude: card.latitude?.toString(),
      longitude: card.longitude?.toString(),
      Telefon: card.Telefon ?? '+46 42-10 00 00',
      Website: card.Website,
      kortbeskrivning: card.kortbeskrivning,
      långbeskrivning: card.långbeskrivning,
      erbjudande: encodeListParam(card.erbjudande),
      orderIds: encodeListParam(card.orderIds),
      erbjudandepris: encodeListParam(card.erbjudandepris),
      erbjudandeoriginalpris: encodeListParam(card.erbjudandeoriginalpris),
      erbjudandeclaimade: encodeListParam(card.erbjudandeclaimade),
      erbjudandemängd: encodeListParam(card.erbjudandemängd),
      erbjudandelängd: encodeListParam(card.erbjudandelängd),
    },
  });
}
