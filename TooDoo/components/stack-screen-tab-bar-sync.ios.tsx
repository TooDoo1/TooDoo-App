import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect } from 'react';
import { useAnimatedReaction, useSharedValue, withTiming } from 'react-native-reanimated';
import { useReanimatedTransitionProgress } from 'react-native-screens/reanimated';

import { useTabBarMotion } from '@/context/tab-bar-motion-context';
import { DETAIL_SCREEN_MOTION_EASING, DETAIL_SCREEN_MOTION_MS } from '@/lib/detail-screen-motion';

export function StackScreenTabBarSync() {
  const isFocused = useIsFocused();
  const isFocusedShared = useSharedValue(isFocused ? 1 : 0);
  const closingUsesDirectProgress = useSharedValue(-1);
  const { stackHideProgress } = useTabBarMotion();
  const { progress, closing } = useReanimatedTransitionProgress();

  useEffect(() => {
    isFocusedShared.value = isFocused ? 1 : 0;
  }, [isFocused, isFocusedShared]);

  useFocusEffect(
    useCallback(() => {
      stackHideProgress.value = withTiming(1, {
        duration: DETAIL_SCREEN_MOTION_MS,
        easing: DETAIL_SCREEN_MOTION_EASING,
      });
    }, [stackHideProgress])
  );

  useAnimatedReaction(
    () => ({
      progress: progress.value,
      closing: closing.value,
      focused: isFocusedShared.value,
    }),
    (current, previous) => {
      if (current.focused === 0) {
        return;
      }

      if (current.closing !== 1) {
        closingUsesDirectProgress.value = -1;
        return;
      }

      if (previous?.closing !== 1) {
        closingUsesDirectProgress.value = current.progress >= 0.5 ? 1 : 0;
      }

      stackHideProgress.value =
        closingUsesDirectProgress.value === 1 ? current.progress : 1 - current.progress;
    },
    [progress, closing, isFocusedShared, closingUsesDirectProgress, stackHideProgress]
  );

  return null;
}
