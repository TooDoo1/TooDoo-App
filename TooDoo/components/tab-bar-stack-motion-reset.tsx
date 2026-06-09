import { useSegments } from 'expo-router';
import { useEffect } from 'react';
import { withTiming } from 'react-native-reanimated';

import { useTabBarMotion } from '@/context/tab-bar-motion-context';
import { DETAIL_SCREEN_MOTION_EASING, DETAIL_SCREEN_MOTION_MS } from '@/lib/detail-screen-motion';
import { FULL_SCREEN_STACK_SEGMENTS } from '@/lib/stack-navigation';

export function TabBarStackMotionReset() {
  const { stackHideProgress } = useTabBarMotion();
  const segments = useSegments();
  const isOnFullScreenStack = segments.some((segment) =>
    FULL_SCREEN_STACK_SEGMENTS.includes(segment as (typeof FULL_SCREEN_STACK_SEGMENTS)[number])
  );

  useEffect(() => {
    if (!isOnFullScreenStack) {
      stackHideProgress.value = withTiming(0, {
        duration: DETAIL_SCREEN_MOTION_MS,
        easing: DETAIL_SCREEN_MOTION_EASING,
      });
    }
  }, [isOnFullScreenStack, stackHideProgress]);

  return null;
}
