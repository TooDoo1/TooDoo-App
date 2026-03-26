import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = (colorScheme ?? 'light') === 'dark';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tabIconSelected,
        tabBarInactiveTintColor: Colors[colorScheme ?? 'light'].tabIconDefault,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopColor: Colors[colorScheme ?? 'light'].icon,
          borderTopWidth: 0,
          elevation: 0,
          overflow: 'hidden',
        },
        tabBarBackground: () => (
          <>
            <BlurView
              tint={isDark ? 'dark' : 'light'}
              intensity={70}
              experimentalBlurMethod="dimezisBlurView"
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: isDark ? 'rgba(10, 21, 53, 1)' : 'rgba(0, 11, 42, 0.8)',
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
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="paperplane.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="Loggain"
        options={{
          title: 'Logga In',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="paperplane.fill" color={color} />,
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
    </Tabs>
  );
}
