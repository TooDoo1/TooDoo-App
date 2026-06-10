import type { Router } from 'expo-router';
import { Platform } from 'react-native';

import { navigateBackFromDetail } from '@/lib/detail-navigation';

/** Pop stack screens on web without using browser history (avoids full page reloads). */
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

  if (router.canGoBack()) {
    router.back();
    return;
  }

  if (options?.isCompanyDetail) {
    navigateBackFromDetail(router, options.returnTo);
  }
}
