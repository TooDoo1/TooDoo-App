import type { Router } from 'expo-router';
import { Platform } from 'react-native';

import {
  HETA_ERBJUDANDEN_PATH,
  NARA_DIG_PATH,
  SLUTAR_SNART_PATH,
} from '@/lib/stack-navigation';

export const COMPANY_DETAIL_PATH = '/company-detail' as const;

export const DETAIL_RETURN_ROUTES = {
  index: '/(tabs)/',
  favoriter: '/(tabs)/Favoriter',
  naradig: NARA_DIG_PATH,
  heta: HETA_ERBJUDANDEN_PATH,
  slutarsnart: SLUTAR_SNART_PATH,
  minadeals: '/(tabs)/MinaDeals',
} as const;

export type DetailReturnKey = keyof typeof DETAIL_RETURN_ROUTES;

export function navigateBackFromDetail(router: Router, returnTo?: string | string[]) {
  if (Platform.OS === 'web') {
    if (router.canDismiss()) {
      router.dismiss();
      return;
    }

    const key = (Array.isArray(returnTo) ? returnTo[0] : returnTo) as DetailReturnKey | undefined;
    if (key && key in DETAIL_RETURN_ROUTES) {
      router.replace(DETAIL_RETURN_ROUTES[key]);
      return;
    }
    router.replace(DETAIL_RETURN_ROUTES.index);
    return;
  }

  if (router.canGoBack()) {
    router.back();
    return;
  }

  const key = (Array.isArray(returnTo) ? returnTo[0] : returnTo) as DetailReturnKey | undefined;
  if (key && key in DETAIL_RETURN_ROUTES) {
    router.replace(DETAIL_RETURN_ROUTES[key]);
    return;
  }
  router.replace(DETAIL_RETURN_ROUTES.index);
}
