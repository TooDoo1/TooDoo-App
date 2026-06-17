import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { Platform } from 'react-native';
import { withTiming } from 'react-native-reanimated';

import { useTabBarMotion } from '@/context/tab-bar-motion-context';
import {
  DETAIL_SCREEN_MOTION_EASING,
  getStackMotionMs,
} from '@/lib/detail-screen-motion';

/** Web + native: hide tab bar on stack detail screens, restore when leaving. */
export function StackScreenTabBarSync() {
  const { stackHideProgress } = useTabBarMotion();

  useFocusEffect(
    useCallback(() => {
      const duration = getStackMotionMs();

      if (Platform.OS === 'web') {
        stackHideProgress.value = 1;
        return () => {
          stackHideProgress.value = 0;
        };
      }

      stackHideProgress.value = withTiming(1, {
        duration,
        easing: DETAIL_SCREEN_MOTION_EASING,
      });

      return () => {
        stackHideProgress.value = withTiming(0, {
          duration,
          easing: DETAIL_SCREEN_MOTION_EASING,
        });
      };
    }, [stackHideProgress])
  );

  return null;
}
