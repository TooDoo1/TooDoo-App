import { useFocusEffect, useIsFocused, useNavigationState } from '@react-navigation/native';
import { useCallback, useEffect } from 'react';
import { useAnimatedReaction, useSharedValue, withTiming } from 'react-native-reanimated';
import { useReanimatedTransitionProgress } from 'react-native-screens/reanimated';

import { useTabBarMotion } from '@/context/tab-bar-motion-context';
import { DETAIL_SCREEN_MOTION_EASING, DETAIL_SCREEN_MOTION_MS } from '@/lib/detail-screen-motion';
import { shouldRevealTabBarWhenClosingStack } from '@/lib/stack-navigation';

export function StackScreenTabBarSync() {
  const isFocused = useIsFocused();
  const isFocusedShared = useSharedValue(isFocused ? 1 : 0);
  const closingUsesDirectProgress = useSharedValue(-1);
  const shouldRevealTabBar = useSharedValue(1);
  const { stackHideProgress } = useTabBarMotion();
  const { progress, closing } = useReanimatedTransitionProgress();
  const previousRouteName = useNavigationState((state) => {
    if (!state || state.index < 1) {
      return undefined;
    }
    return state.routes[state.index - 1]?.name as string | undefined;
  });

  useEffect(() => {
    isFocusedShared.value = isFocused ? 1 : 0;
  }, [isFocused, isFocusedShared]);

  useEffect(() => {
    shouldRevealTabBar.value = shouldRevealTabBarWhenClosingStack(previousRouteName) ? 1 : 0;
  }, [previousRouteName, shouldRevealTabBar]);

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
      reveal: shouldRevealTabBar.value,
    }),
    (current, previous) => {
      if (current.focused === 0) {
        return;
      }

      if (current.closing !== 1) {
        closingUsesDirectProgress.value = -1;
        return;
      }

      if (current.reveal === 0) {
        stackHideProgress.value = 1;
        return;
      }

      if (previous?.closing !== 1) {
        closingUsesDirectProgress.value = current.progress >= 0.5 ? 1 : 0;
      }

      stackHideProgress.value =
        closingUsesDirectProgress.value === 1 ? current.progress : 1 - current.progress;
    },
    [progress, closing, isFocusedShared, closingUsesDirectProgress, shouldRevealTabBar, stackHideProgress]
  );

  return null;
}
