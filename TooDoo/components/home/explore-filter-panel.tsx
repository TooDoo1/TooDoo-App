import { type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { HOME_PAGE_PAD } from '@/components/home/home-feed';
import { useThemePreference } from '@/context/theme-preference-context';
import { ALL_CATEGORIES_ID } from '@/lib/category-filters';
import { uiTheme } from '@/lib/ui-theme';

export type ExploreSortMode = 'mixed' | 'near' | 'name' | 'deals';
export type ExploreDistanceKm = null | 2 | 5 | 10;

export type ExploreFilterState = {
  sort: ExploreSortMode;
  openNow: boolean;
  dealsOnly: boolean;
  maxDistanceKm: ExploreDistanceKm;
  categoryId: string;
  subcategoryId: string | null;
};

export const DEFAULT_EXPLORE_FILTERS: ExploreFilterState = {
  sort: 'mixed',
  openNow: false,
  dealsOnly: false,
  maxDistanceKm: null,
  categoryId: ALL_CATEGORIES_ID,
  subcategoryId: null,
};

type SubcategoryChip = { id: string; name: string };

const SORT_OPTIONS: Array<{
  id: ExploreSortMode;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
}> = [
  { id: 'mixed', label: 'Blandat', icon: 'shuffle-outline' },
  { id: 'near', label: 'Närmast', icon: 'navigate-outline' },
  { id: 'name', label: 'A–Ö', icon: 'text-outline' },
  { id: 'deals', label: 'Deals', icon: 'pricetag-outline' },
];

const DISTANCE_OPTIONS: Array<{ id: Exclude<ExploreDistanceKm, null>; label: string }> = [
  { id: 2, label: '2 km' },
  { id: 5, label: '5 km' },
  { id: 10, label: '10 km' },
];

function CompactChip({
  label,
  icon,
  selected,
  onPress,
  accent,
}: {
  label: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  selected: boolean;
  onPress: () => void;
  accent?: string;
}) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const activeColor = accent ?? theme.primary;
  const ink = selected ? theme.text : theme.textFaint;
  const iconColor = selected ? activeColor : theme.textFaint;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: 'transparent',
          borderBottomWidth: 2,
          borderBottomColor: selected ? activeColor : 'transparent',
        },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={14} color={iconColor} style={{ marginRight: 5 }} />
      ) : null}
      <Text
        style={[
          styles.chipText,
          {
            color: ink,
            fontWeight: selected ? '700' : '500',
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ExploreFilterPanel({
  value,
  subcategories,
  onChange,
  sticky = false,
}: {
  value: ExploreFilterState;
  subcategories: SubcategoryChip[];
  onChange: (next: ExploreFilterState) => void;
  /** Compact bar meant to sit under the home kategori chips. */
  sticky?: boolean;
}) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);

  const patch = (partial: Partial<ExploreFilterState>) => {
    onChange({ ...value, ...partial });
  };

  const activeCount =
    (value.openNow ? 1 : 0) +
    (value.dealsOnly ? 1 : 0) +
    (value.maxDistanceKm != null ? 1 : 0) +
    (value.subcategoryId ? 1 : 0) +
    (value.sort !== 'mixed' ? 1 : 0);

  const pad = sticky ? HOME_PAGE_PAD : undefined;

  return (
    <View style={[styles.root, sticky ? styles.rootSticky : null]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.hScroll}
        contentContainerStyle={[
          styles.hScrollContent,
          pad != null ? { paddingHorizontal: pad } : null,
        ]}
      >
        {SORT_OPTIONS.map((option) => (
          <CompactChip
            key={option.id}
            label={option.label}
            icon={option.icon}
            selected={value.sort === option.id}
            onPress={() => patch({ sort: option.id })}
            accent={theme.primary}
          />
        ))}
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <CompactChip
          label="Öppet"
          icon="time-outline"
          selected={value.openNow}
          onPress={() => patch({ openNow: !value.openNow })}
        />
        <CompactChip
          label="Deals"
          icon="pricetag-outline"
          selected={value.dealsOnly}
          onPress={() => patch({ dealsOnly: !value.dealsOnly })}
        />
        {DISTANCE_OPTIONS.map((option) => (
          <CompactChip
            key={String(option.id)}
            label={option.label}
            icon="locate-outline"
            selected={value.maxDistanceKm === option.id}
            onPress={() =>
              patch({
                maxDistanceKm: value.maxDistanceKm === option.id ? null : option.id,
              })
            }
          />
        ))}
        {activeCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Rensa filter"
            onPress={() =>
              onChange({
                ...DEFAULT_EXPLORE_FILTERS,
                // Keep top kategori selection — only clear explore controls.
                categoryId: value.categoryId,
              })
            }
            hitSlop={8}
            style={styles.clearBtn}
          >
            <Text style={[styles.clearText, { color: theme.primary }]}>Rensa</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {subcategories.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={[styles.hScroll, { marginTop: 6 }]}
          contentContainerStyle={[
            styles.hScrollContent,
            pad != null ? { paddingHorizontal: pad } : null,
          ]}
        >
          {subcategories.map((sub) => (
            <CompactChip
              key={sub.id}
              label={sub.name}
              selected={value.subcategoryId === sub.id}
              onPress={() =>
                patch({
                  subcategoryId: value.subcategoryId === sub.id ? null : sub.id,
                })
              }
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: 8,
    marginHorizontal: -HOME_PAGE_PAD,
    paddingHorizontal: HOME_PAGE_PAD,
  },
  rootSticky: {
    marginTop: 0,
    marginHorizontal: 0,
    paddingHorizontal: 0,
    paddingBottom: 0,
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
  },
  hScroll: {
    flexGrow: 0,
    width: '100%',
    alignSelf: 'stretch',
  },
  hScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingRight: 16,
    flexGrow: 1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  chipText: {
    fontSize: 13,
    letterSpacing: -0.15,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 16,
    marginHorizontal: 4,
  },
  clearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  clearText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
});
