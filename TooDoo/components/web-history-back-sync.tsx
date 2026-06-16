import { useGlobalSearchParams, useRouter, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { performWebStackBack, shouldIgnoreWebPopState } from '@/lib/web-stack-navigation';
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
  const segmentsRef = useRef(segments);
  const paramsRef = useRef(params);
  const trapPushedRef = useRef(false);
  segmentsRef.current = segments;
  paramsRef.current = params;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !isOnStackScreen) {
      trapPushedRef.current = false;
      return;
    }

    if (!trapPushedRef.current) {
      history.pushState({ toodooBackTrap: true }, '');
      trapPushedRef.current = true;
    }

    const onPopState = () => {
      if (shouldIgnoreWebPopState()) {
        trapPushedRef.current = false;
        history.pushState({ toodooBackTrap: true }, '');
        trapPushedRef.current = true;
        return;
      }

      const currentSegments = segmentsRef.current;
      const topSegment = currentSegments[currentSegments.length - 1];
      performWebStackBack(router, {
        returnTo: paramsRef.current.returnTo,
        isCompanyDetail: topSegment === 'company-detail',
        topSegment,
      });
      trapPushedRef.current = false;
      history.pushState({ toodooBackTrap: true }, '');
      trapPushedRef.current = true;
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      trapPushedRef.current = false;
      // Do not history.back() here — it races swipe-back dismiss and freezes Safari/PWA.
      if (history.state?.toodooBackTrap) {
        history.replaceState(null, '', window.location.href);
      }
    };
  }, [isOnStackScreen, router]);

  return null;
}
