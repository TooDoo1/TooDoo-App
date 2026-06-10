import type { Router } from 'expo-router';
import { Platform } from 'react-native';

import {
  DETAIL_RETURN_ROUTES,
  type DetailReturnKey,
  navigateBackFromDetail,
} from '@/lib/detail-navigation';
import { blurActiveElementOnWeb } from '@/lib/web-focus';

function resolveDetailReturnRoute(returnTo?: string | string[]) {
  const key = (Array.isArray(returnTo) ? returnTo[0] : returnTo) as DetailReturnKey | undefined;
  if (key && key in DETAIL_RETURN_ROUTES) {
    return DETAIL_RETURN_ROUTES[key];
  }
  return DETAIL_RETURN_ROUTES.index;
}

/** Pop stack screens on web without replace (keeps tabs mounted in the background). */
export function performWebStackBack(
  router: Router,
  options?: { returnTo?: string | string[]; isCompanyDetail?: boolean }
) {
  if (Platform.OS !== 'web') {
    if (options?.isCompanyDetail) {
      navigateBackFromDetail(router, options.returnTo);
      return;
    }
    if (router.canGoBack()) {
      router.back();
    }
    return;
  }

  blurActiveElementOnWeb();

  if (options?.isCompanyDetail) {
    router.dismissTo(resolveDetailReturnRoute(options.returnTo));
    return;
  }

  router.dismiss();
}
