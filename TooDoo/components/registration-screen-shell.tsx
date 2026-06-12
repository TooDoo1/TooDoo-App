import type { ReactNode } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
          paddingTop: Math.max(insets.top, 12) + 8,
          paddingHorizontal: 24,
          paddingBottom: 12,
          backgroundColor: theme.screenBg,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
        }}
      >
        {header}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 16,
          paddingBottom: 16,
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
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: footerBottomPadding,
          backgroundColor: theme.screenBg,
          borderTopWidth: 1,
          borderTopColor: theme.border,
        }}
      >
        {footer}
      </View>
    </View>
  );
}
