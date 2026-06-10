import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { SafeAreaProviderCompat } from '@react-navigation/elements';
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

import { LiquidGlassTabBarBackground } from '@/components/ui/liquid-glass-tab-bar-background';
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
import { DETAIL_SCREEN_MOTION_MS } from '@/lib/detail-screen-motion';

const TAB_BAR_HIDE_ROUTES = new Set<string>();
const TAB_BAR_BACKDROP_EXTRA = 36;

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
  const bottomOffset = getTabBarBottomOffset(insets.bottom, Platform.OS);
  const barWidth = getTabBarWidth(windowWidth, Platform.OS);
  const barLeft = getTabBarLeft(windowWidth, barWidth);
  const shouldHideTabBar = TAB_BAR_HIDE_ROUTES.has(focusedRouteName);
  const hideDistance = TAB_BAR_HEIGHT + bottomOffset + 32;

  useEffect(() => {
    routeHideProgress.value = withTiming(shouldHideTabBar ? 1 : 0, {
      duration: DETAIL_SCREEN_MOTION_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [shouldHideTabBar, routeHideProgress]);

  const animatedShellStyle = useAnimatedStyle(() => {
    const stackHide = stackHideProgress.value;
    const routeHide = routeHideProgress.value;
    const hideAmount = Math.max(routeHide, stackHide);

    return {
      transform: [{ translateY: hideDistance * hideAmount }],
    };
  });

  const backdropHeight = TAB_BAR_HEIGHT + bottomOffset + TAB_BAR_BACKDROP_EXTRA;

  return (
    <View style={styles.overlay}>
      <Animated.View
        style={[
          styles.backdrop,
          { height: backdropHeight, pointerEvents: 'none' },
          animatedShellStyle,
        ]}
      >
        <LinearGradient
          colors={
            isDark
              ? [brandNavyRgba(0), brandNavyRgba(0.72), brandNavyRgba(0.96)]
              : [brandInkRgba(0), brandInkRgba(0.14), brandInkRgba(0.28)]
          }
          locations={[0, 0.45, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <SafeAreaProviderCompat style={styles.safeAreaHost}>
        <Animated.View
          style={[
            styles.shell,
            {
              left: barLeft,
              width: barWidth,
              height: TAB_BAR_HEIGHT,
              borderRadius: TAB_BAR_RADIUS,
              bottom: bottomOffset,
              ...(Platform.OS === 'web'
                ? {
                    boxShadow: isDark
                      ? '0 10px 16px rgba(0, 0, 0, 0.28)'
                      : '0 10px 16px rgba(0, 0, 0, 0.1)',
                  }
                : {
                    shadowOpacity: isDark ? 0.18 : 0.08,
                  }),
              pointerEvents: shouldHideTabBar ? 'none' : 'auto',
            },
            animatedShellStyle,
          ]}
        >
          <LiquidGlassTabBarBackground isDark={isDark} borderRadius={TAB_BAR_RADIUS} />
          <BottomTabBar
            {...tabBarProps}
            style={{
              width: '100%',
              height: TAB_BAR_HEIGHT,
              backgroundColor: 'transparent',
              borderTopWidth: 0,
              paddingBottom: 0,
              paddingTop: 0,
              paddingStart: 0,
              paddingEnd: 0,
              paddingHorizontal: 0,
              margin: 0,
              elevation: 0,
            }}
          />
        </Animated.View>
      </SafeAreaProviderCompat>
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
  safeAreaHost: {
    pointerEvents: 'box-none',
  },
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  shell: {
    position: 'absolute',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 16,
    elevation: 8,
  },
});
