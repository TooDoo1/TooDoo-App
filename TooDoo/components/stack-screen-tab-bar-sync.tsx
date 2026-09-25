import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';

import { useTabBarMotion } from '@/context/tab-bar-motion-context';

/**
 * Web + Android: hide tab bar on stack detail screens.
 * Uses a ref-count so Nära dig → map (and similar) never flashes the bar between screens.
 */
export function StackScreenTabBarSync() {
  const { acquireStackHide, releaseStackHide } = useTabBarMotion();

  useFocusEffect(
    useCallback(() => {
      acquireStackHide();
      return () => {
        releaseStackHide();
      };
    }, [acquireStackHide, releaseStackHide])
  );

  return null;
}
