import { type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { CommonActions } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { TAB_BAR_HEIGHT } from '@/components/floating-tab-bar';
import { Colors } from '@/constants/theme';
import { useThemePreference } from '@/context/theme-preference-context';

const ICON_SLOT = 24;
const LABEL_GAP = 2;

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

export function FloatingTabBarContent({ state, descriptors, navigation }: BottomTabBarProps) {
  const { effectiveScheme } = useThemePreference();
  const inactiveColor = Colors[effectiveScheme].tabIconDefault;

  return (
    <View style={styles.row}>
      {state.routes.map((route, index) => {
        if (!isTabVisible(route, descriptors)) return null;

        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const activeColor = options.tabBarActiveTintColor ?? '#FFFFFF';
        const color = focused ? activeColor : (options.tabBarInactiveTintColor ?? inactiveColor);
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

        const label =
          typeof options.tabBarLabel === 'function' ? (
            options.tabBarLabel({
              focused,
              color,
              position: 'below-icon',
              children: labelText,
            })
          ) : (
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {labelText}
            </Text>
          );

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            onPress={onPress}
            onLongPress={onLongPress}
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
          >
            <View style={styles.iconSlot}>{icon}</View>
            <View style={styles.labelSlot}>{label}</View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    height: TAB_BAR_HEIGHT,
    width: '100%',
    alignItems: 'center',
  },
  item: {
    flex: 1,
    height: TAB_BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  itemPressed: {
    opacity: 0.72,
  },
  iconSlot: {
    height: ICON_SLOT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelSlot: {
    marginTop: LABEL_GAP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 13,
    textAlign: 'center',
  },
});
