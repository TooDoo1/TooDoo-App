import { type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { CommonActions } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { TAB_BAR_HEIGHT } from '@/components/floating-tab-bar';
import { Colors } from '@/constants/theme';
import { useThemePreference } from '@/context/theme-preference-context';

const ICON_SLOT = 24;
const LABEL_GAP = 2;

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
  const inactiveColor = Colors[effectiveScheme].tabIconDefault;

  const visibleTabs = useMemo(
    () =>
      state.routes
        .map((route, index) => ({ route, index }))
        .filter(({ route }) => isTabVisible(route, descriptors)),
    [state.routes, descriptors]
  );

  const itemWidth = visibleTabs.length > 0 ? barWidth / visibleTabs.length : barWidth;

  return (
    <View style={[styles.row, { width: barWidth }]}>
      {visibleTabs.map(({ route, index }) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const activeColor = options.tabBarActiveTintColor ?? '#FFFFFF';
        const color = focused ? activeColor : (options.tabBarInactiveTintColor ?? inactiveColor);
        const inactiveLabelColor = options.tabBarInactiveTintColor ?? inactiveColor;
        const labelColor = focused ? '#FFFFFF' : inactiveLabelColor;
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
            color,
            size: ICON_SLOT,
          }) ?? null;

        const label = (
          <Text
            style={[styles.label, { color: labelColor }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            {labelText}
          </Text>
        );

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
                <View style={styles.labelSlot}>{label}</View>
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
  },
  itemSlot: {
    height: TAB_BAR_HEIGHT,
    justifyContent: 'center',
  },
  item: {
    flex: 1,
    width: '100%',
    height: TAB_BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  itemPressed: {
    opacity: 0.72,
  },
  tabColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: LABEL_GAP,
    paddingTop: 5,
  },
  iconSlot: {
    width: ICON_SLOT,
    height: ICON_SLOT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelSlot: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 1,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 12,
    textAlign: 'center',
  },
});
