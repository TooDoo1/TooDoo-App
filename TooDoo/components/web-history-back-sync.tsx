import { useGlobalSearchParams, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { performWebStackBack } from '@/lib/web-stack-navigation';
import { FULL_SCREEN_STACK_SEGMENTS } from '@/lib/stack-navigation';

function isFullScreenStackSegment(segment: string) {
  return FULL_SCREEN_STACK_SEGMENTS.includes(
    segment as (typeof FULL_SCREEN_STACK_SEGMENTS)[number]
  );
}

/** Intercept Safari edge-swipe / browser back so it dismisses the stack instead of reloading. */
export function WebHistoryBackSync() {
  const router = useRouter();
  const segments = useSegments();
  const params = useGlobalSearchParams<{ returnTo?: string | string[] }>();
  const isOnStackScreen = segments.some(isFullScreenStackSegment);
  const topSegment = segments[segments.length - 1];

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !isOnStackScreen) {
      return;
    }

    history.pushState({ toodooBackTrap: true }, '');

    const onPopState = () => {
      performWebStackBack(router, {
        returnTo: params.returnTo,
        isCompanyDetail: topSegment === 'company-detail',
      });
      history.pushState({ toodooBackTrap: true }, '');
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      if (history.state?.toodooBackTrap) {
        history.back();
      }
    };
  }, [isOnStackScreen, params.returnTo, router, topSegment]);

  return null;
}
