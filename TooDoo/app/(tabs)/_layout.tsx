import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useThemePreference } from '@/context/theme-preference-context';

export default function TabLayout() {
  const { effectiveScheme } = useThemePreference();
  const isDark = effectiveScheme === 'dark';
  const { isLoggedIn } = useAuth();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[effectiveScheme].tabIconSelected,
        tabBarInactiveTintColor: Colors[effectiveScheme].tabIconDefault,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopColor: Colors[effectiveScheme].icon,
          borderTopWidth: 0,
          elevation: 0,
          overflow: 'hidden',
        },
        tabBarBackground: () => (
          <>
            {Platform.OS === 'ios' ? (
              <BlurView
                tint={isDark ? 'dark' : 'light'}
                intensity={80}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  // Keep navbar see-through (blur on iOS, translucent fill everywhere).
                  backgroundColor: isDark ? 'rgba(10, 21, 53, 0.65)' : 'rgba(245, 247, 255, 0.75)',
                },
              ]}
            />
          </>
        ),
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Upptäck',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="MinaDeals"
        options={{
          title: 'Mina Erbjudanden',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="ticket.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="Loggain"
        options={{
          title: 'Logga In',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.fill" color={color} />,
          href: isLoggedIn ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="Profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.fill" color={color} />,
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
