import {
  type BottomTabBarProps,
  BottomTabBarHeightCallbackContext,
} from '@react-navigation/bottom-tabs';
import { useContext, useEffect, useLayoutEffect } from 'react';
import { Platform } from 'react-native';

import { useTabBarMotion } from '@/context/tab-bar-motion-context';

export const TAB_BAR_HEIGHT = 58;
/** Soft top corners only — bar is flush to the screen bottom. */
export const TAB_BAR_TOP_RADIUS = 18;
/** @deprecated Docked bar has no side inset — kept for any legacy imports. */
export const TAB_BAR_RADIUS = TAB_BAR_TOP_RADIUS;
export const TAB_BAR_MARGIN_H = 0;

export function getTabBarWidth(windowWidth: number, _platform: string = 'ios') {
  return Math.max(windowWidth, 0);
}

export function getTabBarLeft(_windowWidth: number, _barWidth: number) {
  return 0;
}

/** Docked bar sits on the screen edge; safe-area is padded inside the shell. */
export function getTabBarBottomOffset(_insetsBottom: number, _platform: string = Platform.OS) {
  return 0;
}

/**
 * Bottom safe-area used under the icon row. Slightly less than the raw inset so
 * the icons sit closer to the home indicator instead of floating too high.
 */
export function getTabBarSafeBottom(insetsBottom: number) {
  const inset = Math.max(insetsBottom, 0);
  if (inset <= 0) return 0;
  return Math.max(inset - 14, 10);
}

/** Real scroll padding — overlay tab bar is not in the tab navigator layout. */
export function getFloatingTabBarScrollPadding(
  insetsBottom: number,
  _platform: string = Platform.OS,
  extra = 12
) {
  return TAB_BAR_HEIGHT + getTabBarSafeBottom(insetsBottom) + extra;
}

export function FloatingTabBar(props: BottomTabBarProps) {
  const { setTabBarProps } = useTabBarMotion();
  const setTabBarHeight = useContext(BottomTabBarHeightCallbackContext);

  useLayoutEffect(() => {
    setTabBarHeight?.(0);
  }, [setTabBarHeight]);

  useEffect(() => {
    setTabBarProps(props);
    return () => setTabBarProps(null);
  }, [props, setTabBarProps]);

  return null;
}
