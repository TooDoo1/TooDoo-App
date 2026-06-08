import { Tabs } from 'expo-router';
import React from 'react';

import { FloatingTabBar } from '@/components/floating-tab-bar';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useThemePreference } from '@/context/theme-preference-context';

export default function TabLayout() {
  const { effectiveScheme } = useThemePreference();
  const { isLoggedIn } = useAuth();

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        tabBarActiveTintColor: Colors[effectiveScheme].tabIconSelected,
        tabBarInactiveTintColor: Colors[effectiveScheme].tabIconDefault,
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
        },
        tabBarItemStyle: {
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginBottom: 2,
        },
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Upptäck',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="Favoriter"
        options={{
          title: 'Favoriter',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="heart.fill" color={color} />,
        }}
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
        name="MinaDeals"
        options={{
          title: 'Mina Erbjudanden',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="ticket.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="Loggain"
        options={{
          title: 'Logga In',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.fill" color={color} />,
          href: isLoggedIn ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="Profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.fill" color={color} />,
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
  );
}
