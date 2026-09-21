import { useCallback } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilterChipTheme } from '@/lib/brand-colors';
import { requestOpenHomeSearch } from '@/lib/home-search-handoff';
import { performWebStackBack } from '@/lib/web-stack-navigation';

const SEARCH_BAR_HEIGHT = 44;
const MAP_BUTTON_SIZE = SEARCH_BAR_HEIGHT;
const MAP_BUTTON_GAP = 8;

type BusinessMapSearchHeaderProps = {
  value: string;
  onChangeText: (text: string) => void;
};

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
  const trimmed = value.trim();

  const goBack = useCallback(() => {
    if (Platform.OS === 'web') {
      const topSegment = segments[segments.length - 1];
      performWebStackBack(router, {
        isCompanyDetail: topSegment === 'company-detail',
        topSegment,
      });
      return;
    }
    router.back();
  }, [router, segments]);

  const exitToSearchMode = useCallback(() => {
    requestOpenHomeSearch(value);
    try {
      router.dismissTo('/');
    } catch {
      router.replace('/');
    }
  }, [router, value]);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.root, { paddingTop: insets.top + 8 }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Tillbaka"
        onPress={goBack}
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
        onPress={exitToSearchMode}
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
    </View>
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
    paddingLeft: 4,
    paddingRight: 12,
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
