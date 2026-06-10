import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, Text, View } from 'react-native';

import { FloatingTabBar } from '@/components/floating-tab-bar';
import { TabBarStackMotionReset } from '@/components/tab-bar-stack-motion-reset';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useThemePreference } from '@/context/theme-preference-context';
import { FAVORITE_HEART_COLOR, TAB_ACTIVE_COLORS } from '@/lib/tab-colors';

function tabBarIcon(
  name: React.ComponentProps<typeof IconSymbol>['name'],
  activeColor: string
) {
  return ({ color, focused, size = 24 }: { color: string; focused: boolean; size?: number }) => (
    <IconSymbol size={size} name={name} color={focused ? activeColor : color} />
  );
}

function selectedWhiteLabel({
  focused,
  color,
  children,
}: {
  focused: boolean;
  color: string;
  children: string;
}) {
  return (
    <Text
      style={{
        color: focused ? '#FFFFFF' : color,
        fontSize: 11,
        fontWeight: '600',
        lineHeight: 13,
      }}
    >
      {children}
    </Text>
  );
}

function coloredTabOptions(
  title: string,
  iconName: React.ComponentProps<typeof IconSymbol>['name'],
  activeIconColor: string
) {
  return {
    title,
    tabBarActiveTintColor: '#FFFFFF',
    tabBarIcon: tabBarIcon(iconName, activeIconColor),
    tabBarLabel: selectedWhiteLabel,
  };
}

export default function TabLayout() {
  const { effectiveScheme } = useThemePreference();
  const { isLoggedIn } = useAuth();
  return (
    <View style={{ flex: 1, ...(Platform.OS === 'web' ? { minHeight: 0 } : {}) }}>
      <TabBarStackMotionReset />
      <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        ...(Platform.OS === 'web' ? { sceneStyle: { flex: 1 } } : {}),
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: Colors[effectiveScheme].tabIconDefault,
        tabBarLabelPosition: 'below-icon',
        tabBarStyle: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 0,
          overflow: 'visible',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
        },
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={coloredTabOptions('Upptäck', 'house.fill', TAB_ACTIVE_COLORS.index)}
      />
      <Tabs.Screen
        name="Favoriter"
        options={coloredTabOptions('Favoriter', 'heart.fill', FAVORITE_HEART_COLOR)}
      />
      <Tabs.Screen
        name="NaraDig"
        options={{
          title: 'Nära dig',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="location.fill" color={color} />,
          href: null,
        }}
      />
      <Tabs.Screen
        name="HetaErbjudanden"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="SlutarSnart"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="MinaDeals"
        options={coloredTabOptions('Erbjudanden', 'ticket.fill', TAB_ACTIVE_COLORS.MinaDeals)}
      />
      <Tabs.Screen
        name="Loggain"
        options={{
          ...coloredTabOptions('Logga In', 'person.fill', TAB_ACTIVE_COLORS.Profile),
          href: isLoggedIn ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="Profile"
        options={{
          ...coloredTabOptions('Profil', 'gearshape.fill', TAB_ACTIVE_COLORS.Profile),
          href: isLoggedIn ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="Erbjudanden"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="Registrering"
        options={{
          href: null,
          tabBarStyle: {
            display: 'none',
          },
        }}
      />
      <Tabs.Screen
        name="Personality"
        options={{
          href: null,
          tabBarStyle: {
            display: 'none',
          },
        }}
      />
    </Tabs>
    </View>
  );
}
