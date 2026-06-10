import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { Platform } from 'react-native';
import { withTiming } from 'react-native-reanimated';

import { useTabBarMotion } from '@/context/tab-bar-motion-context';
import {
  DETAIL_SCREEN_MOTION_EASING,
  getStackMotionMs,
} from '@/lib/detail-screen-motion';

/** Web + Android: timed hide/show — no native stack transition context required. */
export function StackScreenTabBarSync() {
  const { stackHideProgress } = useTabBarMotion();

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'web') {
        stackHideProgress.value = 1;
        return;
      }
      stackHideProgress.value = withTiming(1, {
        duration: getStackMotionMs(),
        easing: DETAIL_SCREEN_MOTION_EASING,
      });
    }, [stackHideProgress])
  );

  return null;
}
