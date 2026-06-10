import type { Router } from 'expo-router';
import { Platform } from 'react-native';

import {
  DETAIL_RETURN_ROUTES,
  type DetailReturnKey,
  navigateBackFromDetail,
} from '@/lib/detail-navigation';

function webReplaceFromDetail(router: Router, returnTo?: string | string[]) {
  const key = (Array.isArray(returnTo) ? returnTo[0] : returnTo) as DetailReturnKey | undefined;
  const route =
    key && key in DETAIL_RETURN_ROUTES ? DETAIL_RETURN_ROUTES[key] : DETAIL_RETURN_ROUTES.index;
  router.replace(route);
}

/** Pop stack screens on web without browser history (router.back reloads the page). */
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

  if (router.canDismiss()) {
    router.dismiss();
    return;
  }

  if (options?.isCompanyDetail) {
    webReplaceFromDetail(router, options.returnTo);
    return;
  }

  router.replace(DETAIL_RETURN_ROUTES.index);
}
