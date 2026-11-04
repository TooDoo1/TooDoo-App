import { FloatingTabBarContent } from '@/components/floating-tab-bar-content';
import { useEffect } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiquidGlassTabBarShell } from '@/components/ui/liquid-glass-tab-bar-shell';
import {
  getTabBarSafeBottom,
  getTabBarWidth,
  TAB_BAR_HEIGHT,
  TAB_BAR_TOP_RADIUS,
} from '@/components/floating-tab-bar';
import { useTabBarMotion } from '@/context/tab-bar-motion-context';
import { useThemePreference } from '@/context/theme-preference-context';
import { DETAIL_SCREEN_MOTION_MS, getStackMotionMs } from '@/lib/detail-screen-motion';

const TAB_BAR_HIDE_ROUTES = new Set<string>();

export function RootFloatingTabBarOverlay() {
  const insets = useSafeAreaInsets();
  const { effectiveScheme } = useThemePreference();
  const isDark = effectiveScheme === 'dark';
  const { stackHideProgress, scrollHideProgress, tabBarProps } = useTabBarMotion();

  if (!tabBarProps) {
    return null;
  }

  const focusedRoute = tabBarProps.state.routes[tabBarProps.state.index];
  const focusedTabBarStyle = tabBarProps.descriptors[focusedRoute.key].options.tabBarStyle;
  const flattenedTabBarStyle = StyleSheet.flatten(focusedTabBarStyle) as ViewStyle | undefined;
  const isTabBarHidden = flattenedTabBarStyle?.display === 'none';

  if (isTabBarHidden) {
    return null;
  }

  return (
    <RootFloatingTabBarOverlayContent
      tabBarProps={tabBarProps}
      focusedRouteName={focusedRoute.name}
      isDark={isDark}
      insets={insets}
      stackHideProgress={stackHideProgress}
      scrollHideProgress={scrollHideProgress}
    />
  );
}

type RootFloatingTabBarOverlayContentProps = {
  tabBarProps: NonNullable<ReturnType<typeof useTabBarMotion>['tabBarProps']>;
  focusedRouteName: string;
  isDark: boolean;
  insets: ReturnType<typeof useSafeAreaInsets>;
  stackHideProgress: ReturnType<typeof useTabBarMotion>['stackHideProgress'];
  scrollHideProgress: ReturnType<typeof useTabBarMotion>['scrollHideProgress'];
};

function RootFloatingTabBarOverlayContent({
  tabBarProps,
  focusedRouteName,
  isDark,
  insets,
  stackHideProgress,
  scrollHideProgress,
}: RootFloatingTabBarOverlayContentProps) {
  const { width: windowWidth } = useWindowDimensions();
  const routeHideProgress = useSharedValue(0);
  const safeBottom = getTabBarSafeBottom(insets.bottom);
  const barWidth = getTabBarWidth(windowWidth, Platform.OS);
  const barHeight = TAB_BAR_HEIGHT + safeBottom;
  const shouldHideTabBar = TAB_BAR_HIDE_ROUTES.has(focusedRouteName);
  const hideDistance = barHeight + 24;

  useEffect(() => {
    const duration = Platform.OS === 'web' ? getStackMotionMs() : DETAIL_SCREEN_MOTION_MS;
    routeHideProgress.value = withTiming(shouldHideTabBar ? 1 : 0, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [shouldHideTabBar, routeHideProgress]);

  // Native Liquid Glass breaks when ancestors use transform — animate bottom instead.
  const animatedBarPositionStyle = useAnimatedStyle(() => {
    const hideAmount = Math.max(
      routeHideProgress.value,
      stackHideProgress.value,
      scrollHideProgress.value
    );
    const slide = hideDistance * hideAmount;

    return {
      bottom: -slide,
      pointerEvents: hideAmount > 0.5 ? 'none' : 'auto',
    };
  });

  const tabContent = <FloatingTabBarContent {...tabBarProps} barWidth={barWidth} />;

  return (
    <View
      nativeID="tab-bar-overlay"
      style={[styles.overlay, Platform.OS === 'web' && styles.overlayWeb]}
    >
      <Animated.View
        style={[
          styles.barAnchor,
          {
            left: 0,
            width: barWidth,
            pointerEvents: shouldHideTabBar ? 'none' : 'auto',
          },
          animatedBarPositionStyle,
        ]}
      >
        <LiquidGlassTabBarShell
          isDark={isDark}
          borderRadius={0}
          topRadius={TAB_BAR_TOP_RADIUS}
          width={barWidth}
          height={barHeight}
          docked
        >
          <View style={{ width: barWidth, height: TAB_BAR_HEIGHT }}>{tabContent}</View>
          {safeBottom > 0 ? <View style={{ height: safeBottom }} /> : null}
        </LiquidGlassTabBarShell>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    elevation: 20,
    pointerEvents: 'box-none',
  },
  overlayWeb: {
    position: 'fixed',
  },
  barAnchor: {
    position: 'absolute',
  },
});
