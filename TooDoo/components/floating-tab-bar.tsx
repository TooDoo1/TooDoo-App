import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Dimensions, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiquidGlassTabBarBackground } from '@/components/ui/liquid-glass-tab-bar-background';
import { useThemePreference } from '@/context/theme-preference-context';

export const TAB_BAR_HEIGHT = 64;
export const TAB_BAR_RADIUS = 32;
/** Horizontal inset from each screen edge — lower = wider bar */
export const TAB_BAR_MARGIN_H = 12;
/** Gap above the home-indicator safe area */
export const TAB_BAR_EXTRA_BOTTOM = 8;

const SCREEN_WIDTH = Dimensions.get('window').width;

export function FloatingTabBar(props: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { effectiveScheme } = useThemePreference();
  const isDark = effectiveScheme === 'dark';

  const focusedRoute = props.state.routes[props.state.index];
  const focusedTabBarStyle = StyleSheet.flatten(
    props.descriptors[focusedRoute.key].options.tabBarStyle
  );

  if (focusedTabBarStyle?.display === 'none') {
    return null;
  }

  const bottomOffset = insets.bottom + TAB_BAR_EXTRA_BOTTOM;
  const barWidth = SCREEN_WIDTH - TAB_BAR_MARGIN_H * 2;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View
        pointerEvents="box-none"
        style={[
          styles.shell,
          {
            width: barWidth,
            height: TAB_BAR_HEIGHT,
            borderRadius: TAB_BAR_RADIUS,
            bottom: bottomOffset,
            shadowOpacity: isDark ? 0.18 : 0.08,
          },
        ]}
      >
        <LiquidGlassTabBarBackground isDark={isDark} borderRadius={TAB_BAR_RADIUS} />
        <BottomTabBar
          {...props}
          style={{
            height: TAB_BAR_HEIGHT,
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            paddingBottom: 0,
            paddingTop: 0,
            paddingHorizontal: 0,
            margin: 0,
            elevation: 0,
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    alignSelf: 'center',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 16,
    elevation: 8,
  },
});
