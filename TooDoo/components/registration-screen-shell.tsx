import { useLayoutEffect, type ReactNode } from 'react';
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

const AUTH_SCREEN_DOM_ID = 'toodoo-auth-screen';

/**
 * On web, Expo Router keeps sibling tab scenes mounted. Hide them from the
 * accessibility / hit tree while an auth screen is focused.
 */
function useHideSiblingTabScenesOnWeb() {
  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const hidden: HTMLElement[] = [];

    const apply = () => {
      const auth = document.getElementById(AUTH_SCREEN_DOM_ID);
      if (!auth) return;

      let node: HTMLElement | null = auth;
      while (node?.parentElement && node.parentElement !== document.body) {
        const parent = node.parentElement;
        for (const child of Array.from(parent.children)) {
          if (child === node || !(child instanceof HTMLElement)) continue;
          if (child.id === 'tab-bar-overlay') continue;
          if (child.getAttribute('data-toodoo-auth-a11y') === '1') continue;

          child.setAttribute('aria-hidden', 'true');
          child.setAttribute('data-toodoo-auth-a11y', '1');
          child.style.setProperty('display', 'none');
          try {
            (child as HTMLElement & { inert?: boolean }).inert = true;
          } catch {
            // Older browsers may not support inert.
          }
          hidden.push(child);
        }

        // After hiding siblings at the tab-scene level, stop — don't blank the app shell.
        if (hidden.length > 0) break;
        node = parent;
      }
    };

    // nativeID may land in the DOM one frame after layout.
    apply();
    const raf = requestAnimationFrame(apply);

    return () => {
      cancelAnimationFrame(raf);
      for (const child of hidden) {
        if (child.getAttribute('data-toodoo-auth-a11y') !== '1') continue;
        child.removeAttribute('aria-hidden');
        child.removeAttribute('data-toodoo-auth-a11y');
        child.style.removeProperty('display');
        try {
          (child as HTMLElement & { inert?: boolean }).inert = false;
        } catch {
          // ignore
        }
      }
    };
  }, []);
}

export function RegistrationScreenShell({
  header,
  footer,
  children,
}: RegistrationScreenShellProps) {
  const insets = useSafeAreaInsets();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const footerBottomPadding = Math.max(insets.bottom, 12) + 12;
  useHideSiblingTabScenesOnWeb();

  return (
    <View
      nativeID={AUTH_SCREEN_DOM_ID}
      accessibilityViewIsModal
      importantForAccessibility="yes"
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
