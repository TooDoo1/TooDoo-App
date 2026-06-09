import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { withTiming } from 'react-native-reanimated';

import { useTabBarMotion } from '@/context/tab-bar-motion-context';
import { DETAIL_SCREEN_MOTION_EASING, DETAIL_SCREEN_MOTION_MS } from '@/lib/detail-screen-motion';

/** Web + Android: timed hide/show — no native stack transition context required. */
export function StackScreenTabBarSync() {
  const { stackHideProgress } = useTabBarMotion();

  useFocusEffect(
    useCallback(() => {
      stackHideProgress.value = withTiming(1, {
        duration: DETAIL_SCREEN_MOTION_MS,
        easing: DETAIL_SCREEN_MOTION_EASING,
      });
    }, [stackHideProgress])
  );

  return null;
}
