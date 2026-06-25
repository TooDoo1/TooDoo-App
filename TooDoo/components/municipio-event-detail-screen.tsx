import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  InteractionManager,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CompanyDetailTabBarSync } from '@/components/company-detail-tab-bar-sync';
import { WebStackSwipeContainer } from '@/components/web-stack-edge-swipe-back';
import { CardMedia } from '@/components/ui/card-media';
import { IMAGE_DISPLAY_WIDTH } from '@/lib/image-url';
import { OfferMap } from '@/components/ui/offer-map';
import { useThemePreference } from '@/context/theme-preference-context';
import { navigateBackFromDetail } from '@/lib/detail-navigation';
import { BrandColors, brandInkRgba, brandNavyRgba } from '@/lib/brand-colors';
import { resolveMapOriginCoords, isPlausibleSwedenCoordinate } from '@/lib/geo';
import {
  fetchMunicipioEventByUrl,
  formatMunicipioEventDateRange,
  type MunicipioEventItem,
} from '@/lib/municipio-events';
import { uiTheme } from '@/lib/ui-theme';

function formatRemaining(milliseconds: number) {
  const totalSeconds = Math.max(Math.floor(milliseconds / 1000), 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((value) => value.toString().padStart(2, '0')).join(':');
}

function getEventRemainingMs(event: MunicipioEventItem, nowMs: number) {
  const startMs = Date.parse(event.startsAt);
  const endMs = Date.parse(event.endsAt);
  if (!Number.isFinite(startMs) && !Number.isFinite(endMs)) return null;
  if (Number.isFinite(startMs) && nowMs < startMs) {
    return Math.max(startMs - nowMs, 0);
  }
  if (Number.isFinite(endMs)) {
    return Math.max(endMs - nowMs, 0);
  }
  return null;
}

export function MunicipioEventDetailScreen() {
  const { mode: themeMode } = useThemePreference();
  const theme = uiTheme(themeMode);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ url?: string | string[]; returnTo?: string | string[] }>();
  const url = Array.isArray(params.url) ? params.url[0] : params.url;
  const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;

  const [event, setEvent] = useState<MunicipioEventItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [nowMs, setNowMs] = useState(Date.now());
  const [mapOriginCoords, setMapOriginCoords] = useState<{ latitude: number; longitude: number } | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!url) {
        setEvent(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const next = await fetchMunicipioEventByUrl(url);
        if (!cancelled) {
          setEvent(next);
        }
      } catch {
        if (!cancelled) {
          setEvent(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const addressText = event?.locationLabel?.trim() || undefined;

  const mapCoordinate = useMemo(() => {
    if (
      event?.latitude != null &&
      event?.longitude != null &&
      isPlausibleSwedenCoordinate(event.latitude, event.longitude)
    ) {
      return { latitude: event.latitude, longitude: event.longitude };
    }
    return undefined;
  }, [event?.latitude, event?.longitude]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const task = InteractionManager.runAfterInteractions(() => {
        void (async () => {
          const coords = await resolveMapOriginCoords();
          if (!cancelled && coords) {
            setMapOriginCoords({ latitude: coords.lat, longitude: coords.lng });
          }
        })();
      });

      return () => {
        cancelled = true;
        task.cancel();
      };
    }, [])
  );

  const when = useMemo(() => (event ? formatMunicipioEventDateRange(event) : null), [event]);
  const eventRemainingMs = event ? getEventRemainingMs(event, nowMs) : null;

  const mapsUrl = mapCoordinate
    ? mapOriginCoords
      ? `https://www.google.com/maps/dir/?api=1&origin=${mapOriginCoords.latitude},${mapOriginCoords.longitude}&destination=${mapCoordinate.latitude},${mapCoordinate.longitude}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${mapCoordinate.latitude},${mapCoordinate.longitude}`
    : addressText
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`
      : undefined;

  const mapResetKey = `${url ?? 'no-url'}-${mapCoordinate?.latitude ?? 'no-lat'}-${mapCoordinate?.longitude ?? 'no-lng'}-${mapOriginCoords ? `${mapOriginCoords.latitude},${mapOriginCoords.longitude}` : 'no-origin'}`;

  const handleDetailBack = useCallback(() => {
    if (Platform.OS === 'web') {
      navigateBackFromDetail(router, returnTo);
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    navigateBackFromDetail(router, returnTo);
  }, [router, returnTo]);

  if (isLoading) {
    return (
      <WebStackSwipeContainer>
        <View style={{ flex: 1, backgroundColor: theme.screenBg, alignItems: 'center', justifyContent: 'center' }}>
          <CompanyDetailTabBarSync />
          <ActivityIndicator color={theme.text} />
        </View>
      </WebStackSwipeContainer>
    );
  }

  if (!event) {
    return (
      <WebStackSwipeContainer>
        <View style={{ flex: 1, backgroundColor: theme.screenBg }}>
          <CompanyDetailTabBarSync />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tillbaka"
            onPress={handleDetailBack}
            style={{
              position: 'absolute',
              top: insets.top + 8,
              left: 16,
              zIndex: 30,
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.isDark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.82)',
            }}
          >
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </Pressable>
          <View
            className="flex-1 items-center justify-center px-8"
            style={{ paddingTop: insets.top + 56 }}
          >
            <Text style={{ color: theme.textMuted, textAlign: 'center' }}>
              Evenemanget kunde inte hittas.
            </Text>
          </View>
        </View>
      </WebStackSwipeContainer>
    );
  }

  return (
    <WebStackSwipeContainer>
      <View style={{ flex: 1, backgroundColor: theme.screenBg }}>
        <CompanyDetailTabBarSync />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tillbaka"
          onPress={handleDetailBack}
          style={{
            position: 'absolute',
            top: insets.top + 8,
            left: 16,
            zIndex: 30,
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.isDark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.82)',
          }}
        >
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>

        <ScrollView
          className="flex-1"
          style={{ backgroundColor: theme.screenBg }}
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {event.image ? (
            <View className="relative h-72 w-full overflow-hidden rounded-xl">
              <CardMedia
                source={event.image}
                rasterResizeMode="cover"
                svgFit="contain"
                priority="high"
                displayWidth={IMAGE_DISPLAY_WIDTH.hero}
              />
              <LinearGradient
                colors={
                  themeMode === 'dark'
                    ? [brandNavyRgba(0), BrandColors.dark.background]
                    : [brandInkRgba(0), BrandColors.light.background]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 96,
                }}
              />
            </View>
          ) : null}

          <Text className="mt-4 px-6 text-3xl font-semibold" style={{ color: theme.text }}>
            {event.title}
          </Text>

          {addressText ? (
            <Text className="mt-3 px-6 text-base" style={{ color: theme.text }}>
              Adress: {addressText}
            </Text>
          ) : null}

          {mapsUrl ? (
            <View className="m-2 mt-4 flex-row items-center gap-3 overflow-hidden rounded-2xl p-4">
              <Pressable
                className="flex-1 flex-row items-center justify-center rounded-full px-6 py-2.5"
                style={{ backgroundColor: theme.isDark ? '#ffffff' : theme.cardBg }}
                onPress={() => Linking.openURL(mapsUrl)}
              >
                <Ionicons
                  name="location-outline"
                  size={18}
                  color={theme.isDark ? BrandColors.dark.background : theme.text}
                  style={{ marginRight: 6 }}
                />
                <Text
                  className="text-sm font-medium"
                  style={{ color: theme.isDark ? BrandColors.dark.background : theme.text }}
                >
                  Hitta hit
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View className="mt-2">
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 4 }}
            >
              <View
                className="mr-3 w-[320px] rounded-2xl p-4"
                style={{ backgroundColor: theme.cardBg }}
              >
                <View className="flex-row gap-4">
                  <View
                    className="relative h-28 w-28 overflow-hidden rounded-xl"
                    style={{ backgroundColor: theme.cardBgMuted }}
                  >
                    {event.image ? (
                      <CardMedia
                        source={event.image}
                        rasterResizeMode="cover"
                        svgFit="contain"
                        priority="low"
                        displayWidth={IMAGE_DISPLAY_WIDTH.thumb}
                      />
                    ) : null}
                    <View
                      className="absolute left-2 top-2 rounded-[10px] px-2.5 py-1"
                      style={{ backgroundColor: theme.eventColor }}
                    >
                      <Text className="text-[11px] font-semibold text-white">Event</Text>
                    </View>
                    <LinearGradient
                      colors={[brandNavyRgba(0), brandNavyRgba(0.9)]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 40,
                      }}
                    />
                    <View
                      className="absolute bottom-1 left-2 rounded-full border px-2 py-1"
                      style={{
                        backgroundColor: theme.isDark ? 'rgba(0,0,0,0.6)' : brandInkRgba(0.06),
                        borderColor: theme.isDark ? 'rgba(255,255,255,0.15)' : theme.border,
                      }}
                    >
                      <Text className="text-[10px] font-medium" style={{ color: theme.text }}>
                        {eventRemainingMs != null ? formatRemaining(eventRemainingMs) : '--:--:--'}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-1 justify-center">
                    <Text style={{ color: theme.textMuted }}>{event.title}</Text>
                    <Text className="mt-1 text-sm" style={{ color: theme.text }}>
                      {when ?? '-'}
                    </Text>
                    {addressText ? (
                      <Text className="mt-1 text-xs" style={{ color: theme.textMuted }} numberOfLines={2}>
                        {addressText}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>

          {event.description ? (
            <View className="mx-6 mt-6 overflow-hidden rounded-2xl p-4" style={{ backgroundColor: theme.cardBg }}>
              <Text className="text-xl font-semibold" style={{ color: theme.text }}>
                Om evenemanget:
              </Text>
              <Text className="mt-2" style={{ color: theme.textMuted }}>
                {event.description}
              </Text>
            </View>
          ) : null}

          {addressText ? (
            <View className="mx-6 mb-2 mt-6">
              <Text className="mb-2 ml-4 text-xl font-medium" style={{ color: theme.text }}>
                Hitta hit:
              </Text>
              <View className="overflow-hidden rounded-2xl border" style={{ borderColor: theme.border }}>
                <OfferMap
                  mapKey={mapResetKey}
                  latitude={mapCoordinate?.latitude ?? Number.NaN}
                  longitude={mapCoordinate?.longitude ?? Number.NaN}
                  title={event.title}
                  addressText={addressText}
                  originLatitude={mapOriginCoords?.latitude}
                  originLongitude={mapOriginCoords?.longitude}
                />
              </View>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </WebStackSwipeContainer>
  );
}
