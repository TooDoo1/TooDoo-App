import { type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useEffect } from 'react';

import { useTabBarMotion } from '@/context/tab-bar-motion-context';

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

export function getTabBarBottomOffset(insetsBottom: number, platform: string = 'ios') {
  const raw = insetsBottom + TAB_BAR_EXTRA_BOTTOM;
  if (platform === 'web') {
    return Math.max(raw, TAB_BAR_WEB_BOTTOM_INSET);
  }
  return Math.max(raw, 0);
}

export function FloatingTabBar(props: BottomTabBarProps) {
  const { setTabBarProps } = useTabBarMotion();

  useEffect(() => {
    setTabBarProps(props);
  }, [props, setTabBarProps]);

  useEffect(() => {
    return () => setTabBarProps(null);
  }, [setTabBarProps]);

  return null;
}
