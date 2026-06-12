import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarScrollPadding } from '@/components/floating-tab-bar';
import { ScreenBackButton } from '@/components/ui/screen-back-button';
import { useThemePreference } from '@/context/theme-preference-context';
import { uiTheme } from '@/lib/ui-theme';

export function profileCardShadow(theme: ReturnType<typeof uiTheme>) {
  return {
    shadowColor: theme.isDark ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.25)',
    shadowOffset: { width: 0, height: theme.isDark ? 10 : 6 },
    shadowOpacity: theme.isDark ? 0.35 : 0.14,
    shadowRadius: theme.isDark ? 18 : 12,
    elevation: theme.isDark ? 12 : 7,
  };
}

export function ProfileScreenShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const scrollBottomPadding = getFloatingTabBarScrollPadding(insets.bottom, undefined, 32);

  return (
    <View style={{ flex: 1, backgroundColor: theme.screenBg }}>
      <ScreenBackButton />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: insets.top + 56,
          paddingBottom: scrollBottomPadding,
          flexGrow: 1,
        }}
      >
        <Text className="text-2xl font-semibold" style={{ color: theme.text }}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-1 text-sm" style={{ color: theme.textMuted }}>
            {subtitle}
          </Text>
        ) : null}
        <View className="mt-6">{children}</View>
      </ScrollView>
    </View>
  );
}
