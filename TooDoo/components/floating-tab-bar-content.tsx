import { type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { CommonActions } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Reanimated, {
  Easing as ReanimatedEasing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { TAB_BAR_HEIGHT } from '@/components/floating-tab-bar';
import { Colors } from '@/constants/theme';
import { useThemePreference } from '@/context/theme-preference-context';

const ICON_SLOT = 22;
const LABEL_GAP = 3;
const PILL_INSET = 6;
const PILL_RADIUS = 14;
const PILL_MOVE_MS = 240;

function pillMetrics(index: number, itemWidth: number) {
  return {
    x: index * itemWidth + PILL_INSET,
    width: Math.max(itemWidth - PILL_INSET * 2, 0),
  };
}

type FloatingTabBarContentProps = BottomTabBarProps & {
  barWidth: number;
};

function isTabVisible(
  route: BottomTabBarProps['state']['routes'][number],
  descriptors: BottomTabBarProps['descriptors']
) {
  const options = descriptors[route.key].options;

  // Expo Router strips `href` and maps href: null → tabBarItemStyle: { display: 'none' }.
  const tabBarItemStyle = StyleSheet.flatten(options.tabBarItemStyle) as ViewStyle | undefined;
  if (tabBarItemStyle?.display === 'none') return false;

  const tabBarStyle = StyleSheet.flatten(options.tabBarStyle) as ViewStyle | undefined;
  if (tabBarStyle?.display === 'none') return false;

  return Boolean(options.tabBarIcon);
}

export function FloatingTabBarContent({
  state,
  descriptors,
  navigation,
  barWidth,
}: FloatingTabBarContentProps) {
  const { effectiveScheme } = useThemePreference();
  const isDark = effectiveScheme === 'dark';
  const inactiveColor = Colors[effectiveScheme].tabIconDefault;

  const visibleTabs = useMemo(
    () =>
      state.routes
        .map((route, index) => ({ route, index }))
        .filter(({ route }) => isTabVisible(route, descriptors)),
    [state.routes, descriptors]
  );

  const itemWidth = visibleTabs.length > 0 ? barWidth / visibleTabs.length : barWidth;
  const focusedVisibleIndex = Math.max(
    visibleTabs.findIndex(({ index }) => index === state.index),
    0
  );
  const pill = pillMetrics(focusedVisibleIndex, itemWidth);
  const pillX = useSharedValue(pill.x);
  const prevIndexRef = useRef(focusedVisibleIndex);

  useEffect(() => {
    const next = pillMetrics(focusedVisibleIndex, itemWidth);
    const indexChanged = prevIndexRef.current !== focusedVisibleIndex;
    prevIndexRef.current = focusedVisibleIndex;
    if (indexChanged) {
      pillX.value = withTiming(next.x, {
        duration: PILL_MOVE_MS,
        easing: ReanimatedEasing.bezier(0.22, 1, 0.36, 1),
      });
      return;
    }
    pillX.value = next.x;
  }, [focusedVisibleIndex, itemWidth, pillX]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
  }));

  return (
    <View style={[styles.row, { width: barWidth }]}>
      <Reanimated.View
        pointerEvents="none"
        style={[
          styles.pill,
          {
            width: pill.width,
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(71, 139, 235, 0.12)',
            borderRadius: PILL_RADIUS,
          },
          pillStyle,
        ]}
      />
      {visibleTabs.map(({ route, index }) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const accent = options.tabBarActiveTintColor ?? '#FFFFFF';
        const iconColor = focused ? accent : (options.tabBarInactiveTintColor ?? inactiveColor);
        const labelColor = focused
          ? isDark
            ? '#ffffff'
            : Colors.light.text
          : (options.tabBarInactiveTintColor ?? inactiveColor);
        const labelText =
          typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : (options.title ?? route.name);

        const onPress = () => {
          if (process.env.EXPO_OS === 'ios') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.dispatch({
              ...CommonActions.navigate(route),
              target: state.key,
            });
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        const icon =
          options.tabBarIcon?.({
            focused,
            color: iconColor,
            size: ICON_SLOT,
          }) ?? null;

        return (
          <View key={route.key} style={[styles.itemSlot, { width: itemWidth }]}>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            >
              <View style={styles.tabColumn}>
                <View style={styles.iconSlot}>{icon}</View>
                <Text
                  style={[
                    styles.label,
                    focused ? styles.labelActive : styles.labelIdle,
                    { color: labelColor },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {labelText}
                </Text>
              </View>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    height: TAB_BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pill: {
    position: 'absolute',
    left: 0,
    top: PILL_INSET,
    bottom: PILL_INSET,
  },
  itemSlot: {
    height: TAB_BAR_HEIGHT,
    justifyContent: 'center',
    zIndex: 1,
  },
  item: {
    flex: 1,
    width: '100%',
    height: TAB_BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    ...Platform.select({
      web: { cursor: 'pointer' as const, outlineWidth: 0 },
      default: {},
    }),
  },
  itemPressed: {
    opacity: 0.72,
  },
  tabColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: LABEL_GAP,
  },
  iconSlot: {
    width: ICON_SLOT,
    height: ICON_SLOT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    lineHeight: 13,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  labelActive: {
    fontWeight: '700',
  },
  labelIdle: {
    fontWeight: '600',
  },
});
