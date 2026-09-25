import { useCallback } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';

import { FilterChipTheme } from '@/lib/brand-colors';
import {
  DETAIL_RETURN_ROUTES,
  type DetailReturnKey,
} from '@/lib/detail-navigation';
import { requestOpenHomeSearch } from '@/lib/home-search-handoff';
import { performWebStackBack } from '@/lib/web-stack-navigation';

const SEARCH_BAR_HEIGHT = 44;
const SIDE_PAD = 12;
const MAP_BUTTON_SIZE = SEARCH_BAR_HEIGHT;
const MAP_BUTTON_GAP = 8;

type BusinessMapSearchHeaderProps = {
  value: string;
  onChangeText: (text: string) => void;
};

function resolveMapReturnPath(returnTo?: string | string[]) {
  const key = (Array.isArray(returnTo) ? returnTo[0] : returnTo) as DetailReturnKey | undefined;
  if (key && key in DETAIL_RETURN_ROUTES) {
    return DETAIL_RETURN_ROUTES[key];
  }
  return null;
}

/**
 * Same header chrome as the home search overlay: back, search field, map button.
 */
export function BusinessMapSearchHeader({
  value,
  onChangeText,
}: BusinessMapSearchHeaderProps) {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnPath = resolveMapReturnPath(params.returnTo);
  const trimmed = value.trim();

  const leaveMap = useCallback(
    (mode: 'home' | 'search') => {
      // Map button returns to search mode; back goes home / returnTo without reopening search.
      if (mode === 'search') {
        requestOpenHomeSearch(value, { fromMap: true });
      }

      if (mode === 'home' && returnPath) {
        try {
          if (router.canDismiss()) {
            router.dismissTo(returnPath);
            return;
          }
        } catch {
          // fall through
        }
        router.replace(returnPath);
        return;
      }

      if (router.canGoBack()) {
        router.back();
        return;
      }
      if (Platform.OS === 'web') {
        const topSegment = segments[segments.length - 1];
        performWebStackBack(router, {
          isCompanyDetail: topSegment === 'company-detail',
          topSegment,
          returnTo: params.returnTo,
        });
        return;
      }
      try {
        router.dismissTo(returnPath ?? '/');
      } catch {
        router.replace(returnPath ?? '/');
      }
    },
    [params.returnTo, returnPath, router, segments, value]
  );

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      pointerEvents="box-none"
      style={[styles.root, { paddingTop: insets.top + 8 }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Tillbaka"
        onPress={() => leaveMap('home')}
        hitSlop={12}
        style={[FilterChipTheme.surface, styles.backButton]}
      >
        <Ionicons name="chevron-back" size={28} color={FilterChipTheme.text} />
      </Pressable>

      <View
        style={[
          FilterChipTheme.surface,
          styles.searchBar,
          { height: SEARCH_BAR_HEIGHT },
        ]}
      >
        <Ionicons
          name="search-outline"
          size={18}
          color={FilterChipTheme.textMuted}
          style={styles.searchIcon}
        />
        <View style={styles.inputSlot}>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder="Sök företag"
            placeholderTextColor={FilterChipTheme.placeholder}
            style={[styles.input, { color: FilterChipTheme.text, height: SEARCH_BAR_HEIGHT }]}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Rensa sök"
          onPress={() => onChangeText('')}
          hitSlop={8}
          style={[styles.clearButton, { opacity: trimmed ? 1 : 0 }]}
          pointerEvents={trimmed ? 'auto' : 'none'}
          disabled={!trimmed}
        >
          <Ionicons name="close-circle" size={18} color={FilterChipTheme.textMuted} />
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Visa sök"
        onPress={() => leaveMap('search')}
        style={[
          FilterChipTheme.surface,
          styles.mapButton,
          {
            width: MAP_BUTTON_SIZE,
            height: MAP_BUTTON_SIZE,
          },
        ]}
      >
        <Ionicons name="map" size={20} color={FilterChipTheme.text} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: SIDE_PAD,
    paddingRight: SIDE_PAD,
    gap: MAP_BUTTON_GAP,
  },
  backButton: {
    width: SEARCH_BAR_HEIGHT,
    height: SEARCH_BAR_HEIGHT,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  searchBar: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 14,
  },
  searchIcon: {
    marginRight: 10,
    flexShrink: 0,
  },
  inputSlot: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  input: {
    width: '100%',
    paddingVertical: 0,
    fontSize: 15,
    lineHeight: 20,
    borderWidth: 0,
    ...Platform.select({
      web: {
        outlineStyle: 'none' as const,
      },
      default: {},
    }),
  },
  clearButton: {
    marginLeft: 4,
    padding: 2,
  },
  mapButton: {
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
