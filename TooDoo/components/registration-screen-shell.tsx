import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HOME_PAGE_PAD } from '@/components/home/home-feed';
import { useThemePreference } from '@/context/theme-preference-context';
import { uiTheme } from '@/lib/ui-theme';

type RegistrationScreenShellProps = {
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
};

export function RegistrationScreenShell({
  header,
  footer,
  children,
}: RegistrationScreenShellProps) {
  const insets = useSafeAreaInsets();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const footerBottomPadding = Math.max(insets.bottom, 12) + 12;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.screenBg,
        ...(Platform.OS === 'web' ? { minHeight: 0 } : {}),
      }}
    >
      <View
        style={{
          paddingTop: Math.max(insets.top + 12, 56),
          paddingHorizontal: HOME_PAGE_PAD,
          paddingBottom: 14,
          backgroundColor: theme.screenBg,
        }}
      >
        {header}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: HOME_PAGE_PAD,
          paddingTop: 8,
          paddingBottom: 20,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>

      <View
        style={{
          paddingHorizontal: HOME_PAGE_PAD,
          paddingTop: 12,
          paddingBottom: footerBottomPadding,
          backgroundColor: theme.screenBg,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.border,
        }}
      >
        {footer}
      </View>
    </View>
  );
}
