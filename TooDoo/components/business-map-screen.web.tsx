import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BusinessMapSearchHeader } from '@/components/ui/business-map-search-header';
import { StackScreenTabBarSync } from '@/components/stack-screen-tab-bar-sync';
import { WebStackSwipeContainer } from '@/components/web-stack-edge-swipe-back';
import {
  MapLibreMapView,
  type MapLibrePin,
  type MapViewportBounds,
} from '@/components/ui/maplibre-map.web';
import { getFloatingTabBarScrollPadding } from '@/components/floating-tab-bar';
import { useThemePreference } from '@/context/theme-preference-context';
import {
  filterBusinessesByQuery,
  filterBusinessesForViewport,
  loadMapBusinesses,
  MAP_DEFAULT_CENTER,
  type MapBusiness,
} from '@/lib/business-map-data';
import { getCategoryAccentColor, OFFERS_CATEGORY_ACCENT } from '@/lib/category-colors';
import { COMPANY_DETAIL_PATH } from '@/lib/detail-navigation';
import { getUserCoords, type Coords } from '@/lib/geo';
import { MAP_PAINT_VERSION } from '@/lib/maplibre-brand';
import { mapShellBackground } from '@/lib/map-style';
import { uiTheme } from '@/lib/ui-theme';

function paramString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

const HELSINGBORG = {
  latitude: MAP_DEFAULT_CENTER.lat,
  longitude: MAP_DEFAULT_CENTER.lng,
};

export default function BusinessMapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const shellBg = mapShellBackground(mode);
  const bottomPad = getFloatingTabBarScrollPadding(insets.bottom);

  const [isLoading, setIsLoading] = useState(true);
  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  const [businesses, setBusinesses] = useState<MapBusiness[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewBounds, setViewBounds] = useState<MapViewportBounds | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => paramString(params.q));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      const coords = await getUserCoords().catch(() => null);
      if (cancelled) return;
      setUserCoords(coords);
      try {
        const mapped = await loadMapBusinesses(coords);
        if (!cancelled) setBusinesses(mapped);
      } catch {
        if (!cancelled) setBusinesses([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => businesses.find((b) => b.id === selectedId) ?? null,
    [businesses, selectedId]
  );

  const matchedBusinesses = useMemo(
    () => filterBusinessesByQuery(businesses, searchQuery),
    [businesses, searchQuery]
  );

  // Businesses load once; pins swap in and out as the viewport moves.
  // Previously shown pins keep their slot while in view (less marker churn).
  const shownIdsRef = useRef<Set<string>>(new Set());
  const visibleBusinesses = useMemo(() => {
    const next = filterBusinessesForViewport(
      matchedBusinesses,
      viewBounds,
      undefined,
      shownIdsRef.current
    );
    shownIdsRef.current = new Set(next.map((b) => b.id));
    return next;
  }, [matchedBusinesses, viewBounds]);

  const pins: MapLibrePin[] = useMemo(
    () =>
      visibleBusinesses.map((b) => ({
        id: b.id,
        latitude: b.latitude,
        longitude: b.longitude,
        title: b.name,
        imageUri: b.imageUri,
        selected: b.id === selectedId,
        hasEvent: Boolean(b.hasEvent),
        hasOffer: Boolean(b.hasOffer),
        color: getCategoryAccentColor(b.categoryName),
      })),
    [visibleBusinesses, selectedId]
  );

  const openCompany = useCallback(
    (company: MapBusiness) => {
      router.push({
        pathname: COMPANY_DETAIL_PATH,
        params: {
          returnTo: 'naradig',
          id: company.id,
          claimBusinessId: company.id,
          title: company.name,
          deal: '1',
          imageUri: company.imageUri ?? '',
          Adress: company.address,
          latitude: String(company.latitude),
          longitude: String(company.longitude),
          kortbeskrivning: company.description ?? '',
          långbeskrivning: company.description ?? '',
          mapResetNonce: `${Date.now()}-${Math.random()}`,
        },
      });
    },
    [router]
  );

  return (
    <WebStackSwipeContainer>
      <View style={[styles.root, { backgroundColor: shellBg }]}>
        <StackScreenTabBarSync />
        <BusinessMapSearchHeader value={searchQuery} onChangeText={setSearchQuery} />

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.text} />
          </View>
        ) : (
          <MapLibreMapView
            key={`explore-${MAP_PAINT_VERSION}`}
            center={HELSINGBORG}
            zoom={12.6}
            pins={pins}
            fitPins={false}
            interactive
            showUserLocation={
              userCoords
                ? { latitude: userCoords.lat, longitude: userCoords.lng }
                : null
            }
            onPinPress={setSelectedId}
            onViewportChange={setViewBounds}
            style={StyleSheet.absoluteFillObject}
          />
        )}

        {!isLoading && matchedBusinesses.length === 0 ? (
          <View style={[styles.emptyBanner, { bottom: bottomPad + 16 }]}>
            <Text style={{ color: theme.text, textAlign: 'center' }}>
              {searchQuery.trim()
                ? 'Inga företag matchar sökningen.'
                : 'Inga företag med plats att visa just nu.'}
            </Text>
          </View>
        ) : null}

        {selected ? (
          <View
            style={[
              styles.card,
              {
                bottom: bottomPad + 12,
                backgroundColor: theme.cardBg,
                borderColor: theme.border,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Avmarkera företag"
              onPress={() => setSelectedId(null)}
              hitSlop={8}
              style={[
                styles.deselectButton,
                {
                  backgroundColor: theme.isDark
                    ? 'rgba(255,255,255,0.12)'
                    : 'rgba(0,0,0,0.06)',
                },
              ]}
            >
              <Ionicons name="close" size={18} color={theme.textMuted} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Öppna ${selected.name}`}
              onPress={() => openCompany(selected)}
              style={styles.cardPressable}
            >
              {selected.imageUri ? (
                <Image source={{ uri: selected.imageUri }} style={styles.cardImage} />
              ) : (
                <View style={[styles.cardImage, { backgroundColor: theme.border }]} />
              )}
              <View style={styles.cardBody}>
                <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                  {selected.name}
                </Text>
                {selected.address ? (
                  <Text style={{ color: theme.textMuted, fontSize: 13 }} numberOfLines={2}>
                    {selected.address}
                  </Text>
                ) : null}
                <Text style={[styles.cardCta, { color: OFFERS_CATEGORY_ACCENT }]}>
                  Visa företag
                </Text>
              </View>
            </Pressable>
          </View>
        ) : null}
      </View>
    </WebStackSwipeContainer>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyBanner: {
    position: 'absolute',
    left: 24,
    right: 24,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(14,19,37,0.88)',
    zIndex: 20,
  },
  attribution: {
    position: 'absolute',
    right: 10,
    zIndex: 20,
    fontSize: 9,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  attributionDark: {
    color: 'rgba(255,255,255,0.7)',
    backgroundColor: 'rgba(14,19,37,0.75)',
  },
  attributionLight: {
    color: 'rgba(0,0,0,0.55)',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    paddingRight: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  deselectButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: 28,
  },
  cardImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
  },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardCta: { marginTop: 4, fontSize: 13, fontWeight: '600' },
});
