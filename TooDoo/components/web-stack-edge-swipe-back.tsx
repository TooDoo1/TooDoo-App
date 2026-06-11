import { useGlobalSearchParams, useRouter, useSegments } from 'expo-router';
import { useCallback, useEffect, type ReactNode } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { useTabBarMotion } from '@/context/tab-bar-motion-context';
import { useWebStackSwipe } from '@/context/web-stack-swipe-context';
import {
  DETAIL_SCREEN_MOTION_EASING,
  getStackMotionMs,
  WEB_STACK_MOTION_MS,
} from '@/lib/detail-screen-motion';
import { blurActiveElementOnWeb } from '@/lib/web-focus';
import { performWebStackBack } from '@/lib/web-stack-navigation';
import { BrandColors } from '@/lib/brand-colors';
import {
  FULL_SCREEN_STACK_SEGMENTS,
  shouldRevealTabBarOnStackSwipeBack,
  SWIPE_BACK_EDGE_FRACTION,
} from '@/lib/stack-navigation';

const SWIPE_COMPLETE_FRACTION = 0.25;
const SWIPE_PREVIEW_FRACTION = 0.4;

function isFullScreenStackSegment(segment: string) {
  return FULL_SCREEN_STACK_SEGMENTS.includes(
    segment as (typeof FULL_SCREEN_STACK_SEGMENTS)[number]
  );
}

export function WebStackEdgeSwipeBack() {
  const router = useRouter();
  const segments = useSegments();
  const params = useGlobalSearchParams<{ returnTo?: string | string[] }>();
  const { width: windowWidth } = useWindowDimensions();
  const { stackHideProgress } = useTabBarMotion();
  const { translateX } = useWebStackSwipe();

  const isOnStackScreen = segments.some(isFullScreenStackSegment);
  const topSegment = segments[segments.length - 1];
  const revealTabBarOnBack = shouldRevealTabBarOnStackSwipeBack(topSegment, params.returnTo);

  const performBack = useCallback(() => {
    const currentTop = segments[segments.length - 1];
    performWebStackBack(router, {
      returnTo: params.returnTo,
      isCompanyDetail: currentTop === 'company-detail',
    });
  }, [params.returnTo, router, segments]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !isOnStackScreen || typeof window === 'undefined') {
      translateX.value = 0;
      return;
    }

    const motionMs = getStackMotionMs();
    const edgeWidth = windowWidth * SWIPE_BACK_EDGE_FRACTION;
    let tracking = false;
    let decided = false;
    let startX = 0;
    let startY = 0;

    const resetGesture = (cancelled: boolean) => {
      tracking = false;
      decided = false;
      translateX.value = withTiming(0, {
        duration: motionMs,
        easing: DETAIL_SCREEN_MOTION_EASING,
      });
      const hideProgress = cancelled || !revealTabBarOnBack ? 1 : 0;
      stackHideProgress.value = withTiming(hideProgress, {
        duration: motionMs,
        easing: DETAIL_SCREEN_MOTION_EASING,
      });
    };

    const completeBack = () => {
      tracking = false;
      decided = false;

      if (revealTabBarOnBack) {
        stackHideProgress.value = 0;
      }

      const finishBack = () => {
        translateX.value = 0;
        blurActiveElementOnWeb();
        requestAnimationFrame(() => {
          performBack();
        });
      };

      translateX.value = withTiming(
        windowWidth,
        { duration: WEB_STACK_MOTION_MS, easing: DETAIL_SCREEN_MOTION_EASING },
        (finished) => {
          if (finished) {
            runOnJS(finishBack)();
          }
        }
      );
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (event.clientX > edgeWidth) return;

      event.preventDefault();
      tracking = true;
      decided = false;
      startX = event.clientX;
      startY = event.clientY;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!tracking) return;

      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;

      if (!decided) {
        if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
        if (Math.abs(deltaY) > Math.abs(deltaX) || deltaX <= 0) {
          tracking = false;
          return;
        }
        decided = true;
      }

      event.preventDefault();
      const clampedX = Math.max(0, Math.min(deltaX, windowWidth));
      translateX.value = clampedX;
      if (revealTabBarOnBack) {
        stackHideProgress.value = 1 - Math.min(clampedX / (windowWidth * SWIPE_PREVIEW_FRACTION), 1);
      } else {
        stackHideProgress.value = 1;
      }
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (!tracking) return;

      const deltaX = event.clientX - startX;
      const shouldGoBack = decided && deltaX > windowWidth * SWIPE_COMPLETE_FRACTION;

      if (shouldGoBack) {
        completeBack();
        return;
      }

      resetGesture(true);
    };

    window.addEventListener('pointerdown', onPointerDown, { passive: false });
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
      translateX.value = 0;
    };
  }, [
    isOnStackScreen,
    performBack,
    revealTabBarOnBack,
    stackHideProgress,
    translateX,
    windowWidth,
  ]);

  return null;
}

const STACK_SWIPE_SURFACE = BrandColors.dark.background;

function WebStackSwipeContainerWeb({ children }: { children: ReactNode }) {
  const { translateX } = useWebStackSwipe();
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          flex: 1,
          backgroundColor: STACK_SWIPE_SURFACE,
          overflow: 'hidden',
          backfaceVisibility: 'hidden',
        },
        animatedStyle,
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function WebStackSwipeContainer({ children }: { children: ReactNode }) {
  if (Platform.OS !== 'web') {
    return children;
  }

  return <WebStackSwipeContainerWeb>{children}</WebStackSwipeContainerWeb>;
}
