import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useThemePreference } from '@/context/theme-preference-context';
import {
  ALL_CATEGORIES_ID,
  buildQuickCategoryChips,
  cachedCategoryFilters,
  loadCategoryFilterChips,
  type CategoryFilterItem,
} from '@/lib/category-filters';
import {
  getCategoryAccentColor,
  getOnAccentTextColor,
} from '@/lib/category-colors';
import { uiTheme } from '@/lib/ui-theme';

export function CategoryFilterBar({
  selectedId,
  onSelect,
  bleed = 24,
}: {
  selectedId: string;
  onSelect: (id: string, label?: string) => void;
  bleed?: number;
}) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const [chips, setChips] = useState<CategoryFilterItem[]>(() =>
    buildQuickCategoryChips(cachedCategoryFilters())
  );

  useEffect(() => {
    let cancelled = false;
    void loadCategoryFilterChips().then((next) => {
      if (!cancelled && next.length > 0) setChips(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(() => chips, [chips]);
  if (items.length === 0) return null;

  return (
    <View style={{ marginHorizontal: -bleed, marginTop: 14 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: bleed }}
      >
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {items.map((cat) => {
            const isSelected = selectedId === cat.id;
            const chipColor = getCategoryAccentColor(cat.label);
            const chipTextColor = getOnAccentTextColor(isSelected ? chipColor : theme.text);
            return (
              <Pressable
                key={cat.id}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={cat.label}
                onPress={() => {
                  const nextId =
                    selectedId === cat.id && cat.id !== ALL_CATEGORIES_ID
                      ? ALL_CATEGORIES_ID
                      : cat.id;
                  onSelect(
                    nextId,
                    nextId === ALL_CATEGORIES_ID ? undefined : cat.label
                  );
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderRadius: 10,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderWidth: 1,
                  backgroundColor: isSelected ? chipColor : 'transparent',
                  borderColor: isSelected ? chipColor : theme.border,
                }}
              >
                <Ionicons
                  name={cat.icon}
                  size={14}
                  color={isSelected ? chipTextColor : theme.textMuted}
                />
                <Text
                  style={{
                    marginLeft: 6,
                    fontSize: 12,
                    fontWeight: '700',
                    color: isSelected ? chipTextColor : theme.text,
                  }}
                >
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

export { ALL_CATEGORIES_ID };
