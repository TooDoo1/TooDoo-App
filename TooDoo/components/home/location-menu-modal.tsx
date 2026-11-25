import { memo, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated from 'react-native-reanimated';

import { HOME_PAGE_PAD } from '@/components/home/home-feed';
import { useThemePreference } from '@/context/theme-preference-context';
import { geocodeAddressCached, peekGeocodeCache } from '@/lib/geo';
import { staticCoordsForCity } from '@/lib/sweden-city-coords';
import { SWEDEN_REGIONS, findLanByName, geocodeQueryForCity } from '@/lib/sweden-regions';
import { uiTheme } from '@/lib/ui-theme';

type LocationMenuModalProps = {
  mounted: boolean;
  headerInset: number;
  /** Reanimated styles driven by the parent's open/close progress. */
  backdropStyle: StyleProp<ViewStyle>;
  dropdownStyle: StyleProp<ViewStyle>;
  selectedLan: string | null;
  selectedCity: string | null;
  picking: boolean;
  onClose: () => void;
  onSelectCity: (lan: string, city: string) => void;
};

type LocationMenuContentProps = Omit<LocationMenuModalProps, 'mounted'>;

/**
 * Län → city picker. The drill-down state (which län is open) lives here so tapping a row
 * re-renders only this menu, not the whole home screen. Content mounts per open, so the
 * state resets to the currently selected län each time.
 */
function LocationMenuContent({
  headerInset,
  backdropStyle,
  dropdownStyle,
  selectedLan,
  selectedCity,
  picking,
  onClose,
  onSelectCity,
}: LocationMenuContentProps) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const [openLan, setOpenLan] = useState<string | null>(selectedLan);

  const cities = useMemo(() => {
    if (!openLan) return [];
    return findLanByName(openLan)?.cities ?? [];
  }, [openLan]);

  // Prefetch coords for the rare picker city without bundled coordinates.
  useEffect(() => {
    if (!openLan) return;
    const missing = (findLanByName(openLan)?.cities ?? []).filter(
      (city) => !staticCoordsForCity(openLan, city)
    );
    if (missing.length === 0) return;

    let cancelled = false;
    const queue = [...missing];
    const workers = Math.min(3, queue.length);

    const runWorker = async () => {
      while (!cancelled && queue.length > 0) {
        const city = queue.shift();
        if (!city) return;
        const query = geocodeQueryForCity(openLan, city);
        if (peekGeocodeCache(query)) continue;
        await geocodeAddressCached(query);
      }
    };

    void Promise.all(Array.from({ length: workers }, () => runWorker()));
    return () => {
      cancelled = true;
    };
  }, [openLan]);

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Reanimated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Stäng platsmeny"
        />
      </Reanimated.View>
      <Reanimated.View
        style={[
          styles.dropdown,
          {
            paddingTop: headerInset + 8,
            backgroundColor: theme.isDark ? '#152847' : '#d4e4f5',
            borderBottomColor: theme.isDark ? 'rgba(255,255,255,0.14)' : 'rgba(19,23,32,0.12)',
          },
          dropdownStyle,
        ]}
      >
        <View style={styles.headerRow}>
          {openLan ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tillbaka till län"
              onPress={() => setOpenLan(null)}
              hitSlop={8}
              style={styles.back}
            >
              <Ionicons name="chevron-back" size={18} color={theme.text} />
            </Pressable>
          ) : null}
          <Text style={[styles.title, { color: theme.text }]}>
            {openLan ? 'Välj stad' : 'Välj län'}
          </Text>
          {picking ? (
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>Hämtar...</Text>
          ) : null}
        </View>
        <ScrollView
          style={styles.list}
          contentContainerStyle={{ paddingBottom: 12 }}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          {openLan
            ? cities.map((city) => {
                const selected = selectedLan === openLan && selectedCity === city;
                return (
                  <Pressable
                    key={city}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    disabled={picking}
                    onPress={() => onSelectCity(openLan, city)}
                    style={styles.row}
                  >
                    <Ionicons
                      name="location-outline"
                      size={18}
                      color={selected ? theme.primary : theme.textMuted}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.rowLabel,
                        {
                          color: selected ? theme.text : theme.textMuted,
                          fontWeight: selected ? '700' : '500',
                        },
                      ]}
                    >
                      {city}
                    </Text>
                    {selected ? <Ionicons name="checkmark" size={18} color={theme.primary} /> : null}
                  </Pressable>
                );
              })
            : SWEDEN_REGIONS.map((lan) => {
                const selected = selectedLan === lan.name;
                return (
                  <Pressable
                    key={lan.name}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setOpenLan(lan.name)}
                    style={styles.row}
                  >
                    <Ionicons
                      name="map-outline"
                      size={18}
                      color={selected ? theme.primary : theme.textMuted}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.rowLabel,
                        {
                          color: selected ? theme.text : theme.textMuted,
                          fontWeight: selected ? '700' : '500',
                        },
                      ]}
                    >
                      {lan.name}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={theme.textFaint} />
                  </Pressable>
                );
              })}
        </ScrollView>
      </Reanimated.View>
    </View>
  );
}

function LocationMenuModalComponent({ mounted, onClose, ...rest }: LocationMenuModalProps) {
  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      {mounted ? <LocationMenuContent onClose={onClose} {...rest} /> : null}
    </Modal>
  );
}

export const LocationMenuModal = memo(LocationMenuModalComponent);

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 15, 28, 0.35)',
  },
  dropdown: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: HOME_PAGE_PAD,
    maxHeight: '58%',
    overflow: 'hidden',
    // web transform-origin for scaleY dropdown feel
    transformOrigin: 'top center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    minHeight: 28,
  },
  back: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -6,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 2,
  },
  rowLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    letterSpacing: -0.2,
  },
});
