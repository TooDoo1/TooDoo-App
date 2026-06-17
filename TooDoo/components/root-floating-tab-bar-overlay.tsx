import { FloatingTabBarContent } from '@/components/floating-tab-bar-content';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  LiquidGlassTabBarShell,
  useNativeTabBarLiquidGlass,
} from '@/components/ui/liquid-glass-tab-bar-shell';
import { brandInkRgba, brandNavyRgba } from '@/lib/brand-colors';
import {
  getTabBarBottomOffset,
  getTabBarLeft,
  getTabBarWidth,
  TAB_BAR_HEIGHT,
  TAB_BAR_RADIUS,
} from '@/components/floating-tab-bar';
import { useTabBarMotion } from '@/context/tab-bar-motion-context';
import { useThemePreference } from '@/context/theme-preference-context';
import { DETAIL_SCREEN_MOTION_MS, getStackMotionMs } from '@/lib/detail-screen-motion';
import { isStandaloneWebApp } from '@/lib/pwa-standalone';

const TAB_BAR_HIDE_ROUTES = new Set<string>();
const TAB_BAR_BACKDROP_EXTRA = 36;
const TAB_BAR_BACKDROP_EXTRA_STANDALONE = 72;

export function RootFloatingTabBarOverlay() {
  const insets = useSafeAreaInsets();
  const { effectiveScheme } = useThemePreference();
  const isDark = effectiveScheme === 'dark';
  const { stackHideProgress, tabBarProps } = useTabBarMotion();

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
    />
  );
}

type RootFloatingTabBarOverlayContentProps = {
  tabBarProps: NonNullable<ReturnType<typeof useTabBarMotion>['tabBarProps']>;
  focusedRouteName: string;
  isDark: boolean;
  insets: ReturnType<typeof useSafeAreaInsets>;
  stackHideProgress: ReturnType<typeof useTabBarMotion>['stackHideProgress'];
};

function RootFloatingTabBarOverlayContent({
  tabBarProps,
  focusedRouteName,
  isDark,
  insets,
  stackHideProgress,
}: RootFloatingTabBarOverlayContentProps) {
  const { width: windowWidth } = useWindowDimensions();
  const routeHideProgress = useSharedValue(0);
  const isStandalone = Platform.OS === 'web' && isStandaloneWebApp();
  const useNativeGlass = useNativeTabBarLiquidGlass();
  const bottomOffset = getTabBarBottomOffset(insets.bottom, Platform.OS);
  const barWidth = getTabBarWidth(windowWidth, Platform.OS);
  const barLeft = getTabBarLeft(windowWidth, barWidth);
  const shouldHideTabBar = TAB_BAR_HIDE_ROUTES.has(focusedRouteName);
  const hideDistance = TAB_BAR_HEIGHT + bottomOffset + 32;
  const backdropExtra = isStandalone ? TAB_BAR_BACKDROP_EXTRA_STANDALONE : TAB_BAR_BACKDROP_EXTRA;
  const fadeStripBottom = bottomOffset + TAB_BAR_HEIGHT;

  useEffect(() => {
    const duration = Platform.OS === 'web' ? getStackMotionMs() : DETAIL_SCREEN_MOTION_MS;
    routeHideProgress.value = withTiming(shouldHideTabBar ? 1 : 0, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [shouldHideTabBar, routeHideProgress]);

  // Native Liquid Glass breaks when ancestors use transform — animate bottom instead.
  const animatedBarPositionStyle = useAnimatedStyle(() => {
    const hideAmount = Math.max(routeHideProgress.value, stackHideProgress.value);
    const slide = hideDistance * hideAmount;

    return {
      bottom: bottomOffset - slide,
    };
  });

  const animatedFadePositionStyle = useAnimatedStyle(() => {
    const hideAmount = Math.max(routeHideProgress.value, stackHideProgress.value);
    const slide = hideDistance * hideAmount;

    return {
      bottom: fadeStripBottom - slide,
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
          styles.backdrop,
          {
            height: backdropExtra,
            pointerEvents: 'none',
          },
          animatedFadePositionStyle,
        ]}
      >
        <LinearGradient
          colors={
            isDark
              ? [brandNavyRgba(0), brandNavyRgba(0.55)]
              : [brandInkRgba(0), brandInkRgba(0.1)]
          }
          locations={[0, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.barAnchor,
          {
            left: barLeft,
            width: barWidth,
            pointerEvents: shouldHideTabBar ? 'none' : 'auto',
          },
          animatedBarPositionStyle,
          !useNativeGlass &&
            (Platform.OS === 'web'
              ? {
                  boxShadow: isDark
                    ? '0 12px 28px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255,255,255,0.12)'
                    : '0 12px 28px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255,255,255,0.55)',
                }
              : styles.fallbackShadow),
        ]}
      >
        <LiquidGlassTabBarShell
          isDark={isDark}
          borderRadius={TAB_BAR_RADIUS}
          width={barWidth}
          height={TAB_BAR_HEIGHT}
        >
          {tabContent}
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
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  barAnchor: {
    position: 'absolute',
  },
  fallbackShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 12,
  },
});
