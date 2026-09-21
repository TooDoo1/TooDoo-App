import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBackButton } from '@/components/ui/screen-back-button';
import { StackScreenTabBarSync } from '@/components/stack-screen-tab-bar-sync';
import { WebStackSwipeContainer } from '@/components/web-stack-edge-swipe-back';
import { MapLibreMapView, type MapLibrePin } from '@/components/ui/maplibre-map.web';
import { getFloatingTabBarScrollPadding } from '@/components/floating-tab-bar';
import { useThemePreference } from '@/context/theme-preference-context';
import {
  loadMapBusinesses,
  type MapBusiness,
} from '@/lib/business-map-data';
import { getCategoryAccentColor, OFFERS_CATEGORY_ACCENT } from '@/lib/category-colors';
import { COMPANY_DETAIL_PATH } from '@/lib/detail-navigation';
import { getUserCoords, type Coords } from '@/lib/geo';
import { MAP_PAINT_VERSION } from '@/lib/maplibre-brand';
import { mapShellBackground } from '@/lib/map-style';
import { uiTheme } from '@/lib/ui-theme';

const HELSINGBORG = { latitude: 56.0465, longitude: 12.6945 };

export default function BusinessMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const shellBg = mapShellBackground(mode);
  const bottomPad = getFloatingTabBarScrollPadding(insets.bottom);

  const [isLoading, setIsLoading] = useState(true);
  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  const [businesses, setBusinesses] = useState<MapBusiness[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const center = useMemo(() => {
    if (userCoords) return { latitude: userCoords.lat, longitude: userCoords.lng };
    if (businesses[0]) {
      return { latitude: businesses[0].latitude, longitude: businesses[0].longitude };
    }
    return HELSINGBORG;
  }, [businesses, userCoords]);

  const pins: MapLibrePin[] = useMemo(
    () =>
      businesses.map((b) => ({
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
    [businesses, selectedId]
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
        <ScreenBackButton />

        <View pointerEvents="none" style={[styles.titleWrap, { top: insets.top + 10 }]}>
          <Text style={[styles.title, { color: theme.text }]}>Karta</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>
            Företag nära dig
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.text} />
          </View>
        ) : (
          <MapLibreMapView
            key={`explore-${MAP_PAINT_VERSION}`}
            center={center}
            zoom={12.5}
            pins={pins}
            fitPins
            interactive
            showUserLocation={
              userCoords
                ? { latitude: userCoords.lat, longitude: userCoords.lng }
                : null
            }
            onPinPress={setSelectedId}
            style={StyleSheet.absoluteFillObject}
          />
        )}

        {!isLoading && businesses.length === 0 ? (
          <View style={[styles.emptyBanner, { bottom: bottomPad + 16 }]}>
            <Text style={{ color: theme.text, textAlign: 'center' }}>
              Inga företag med plats att visa just nu.
            </Text>
          </View>
        ) : null}

        {selected ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Öppna ${selected.name}`}
            onPress={() => openCompany(selected)}
            style={[
              styles.card,
              {
                bottom: bottomPad + 12,
                backgroundColor: theme.cardBg,
                borderColor: theme.border,
              },
            ]}
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
        ) : null}
      </View>
    </WebStackSwipeContainer>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titleWrap: {
    position: 'absolute',
    left: 64,
    right: 24,
    zIndex: 20,
  },
  title: { fontSize: 22, fontWeight: '600' },
  subtitle: { marginTop: 2, fontSize: 13 },
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
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
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
