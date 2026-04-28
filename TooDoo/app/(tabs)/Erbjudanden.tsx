import { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Alert,
  Animated,
  Image,
  ImageSourcePropType,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Button } from "@react-navigation/elements";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { Image as ExpoImage } from "expo-image";
import { useAuth } from "@/context/auth-context";
import { apiUrl } from "@/lib/api";

const skanetrafikenLogo = require("../../assets/images/Skanetrafiken.png");
const voiLogo = require("../../assets/images/Voi.png");
const uberLogo = require("../../assets/images/Uber.png");

const localImagesById: Record<string, ImageSourcePropType> = {
  "event-3": require("../../assets/images/testbild.jpg"),
};

export default function ErbjudandenScreen() {
  const router = useRouter();
  const { isLoggedIn, token } = useAuth();
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimedOrderIds, setClaimedOrderIds] = useState<Set<string>>(new Set());
  const [geocodedCoordinate, setGeocodedCoordinate] = useState<{ latitude: number; longitude: number; addressText?: string }>();
  const [nowMs, setNowMs] = useState(Date.now());
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState<{ title?: string; qrCode?: string } | null>(null);
  const {
    mapResetNonce,
    id,
    title,
    deal,
    imageUri,
    Adress,
    latitude,
    longitude,
    Telefon,
    Website,
    kortbeskrivning,
    långbeskrivning,
    erbjudande,
    claimOrderId,
    claimBusinessId,
    orderIds,
    erbjudandepris,
    erbjudandeoriginalpris,
    erbjudandeclaimade,
    erbjudandemängd,
    erbjudandelängd,
  } = useLocalSearchParams<{
    mapResetNonce?: string;
    id?: string;
    title?: string;
    deal?: string;
    imageUri?: string;
    Adress?: string;
    latitude?: string;
    longitude?: string;
    Telefon?: string;
    Website?: string;
    kortbeskrivning?: string;
    långbeskrivning?: string;
    erbjudande?: string;
    claimOrderId?: string;
    claimBusinessId?: string;
    orderIds?: string;
    erbjudandepris?: string;
    erbjudandeoriginalpris?: string;
    erbjudandeclaimade?: string;
    erbjudandemängd?: string;
    erbjudandelängd?: string;
  }>();

  const imageSource = imageUri
    ? { uri: imageUri }
    : id
      ? localImagesById[id]
      : undefined;
  const websiteUrl = Array.isArray(Website) ? Website[0] : Website;
  const rawAddressText = Array.isArray(Adress) ? Adress[0] : Adress;
  const addressText = rawAddressText?.trim() ? rawAddressText.trim() : undefined;
  const phoneText = Array.isArray(Telefon) ? Telefon[0] : Telefon;
  const dealFlag = Array.isArray(deal) ? deal[0] : deal;
  const resetNonceText = Array.isArray(mapResetNonce) ? mapResetNonce[0] : mapResetNonce;

  const latitudeParam = Array.isArray(latitude) ? latitude[0] : latitude;
  const longitudeParam = Array.isArray(longitude) ? longitude[0] : longitude;
  const paramLatitude = latitudeParam !== undefined ? Number(latitudeParam) : NaN;
  const paramLongitude = longitudeParam !== undefined ? Number(longitudeParam) : NaN;
  const paramCoordinate =
    Number.isFinite(paramLatitude) && Number.isFinite(paramLongitude)
      ? { latitude: paramLatitude, longitude: paramLongitude }
      : undefined;

  const toParamList = (value?: string | string[]) => {
    if (!value) {
      return [] as string[];
    }

    const rawValues = Array.isArray(value) ? value : [value];

    return rawValues.flatMap((raw) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        return [];
      }

      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed.map((item) => String(item));
          }
        } catch {
          return [trimmed];
        }
      }

      return [trimmed];
    });
  };

  const offerTexts = toParamList(erbjudande);
  const offerOrderIds = toParamList(orderIds);
  const claimOrderIdText = Array.isArray(claimOrderId) ? claimOrderId[0] : claimOrderId;
  const claimBusinessIdText = Array.isArray(claimBusinessId) ? claimBusinessId[0] : claimBusinessId;
  const businessIdFromIdParam = Array.isArray(id) ? id[0] : id;
  const offerPriceTexts = toParamList(erbjudandepris);
  const offerOriginalPriceTexts = toParamList(erbjudandeoriginalpris);
  const offerClaimedTexts = toParamList(erbjudandeclaimade);
  const offerAmountTexts = toParamList(erbjudandemängd);
  const offerEndTexts = toParamList(erbjudandelängd);
  const claimWobbleValue = useMemo(() => new Animated.Value(0), []);
  const claimWobbleRotate = claimWobbleValue.interpolate({
    inputRange: [-1, 1],
    outputRange: ["-2deg", "2deg"],
  });

  const offers = useMemo(() => {
    const maxLength = Math.max(
      offerTexts.length,
    offerOrderIds.length,
      offerPriceTexts.length,
      offerOriginalPriceTexts.length,
      offerClaimedTexts.length,
      offerAmountTexts.length,
      offerEndTexts.length
    );

    if (maxLength === 0) {
      return [];
    }

    const parsedOffers = Array.from({ length: maxLength }, (_, index) => {
      const text = offerTexts[index] ?? offerTexts[0];
      const orderId = offerOrderIds[index] ?? offerOrderIds[0] ?? claimOrderIdText;
      const priceText = offerPriceTexts[index] ?? offerPriceTexts[0];
      const originalPriceText = offerOriginalPriceTexts[index] ?? offerOriginalPriceTexts[0];
      const claimedText = offerClaimedTexts[index] ?? offerClaimedTexts[0];
      const amountText = offerAmountTexts[index] ?? offerAmountTexts[0];
      const endText = offerEndTexts[index] ?? offerEndTexts[0];
      const claimedCount = Number(claimedText ?? 0);
      const totalCount = Number(amountText ?? 0);
      const progressPercent = totalCount > 0 ? Math.min((claimedCount / totalCount) * 100, 100) : 0;
      const parsedEndDate = endText ? new Date(endText) : undefined;
      const endDate = parsedEndDate && Number.isFinite(parsedEndDate.getTime()) ? parsedEndDate : undefined;
      const timeLeftMs = endDate ? Math.max(endDate.getTime() - nowMs, 0) : 0;

      return {
        id: `${index}-${text ?? "offer"}`,
        orderId,
        text,
        priceText,
        originalPriceText,
        claimedCount,
        totalCount,
        progressPercent,
        endDate,
        timeLeftMs,
      };
    })
      .filter((offer) => offer.text || offer.priceText || offer.originalPriceText || offer.totalCount > 0 || offer.endDate)
      // Hide offers that have expired (gått ut).
      .filter((offer) => !offer.endDate || offer.endDate.getTime() > nowMs);
    return parsedOffers;
  }, [offerTexts, offerOrderIds, claimOrderIdText, offerPriceTexts, offerOriginalPriceTexts, offerClaimedTexts, offerAmountTexts, offerEndTexts, nowMs, dealFlag]);

  const isDuplicateClaimConflict = (message: string) => {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('already claimed') ||
      normalized.includes('already claim') ||
      normalized.includes('already exists') ||
      normalized.includes('redan claim') ||
      normalized.includes('redan registrerad')
    );
  };

  const extractClaimedOrderIds = (payload: any) => {
    const claims = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.claims)
        ? payload.claims
        : Array.isArray(payload?.data)
          ? payload.data
          : [];

    const ids = new Set<string>();
    claims.forEach((claim: any) => {
      const orderId = typeof claim?.orderId === 'string'
        ? claim.orderId
        : claim?.orderId?.id ?? claim?.orderId?._id ?? claim?.order?.id ?? claim?.order?._id;

      if (orderId) {
        ids.add(String(orderId));
      }
    });

    return ids;
  };

  const getApiErrorMessage = (payload: any, status: number) => {
    const directMessage =
      payload?.message ??
      (typeof payload?.error === 'string' ? payload.error : undefined) ??
      payload?.error?.message ??
      payload?.details?.message ??
      (Array.isArray(payload?.details)
        ? payload.details
            .map((item: any) => item?.message ?? item?.field ?? String(item))
            .filter(Boolean)
            .join(', ')
        : undefined) ??
      (Array.isArray(payload?.errors) ? payload.errors.map((item: any) => item?.message ?? String(item)).filter(Boolean).join(', ') : undefined);

    if (typeof directMessage === 'string' && directMessage.trim()) {
      return directMessage;
    }

    return `Kunde inte claima erbjudandet (${status})`;
  };

  const getApiErrorDetails = (payload: any, fallbackText: string) => {
    const detailParts: string[] = [];

    const reason = payload?.reason;
    if (reason) {
      detailParts.push(`Reason: ${String(reason)}`);
    }

    const code = payload?.code ?? payload?.errorCode ?? payload?.error?.code;
    if (code) {
      detailParts.push(`Kod: ${String(code)}`);
    }

    const detailsMessage =
      payload?.details?.message ??
      (typeof payload?.details === 'string' ? payload.details : undefined);
    if (detailsMessage) {
      detailParts.push(`Detalj: ${String(detailsMessage)}`);
    }

    if (Array.isArray(payload?.details) && payload.details.length > 0) {
      const detailsText = payload.details
        .map((item: any) => {
          const field = item?.field ? `${item.field}: ` : '';
          const message = item?.message ?? item?.msg ?? String(item);
          return `${field}${message}`;
        })
        .filter(Boolean)
        .join(', ');

      if (detailsText) {
        detailParts.push(`Detaljer: ${detailsText}`);
      }
    }

    if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
      const errorsText = payload.errors
        .map((item: any) => item?.message ?? item?.msg ?? String(item))
        .filter(Boolean)
        .join(', ');

      if (errorsText) {
        detailParts.push(`Fältfel: ${errorsText}`);
      }
    }

    if (detailParts.length === 0 && fallbackText.trim()) {
      detailParts.push(`Svar: ${fallbackText.trim().slice(0, 220)}`);
    }

    return detailParts.join('\n');
  };

  const getOrderNotClaimableMessage = (order: any) => {
    if (!order) {
      return 'Ordern går inte att claima just nu.';
    }

    if (order?.isActive === false) {
      return 'Ordern är inaktiv.';
    }

    const now = Date.now();
    const startValue = order?.validFrom ?? order?.orderTimeFrom;
    const endValue = order?.validTo ?? order?.orderTimeTo;
    const startMs = startValue ? new Date(startValue).getTime() : NaN;
    const endMs = endValue ? new Date(endValue).getTime() : NaN;

    if (Number.isFinite(startMs) && now < startMs) {
      return 'Ordern har inte startat ännu.';
    }

    if (Number.isFinite(endMs) && now > endMs) {
      return 'Ordern har gått ut.';
    }

    const maxRedemptions = Number(order?.maxRedemptions ?? 0);
    const claimedCount = Number(order?.claimedCount ?? 0);
    if (maxRedemptions > 0 && Number.isFinite(claimedCount) && claimedCount >= maxRedemptions) {
      return 'Ordern är fullclaimad (max antal uppnått).';
    }

    return 'Ordern går inte att claima just nu.';
  };

  const claimOffer = async (offer: (typeof offers)[number]) => {
    if (!isLoggedIn) {
      setIsLoginOpen(true);
      return;
    }

    if (!token) {
      Alert.alert('Fel', 'Du måste vara inloggad för att claima erbjudandet.');
      return;
    }

    if (!offer.orderId) {
      Alert.alert('Fel', 'Saknar order-id för det här erbjudandet.');
      return;
    }

    if (claimedOrderIds.has(offer.orderId)) {
      Alert.alert('Redan claimad', 'Du har redan claimat det här erbjudandet.');
      return;
    }

    setIsClaiming(true);

    try {
      const orderResponse = await fetch(apiUrl(`/orders/${encodeURIComponent(offer.orderId)}`));
      const orderPayload = await orderResponse.json().catch(() => ({}));
      const order = orderPayload?.order ?? orderPayload?.data ?? orderPayload;

      const claimPayload: { orderId: string } = {
        orderId: offer.orderId,
      };

      const response = await fetch(apiUrl('/claim'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(claimPayload),
      });

      const responseText = await response.text();
      let payload: any = {};
      const requestId = response.headers.get('x-request-id') ?? response.headers.get('x-correlation-id');

      if (responseText) {
        try {
          payload = JSON.parse(responseText);
        } catch {
          payload = { message: responseText };
        }
      }

      if (!response.ok) {
        const message = getApiErrorMessage(payload, response.status);
        const details = getApiErrorDetails(payload, responseText);
        const contextLines = [
          `HTTP ${response.status}`,
          `orderId: ${offer.orderId}`,
          requestId ? `requestId: ${requestId}` : undefined,
          details || undefined,
        ].filter(Boolean);

        if (response.status === 401 || response.status === 403) {
          Alert.alert(
            'Sessionen har gått ut',
            `Logga in igen för att claima erbjudanden.\n\n${contextLines.join('\n')}`
          );
          return;
        }

        if (response.status === 409 && offer.orderId && isDuplicateClaimConflict(String(message))) {
          setClaimedOrderIds((prev) => {
            const next = new Set(prev);
            next.add(offer.orderId as string);
            return next;
          });
          Alert.alert('Redan claimad', `${String(message)}\n\n${contextLines.join('\n')}`);
          return;
        }

        if (response.status === 409 && String(payload?.reason ?? '') === 'ORDER_NOT_CLAIMABLE') {
          const notClaimableMessage = getOrderNotClaimableMessage(order);
          Alert.alert(
            'Kunde inte claima',
            `${notClaimableMessage}\n\n${contextLines.join('\n')}`
          );
          return;
        }

        if (response.status === 409 && offer.orderId) {
          const claimsResponse = await fetch(apiUrl('/user/me/claims'), {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          const claimsPayload = await claimsResponse.json().catch(() => ({}));
          const latestClaimedOrderIds = extractClaimedOrderIds(claimsPayload);

          if (claimsResponse.ok && latestClaimedOrderIds.has(offer.orderId)) {
            setClaimedOrderIds(latestClaimedOrderIds);
            Alert.alert('Redan claimad', 'Du har redan claimat det här erbjudandet.');
            return;
          }
        }

        // Log only unexpected claim failures to avoid noisy warnings for known 409 conflicts.
        console.warn('Unexpected claim request failure', {
          status: response.status,
          orderId: offer.orderId,
          requestId,
          payload,
          responseText,
        });

        Alert.alert('Kunde inte claima', `${String(message)}\n\n${contextLines.join('\n')}`);
        return;
      }

      const qrCode =
        (typeof payload?.qrCode === 'string' ? payload.qrCode : payload?.qrCode?.code) ??
        payload?.code ??
        (typeof payload?.claim?.qrCode === 'string' ? payload.claim.qrCode : payload?.claim?.qrCode?.code);
      if (offer.orderId) {
        setClaimedOrderIds((prev) => {
          const next = new Set(prev);
          next.add(offer.orderId as string);
          return next;
        });
      }
      setClaimSuccess({ title: offer.text ?? title ?? 'Erbjudande', qrCode });
    } catch {
      Alert.alert('Kunde inte claima', 'Kontrollera din anslutning och försök igen.');
    } finally {
      setIsClaiming(false);
    }
  };

  useEffect(() => {
    if (dealFlag !== "1" || offers.length === 0) {
      claimWobbleValue.setValue(0);
      return;
    }

    const wobbleAnimation = Animated.loop(
      Animated.sequence([
        Animated.delay(1800),
        Animated.timing(claimWobbleValue, { toValue: -1, duration: 120, useNativeDriver: true }),
        Animated.timing(claimWobbleValue, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(claimWobbleValue, { toValue: -0.6, duration: 110, useNativeDriver: true }),
        Animated.timing(claimWobbleValue, { toValue: 0.6, duration: 110, useNativeDriver: true }),
        Animated.timing(claimWobbleValue, { toValue: 0, duration: 110, useNativeDriver: true }),
      ])
    );

    wobbleAnimation.start();

    return () => {
      wobbleAnimation.stop();
      claimWobbleValue.setValue(0);
    };
  }, [dealFlag, offers.length, claimWobbleValue]);

  const phoneUrl = phoneText
    ? `tel:${phoneText.replace(/[\s-]/g, "")}`
    : undefined;
  const mapsUrl = addressText
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`
    : undefined;
  const mapCoordinate = geocodedCoordinate;
  const mapResetKey = `${id ?? "no-id"}-${addressText ?? "no-address"}-${resetNonceText ?? "no-reset"}-${mapCoordinate?.latitude ?? "no-lat"}-${mapCoordinate?.longitude ?? "no-lon"}`;

  const socialLogin = (provider: 'Google' | 'Facebook' | 'Apple') => {
    Alert.alert(
      `Fortsätt med ${provider}`,
      `Omdirigerar till ${provider}-inloggning...\n\n(Koppla ihop med ${provider} OAuth för att aktivera)`
    );
  };

  useEffect(() => {
    if (dealFlag !== "1") {
      return;
    }

    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [dealFlag]);

  useEffect(() => {
    let cancelled = false;

    const loadMyClaims = async () => {
      if (!isLoggedIn || !token) {
        setClaimedOrderIds(new Set());
        return;
      }

      try {
        const response = await fetch(apiUrl('/user/me/claims'), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok || cancelled) {
          return;
        }

        setClaimedOrderIds(extractClaimedOrderIds(payload));
      } catch {
        if (!cancelled) {
          setClaimedOrderIds(new Set());
        }
      }
    };

    void loadMyClaims();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, token]);

  useEffect(() => {
    let cancelled = false;

    const geocodeAddress = async () => {
      setGeocodedCoordinate(undefined);
      if (!addressText) {
        return;
      }

      if (paramCoordinate) {
        setGeocodedCoordinate({ ...paramCoordinate, addressText });
        return;
      }

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addressText)}`,
          {
            headers: {
              Accept: "application/json",
              "User-Agent": "TooDooApp/1.0 (contact: support@toodoo.app)",
            },
          }
        );

        const results: Array<{ lat: string; lon: string }> = await response.json();
        const firstResult = results?.[0];
        const latitude = Number(firstResult?.lat);
        const longitude = Number(firstResult?.lon);

        if (!cancelled && Number.isFinite(latitude) && Number.isFinite(longitude)) {
          setGeocodedCoordinate({ latitude, longitude, addressText });
        }
      } catch {
        if (!cancelled) {
          setGeocodedCoordinate(undefined);
        }
      }
    };

    geocodeAddress();

    return () => {
      cancelled = true;
    };
  }, [addressText, resetNonceText, paramCoordinate?.latitude, paramCoordinate?.longitude]);

  const formatRemaining = (milliseconds: number) => {
    const totalSeconds = Math.max(Math.floor(milliseconds / 1000), 0);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [hours, minutes, seconds].map((value) => value.toString().padStart(2, "0")).join(":");
  };

  return (
    <ScrollView
      className="flex-1 bg-[#000b2a]"
      contentContainerStyle={{ paddingBottom: 140 }}
      keyboardShouldPersistTaps="handled"
    >
      {imageSource ? (
        <View className="relative h-72 w-full overflow-hidden rounded-xl">
          <Image source={imageSource} className="h-full w-full" />
          <LinearGradient
            colors={["rgba(0, 11, 42, 0)", "#000b2a"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 96,
            }}
          />
        </View>
      ) : null}
      {title ? (
      <Text className="text-3xl font-semibold text-white px-6 mt-4">
        {title}
      </Text>) : null}

      <View className="mt-6 overflow-hidden rounded-2xl p-4 m-2 flex-row items-center gap-3">
        {mapsUrl ? (
          <Button className="flex-1" onPress={() => Linking.openURL(mapsUrl)}>
            Hitta hit
          </Button>
        ) : null}

        {websiteUrl ? (
          <Button
            className="flex-1"
            onPress={() => Linking.openURL(websiteUrl)}
          >
            Webbplats
          </Button>
        ) : null}
      </View>

      {dealFlag === "1" && offers.length > 0 ? (
        <View className="mt-2">
          {offers.length > 1 ? (
            <Text className="mb-2 px-6 text-sm text-white/70">Svep sidledes för fler erbjudanden</Text>
          ) : null}

          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 4 }}
          >
            {offers.map((offer) => (
              (() => {
                const isAlreadyClaimed = offer.orderId ? claimedOrderIds.has(offer.orderId) : false;
                const isClaimDisabled = isClaiming || isAlreadyClaimed;

                const claimLabel = !isLoggedIn
                  ? "Logga in för att claima!"
                  : isAlreadyClaimed
                    ? "Redan claimad"
                    : isClaiming
                      ? "Claimar..."
                      : "Claima";

                return (
              <View key={offer.id} className="mr-3 w-[320px] rounded-2xl bg-[#0a1535] p-4">
                <View className="flex-row gap-3">
                  <View className="relative h-28 w-28 overflow-hidden rounded-xl bg-[#12214d]">
                    {imageSource ? <Image source={imageSource} className="h-full w-full" /> : null}
                    <LinearGradient
                      colors={["rgba(0, 11, 42, 0)", "rgba(0, 11, 42, 0.9)"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 40,
                      }}
                    />
                    <View className="absolute bottom-1 left-2 rounded-full border border-white/15 bg-black/60 px-2 py-1">
                      <Text className="text-[10px] font-medium text-white">
                        {offer.endDate ? formatRemaining(offer.timeLeftMs) : "--:--:--"}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-1 justify-center">
                    <Text className="text-white/80">{offer.text ?? "-"}</Text>
                    <View className="mt-1 flex-row items-center gap-2">
                      <Text className="font-medium text-white">{offer.priceText ? `${offer.priceText} kr` : "-"}</Text>
                      {offer.originalPriceText ? (
                        <Text className="text-blue-300 line-through">{offer.originalPriceText} kr</Text>
                      ) : null}
                    </View>
                    <Text className="mt-1 text-white/80">Claimade: {offer.claimedCount} / {offer.totalCount || "-"}</Text>
                    <View className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/20">
                      <View
                        className="h-full rounded-full bg-[#ff3b30]"
                        style={{ width: `${offer.progressPercent}%` }}
                      />
                    </View>
                  </View>
                </View>
                <View className="mt-3">
                  <Animated.View style={{ transform: [{ rotate: claimWobbleRotate }] }}>
                    <Button
                      variant="filled"
                      color="#ff3b30"
                      disabled={isClaimDisabled}
                      onPress={() => {
                        if (!isLoggedIn) {
                          setIsLoginOpen(true);
                          return;
                        }

                        void claimOffer(offer);
                      }}
                    >
                      {claimLabel}
                    </Button>
                  </Animated.View>
                </View>
              </View>
                );
              })()
            ))}
          </ScrollView>
        </View>
      ) : null}

      <Modal visible={isLoginOpen} transparent animationType="slide" onRequestClose={() => setIsLoginOpen(false)}>
        <View className="flex-1 justify-end bg-black/70">
          <Pressable className="flex-1" onPress={() => setIsLoginOpen(false)} />
          <View className="rounded-t-3xl bg-[#0a1535] px-6 pb-9 pt-6">
            <View className="mb-4 h-1 w-10 self-center rounded-full bg-white/30" />
            <Text className="text-2xl font-semibold text-white">Välkommen!</Text>
            <Text className="mb-5 mt-1 text-sm text-white/50">Logga in för att se dina deals och favoriter</Text>

            <Pressable className="mb-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3" onPress={() => socialLogin('Google')}>
              <Text className="text-center font-medium text-white">Fortsätt med Google</Text>
            </Pressable>

            <Pressable className="mb-4 rounded-2xl border border-white/20 bg-white/10 px-4 py-3" onPress={() => socialLogin('Apple')}>
              <Text className="text-center font-medium text-white">Fortsätt med Apple</Text>
            </Pressable>

            <TextInput
              placeholder="Din e-postadress"
              placeholderTextColor="rgba(255,255,255,0.45)"
              keyboardType="email-address"
              className="mb-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white"
            />

            <Pressable className="mb-4 rounded-2xl bg-[#ff3b30] px-4 py-3" onPress={() => Alert.alert('E-post', 'Fortsätt med e-post')}>
              <Text className="text-center font-medium text-white">Fortsätt med e-post</Text>
            </Pressable>

            <View className="mb-4 flex-row justify-center">
              <Text className="text-white/70 text-md">Har du inget konto? </Text>
              <Pressable
                onPress={() => {
                  const returnParams = JSON.stringify({
                    mapResetNonce,
                    id,
                    title,
                    deal,
                    imageUri,
                    Adress,
                    Telefon,
                    Website,
                    kortbeskrivning,
                    långbeskrivning,
                    erbjudande,
                    claimOrderId,
                    claimBusinessId,
                    orderIds,
                    erbjudandepris,
                    erbjudandeclaimade,
                    erbjudandemängd,
                    erbjudandelängd,
                  });

                  setIsLoginOpen(false);
                  router.push({
                    pathname: '/(tabs)/Registrering',
                    params: { accountType: 'user', returnTo: 'erbjudanden', returnParams },
                  });
                }}
              >
                <Text className="text-blue-400 text-md font-medium underline">Registrera dig här!</Text>
              </Pressable>
            </View>

            <Text className="text-center text-xs leading-5 text-white/50">
              Genom att logga in godkänner du våra användarvillkor och integritetspolicy.
            </Text>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(claimSuccess)}
        transparent
        animationType="fade"
        onRequestClose={() => setClaimSuccess(null)}
      >
        <View className="flex-1 items-center justify-center bg-black/70 px-6">
          <Pressable className="absolute inset-0" onPress={() => setClaimSuccess(null)} />
          <View className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0a1535] p-6">
            <Text className="text-2xl font-semibold text-white text-center">Claimat!</Text>
            <Text className="mt-2 text-center text-white/70">
              {claimSuccess?.title ?? 'Erbjudandet är claimat.'}
            </Text>

            <View className="mt-5 rounded-2xl border border-white/15 bg-white/5 px-4 py-4">
              <Text className="text-sm text-white/60">Din kod</Text>
              <Text selectable className="mt-2 text-lg font-semibold text-white">
                {claimSuccess?.qrCode ?? '-'}
              </Text>
              <Text className="mt-2 text-xs text-white/50">
                Visa koden i kassan eller på plats för att lösa in erbjudandet.
              </Text>
            </View>

            <Pressable
              className="mt-5 rounded-2xl bg-[#007AFF] px-4 py-3"
              onPress={() => setClaimSuccess(null)}
            >
              <Text className="text-center font-medium text-[#061A47]">Stäng</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {title ? (
        <View className=" mt-6 overflow-hidden rounded-2xl bg-[#0a1535] p-4 mx-6">
          <Text className=" text-xl font-semibold text-white">Om oss:</Text>
          {långbeskrivning ? (
            <Text className="mt-2 text-white/70">{långbeskrivning}</Text>
          ) : null}

          {addressText ? (
            <Text className=" mt-6 text-white ">Adress: {addressText}</Text>
          ) : null}
          {phoneText && phoneUrl ? (
            <Text className=" mt-2 text-white ">
              Telefon:{" "}
              <Text
                className="text-blue-400 underline"
                onPress={() => Linking.openURL(phoneUrl)}
              >
                {phoneText}
              </Text>
            </Text>
          ) : null}
        </View>
      ) : (
        <Text className="mt-4 text-white/70">
          Välj ett kort från startsidan för att se detaljer här.
        </Text>
      )}

      {addressText && mapCoordinate && mapCoordinate.addressText === addressText ? (
        <View className="mt-6 mx-6 mb-2">
          <Text className="mb-2 text-white text-xl font-medium ml-4">Karta:</Text>
          <View className="overflow-hidden rounded-2xl border border-white/10">
            <MapView
              key={mapResetKey}
              provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
              style={{ width: "100%", height: 220 }}
              scrollEnabled
              zoomEnabled
              rotateEnabled
              pitchEnabled
              initialRegion={{
                latitude: mapCoordinate.latitude,
                longitude: mapCoordinate.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
            >
              <Marker coordinate={mapCoordinate} title={title ?? "Erbjudande"} description={addressText} />
            </MapView>
          </View>

          <Text className="mt-5 mb-2 text-white text-xl font-medium ml-4">Ta dig hit:</Text>
          <View className="flex-row items-center justify-between">
            <Pressable
              className="rounded-3xl overflow-hidden"
              style={{ aspectRatio: 1, flex: 1, marginRight: 12 }}
              onPress={async () => {
                const to = encodeURIComponent(addressText);
                const webPath = `www.skanetrafiken.se/sok-resa/?to=${to}`;
                const universalLink = `https://${webPath}`;
                const androidIntent =
                  `intent://${webPath}` +
                  `#Intent;scheme=https;package=se.skanetrafiken.washington;` +
                  `S.browser_fallback_url=${encodeURIComponent(universalLink)};end`;
                try {
                  if (Platform.OS === "android") {
                    const ok = await Linking.canOpenURL(androidIntent);
                    await Linking.openURL(ok ? androidIntent : universalLink);
                  } else {
                    await Linking.openURL(universalLink);
                  }
                } catch {
                  try {
                    await Linking.openURL(universalLink);
                  } catch {
                    Alert.alert("Kunde inte öppna", "Skånetrafiken kunde inte öppnas.");
                  }
                }
              }}
            >
              <ExpoImage
                source={skanetrafikenLogo}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={0}
                accessibilityLabel="Skånetrafiken"
              />
            </Pressable>

            <Pressable
              className="rounded-3xl overflow-hidden"
              style={{ aspectRatio: 1, flex: 1, marginRight: 12 }}
              onPress={async () => {
                const appUrl = "voiapp://";
                const webUrl = "https://www.voiscooters.com/";
                try {
                  const supported = await Linking.canOpenURL(appUrl);
                  await Linking.openURL(supported ? appUrl : webUrl);
                } catch {
                  try {
                    await Linking.openURL(webUrl);
                  } catch {
                    Alert.alert("Kunde inte öppna", "Voi kunde inte öppnas.");
                  }
                }
              }}
            >
              <ExpoImage
                source={voiLogo}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={0}
                accessibilityLabel="Voi"
              />
            </Pressable>

            <Pressable
              className="rounded-3xl overflow-hidden"
              style={{ aspectRatio: 1, flex: 1 }}
              onPress={async () => {
                const lat = mapCoordinate.latitude;
                const lng = mapCoordinate.longitude;
                const nickname = encodeURIComponent(title ?? addressText);
                const dropoffAddr = encodeURIComponent(addressText);
                const appUrl = `uber://?action=setPickup&pickup=my_location&dropoff[latitude]=${lat}&dropoff[longitude]=${lng}&dropoff[nickname]=${nickname}&dropoff[formatted_address]=${dropoffAddr}`;
                const webUrl = `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=${lat}&dropoff[longitude]=${lng}&dropoff[nickname]=${nickname}&dropoff[formatted_address]=${dropoffAddr}`;
                try {
                  const supported = await Linking.canOpenURL(appUrl);
                  await Linking.openURL(supported ? appUrl : webUrl);
                } catch {
                  try {
                    await Linking.openURL(webUrl);
                  } catch {
                    Alert.alert("Kunde inte öppna", "Uber kunde inte öppnas.");
                  }
                }
              }}
            >
              <ExpoImage
                source={uberLogo}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={0}
                accessibilityLabel="Uber"
              />
            </Pressable>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
