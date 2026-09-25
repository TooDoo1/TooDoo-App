import { Alert, Platform, Share } from 'react-native';

import { COMPANY_DETAIL_PATH } from '@/lib/detail-navigation';
import type { OfferCardItem } from '@/lib/home-offers';
import { isPlaceholderNavigationId } from '@/lib/home-offers';

export type ShareOfferInput = {
  businessId: string;
  orderId: string;
  businessName?: string;
  offerText?: string;
};

function compactShareText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getAppBaseUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (fromEnv) return fromEnv;

  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return undefined;
}

export function buildOfferShareUrl({ businessId, orderId }: ShareOfferInput) {
  const params = new URLSearchParams({
    claimBusinessId: businessId,
    claimOrderId: orderId,
  });
  const path = `${COMPANY_DETAIL_PATH}?${params.toString()}`;
  const base = getAppBaseUrl();
  if (!base) {
    return path;
  }
  return `${base}${path}`;
}

function isAbsoluteShareUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

function buildShareMessage(input: ShareOfferInput, url: string) {
  const businessName = compactShareText(input.businessName);
  const offerText = compactShareText(input.offerText);

  if (businessName && offerText) {
    return `Kolla in "${offerText}" hos ${businessName} på TooDoo!\n\n${url}`;
  }

  if (businessName) {
    return `Kolla in erbjudandet hos ${businessName} på TooDoo!\n\n${url}`;
  }

  return `Kolla in det här erbjudandet på TooDoo!\n\n${url}`;
}

async function copyShareUrl(url: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    Alert.alert('Länk kopierad', 'Erbjudandelänken har kopierats till urklipp.');
    return;
  }

  Alert.alert('Dela erbjudande', url);
}

export async function shareOffer(input: ShareOfferInput) {
  const businessId = compactShareText(input.businessId);
  const orderId = compactShareText(input.orderId);
  if (!businessId || !orderId || isPlaceholderNavigationId(businessId) || isPlaceholderNavigationId(orderId)) {
    Alert.alert('Kunde inte dela', 'Erbjudandet saknar information som behövs för att skapa en länk.');
    return;
  }

  const url = buildOfferShareUrl({ ...input, businessId, orderId });
  if (!isAbsoluteShareUrl(url)) {
    Alert.alert(
      'Kunde inte dela',
      'Sätt EXPO_PUBLIC_APP_URL till din webbadress (t.ex. Vercel-URL:en) för att kunna dela erbjudandelänkar från appen.'
    );
    return;
  }
  const message = buildShareMessage(input, url);
  const title = compactShareText(input.offerText) ?? compactShareText(input.businessName) ?? 'Erbjudande på TooDoo';

  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text: message, url });
      } catch (error) {
        if ((error as { name?: string }).name !== 'AbortError') {
          await copyShareUrl(url);
        }
      }
      return;
    }

    await copyShareUrl(url);
    return;
  }

  try {
    await Share.share(
      Platform.OS === 'ios'
        ? { message, url, title }
        : { message, title }
    );
  } catch {
    // User dismissed the native share sheet.
  }
}

export function shareOfferFromCard(card: OfferCardItem) {
  const businessId = isPlaceholderNavigationId(card.id) ? undefined : card.id;
  const orderId = card.orderIds?.[0] ? String(card.orderIds[0]) : undefined;
  const offerText = Array.isArray(card.erbjudande) ? card.erbjudande[0] : card.erbjudande;

  return shareOffer({
    businessId: businessId ?? '',
    orderId: orderId ?? '',
    businessName: card.title,
    offerText: typeof offerText === 'string' ? offerText : undefined,
  });
}

export type ShareBusinessInput = {
  businessId: string;
  businessName?: string;
};

export function buildBusinessShareUrl({ businessId }: ShareBusinessInput) {
  const params = new URLSearchParams({
    id: businessId,
    claimBusinessId: businessId,
  });
  const path = `${COMPANY_DETAIL_PATH}?${params.toString()}`;
  const base = getAppBaseUrl();
  if (!base) {
    return path;
  }
  return `${base}${path}`;
}

function buildBusinessShareMessage(input: ShareBusinessInput, url: string) {
  const businessName = compactShareText(input.businessName);
  if (businessName) {
    return `Kolla in ${businessName} på TooDoo!\n\n${url}`;
  }
  return `Kolla in det här företaget på TooDoo!\n\n${url}`;
}

async function copyBusinessShareUrl(url: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    Alert.alert('Länk kopierad', 'Företagslänken har kopierats till urklipp.');
    return;
  }

  Alert.alert('Dela företag', url);
}

export async function shareBusiness(input: ShareBusinessInput) {
  const businessId = compactShareText(input.businessId);
  if (!businessId || isPlaceholderNavigationId(businessId)) {
    Alert.alert('Kunde inte dela', 'Företaget saknar information som behövs för att skapa en länk.');
    return;
  }

  const url = buildBusinessShareUrl({ ...input, businessId });
  if (!isAbsoluteShareUrl(url)) {
    Alert.alert(
      'Kunde inte dela',
      'Sätt EXPO_PUBLIC_APP_URL till din webbadress (t.ex. Vercel-URL:en) för att kunna dela företagslänkar från appen.'
    );
    return;
  }

  const message = buildBusinessShareMessage(input, url);
  const title = compactShareText(input.businessName) ?? 'Företag på TooDoo';

  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text: message, url });
      } catch (error) {
        if ((error as { name?: string }).name !== 'AbortError') {
          await copyBusinessShareUrl(url);
        }
      }
      return;
    }

    await copyBusinessShareUrl(url);
    return;
  }

  try {
    await Share.share(
      Platform.OS === 'ios'
        ? { message, url, title }
        : { message, title }
    );
  } catch {
    // User dismissed the native share sheet.
  }
}

export type ShareEventInput = {
  title: string;
  subtitle?: string;
};

function buildEventShareMessage(input: ShareEventInput) {
  const title = compactShareText(input.title) ?? 'Evenemang';
  const subtitle = compactShareText(input.subtitle);
  if (subtitle) {
    return `Kolla in "${title}" (${subtitle}) på TooDoo!`;
  }
  return `Kolla in "${title}" på TooDoo!`;
}

export async function shareEvent(input: ShareEventInput) {
  const message = buildEventShareMessage(input);
  const title = compactShareText(input.title) ?? 'Evenemang på TooDoo';

  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text: message });
      } catch (error) {
        if ((error as { name?: string }).name !== 'AbortError') {
          Alert.alert('Dela evenemang', message);
        }
      }
      return;
    }

    Alert.alert('Dela evenemang', message);
    return;
  }

  try {
    await Share.share(Platform.OS === 'ios' ? { message, title } : { message, title });
  } catch {
    // User dismissed the native share sheet.
  }
}
