import {
  type BottomTabBarProps,
  BottomTabBarHeightCallbackContext,
} from '@react-navigation/bottom-tabs';
import { useContext, useEffect, useLayoutEffect } from 'react';
import { Platform } from 'react-native';

import { useTabBarMotion } from '@/context/tab-bar-motion-context';
import { isStandaloneWebApp } from '@/lib/pwa-standalone';

export const TAB_BAR_HEIGHT = 64;
export const TAB_BAR_RADIUS = 32;
/** Horizontal inset from each screen edge — lower = wider bar */
export const TAB_BAR_MARGIN_H = 12;
/** On wide web viewports, cap bar width so tabs match iPhone proportions */
export const TAB_BAR_MAX_WIDTH_WEB = 480;
/** Mimics iPhone float when the browser reports no safe-area inset */
export const TAB_BAR_WEB_BOTTOM_INSET = 16;
/** Offset from safe-area bottom — negative moves the bar closer to the screen edge */
export const TAB_BAR_EXTRA_BOTTOM = -10;

export function getTabBarWidth(windowWidth: number, platform: string = 'ios') {
  const naturalWidth = Math.max(windowWidth - TAB_BAR_MARGIN_H * 2, 0);
  if (platform === 'web' && windowWidth > 500) {
    return Math.min(naturalWidth, TAB_BAR_MAX_WIDTH_WEB);
  }
  return naturalWidth;
}

export function getTabBarLeft(windowWidth: number, barWidth: number) {
  return Math.max((windowWidth - barWidth) / 2, TAB_BAR_MARGIN_H);
}

export function getTabBarBottomOffset(insetsBottom: number, platform: string = Platform.OS) {
  if (platform === 'web') {
    // Standalone viewport already reaches the screen bottom — don't double safe-area offset.
    if (isStandaloneWebApp()) {
      return TAB_BAR_WEB_BOTTOM_INSET;
    }
    if (insetsBottom > 0) {
      return Math.max(insetsBottom + TAB_BAR_EXTRA_BOTTOM, TAB_BAR_WEB_BOTTOM_INSET);
    }
    return TAB_BAR_WEB_BOTTOM_INSET;
  }

  if (platform === 'android') {
    return Math.max(insetsBottom + 8, 12);
  }

  const raw = insetsBottom + TAB_BAR_EXTRA_BOTTOM;
  return Math.max(raw, 8);
}

/** Real scroll padding — overlay tab bar is not in the tab navigator layout. */
export function getFloatingTabBarScrollPadding(
  insetsBottom: number,
  platform: string = Platform.OS,
  extra = 16
) {
  const bottomOffset = getTabBarBottomOffset(insetsBottom, platform);
  // Standalone: content scrolls under the overlay fade — only reserve tab bar height.
  if (platform === 'web' && isStandaloneWebApp()) {
    return TAB_BAR_HEIGHT + bottomOffset + 8;
  }
  return TAB_BAR_HEIGHT + bottomOffset + extra;
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
