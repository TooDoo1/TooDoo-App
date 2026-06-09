import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OfferMap } from "@/components/ui/offer-map";
import { useAuth } from "@/context/auth-context";
import { apiUrl, normalizeImageUrl } from "@/lib/api";
import { useThemePreference } from "@/context/theme-preference-context";
import { uiTheme } from "@/lib/ui-theme";
import { CardMedia } from "@/components/ui/card-media";
import { CompanyDetailTabBarSync } from "@/components/company-detail-tab-bar-sync";
import { WebStackSwipeContainer } from "@/components/web-stack-edge-swipe-back";
import { navigateBackFromDetail } from "@/lib/detail-navigation";
import { isActiveOffer } from "@/lib/home-offers";
import { BrandColors, brandInkRgba, brandNavyRgba } from "@/lib/brand-colors";
import { getOrderNotClaimableReason, getOrderPublishEndMs } from "@/lib/order-claim-window";

const skanetrafikenLogo = require("../assets/images/Skanetrafiken.png");
const voiLogo = require("../assets/images/Voi.png");
const uberLogo = require("../assets/images/Uber.png");

const localImagesById: Record<string, ImageSourcePropType> = {
  "event-3": require("../assets/images/testbild.jpg"),
};

export default function CompanyDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoggedIn, token } = useAuth();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimedOrderIds, setClaimedOrderIds] = useState<Set<string>>(new Set());
  const [geocodedCoordinate, setGeocodedCoordinate] = useState<{ latitude: number; longitude: number; addressText?: string }>();
  const [nowMs, setNowMs] = useState(Date.now());
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState<{ title?: string; qrCode?: string } | null>(null);
  const [orderImageUriById, setOrderImageUriById] = useState<Record<string, string>>({});
  /** Live, fresh-from-API counts per order id so the progress bar reflects current data. */
  const [liveCountsByOrderId, setLiveCountsByOrderId] = useState<
    Record<string, { claimed: number; total: number }>
  >({});
  const [hydratedOrders, setHydratedOrders] = useState<any[]>([]);
  const [hydratedBusiness, setHydratedBusiness] = useState<any>(null);
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
    returnTo,
  } = useLocalSearchParams<{
    returnTo?: string;
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

  useEffect(() => {
    const businessId = claimBusinessIdText || businessIdFromIdParam;
    if (!businessId) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(apiUrl(`/business/${encodeURIComponent(businessId)}`));
        const json = await res.json().catch(() => ({}));

        const businessObj = (json as any)?.business ?? (json as any);
        const ordersRaw =
          (Array.isArray(businessObj?.activeOrders) && businessObj.activeOrders) ||
          (Array.isArray(businessObj?.orders) && businessObj.orders) ||
          (Array.isArray(businessObj?.active_orders) && businessObj.active_orders) ||
          (Array.isArray((json as any)?.activeOrders) && (json as any).activeOrders) ||
          (Array.isArray((json as any)?.orders) && (json as any).orders) ||
          [];

        const next: Record<string, string> = {};
        const nextCounts: Record<string, { claimed: number; total: number }> = {};
        ordersRaw.forEach((order: any) => {
          const orderId = String(
            order?.id ??
              order?._id ??
              order?.orderId ??
              order?.order?.id ??
              order?.order?._id ??
              ""
          );
          if (!orderId) return;
          const raw =
            order?.imageUrl ??
            order?.imageAsset?.publicUrl ??
            order?.imageAsset?.url ??
            order?.image?.publicUrl ??
            order?.image?.url;
          const normalized = normalizeImageUrl(raw);
          if (normalized) next[orderId] = normalized;

          const claimed = Number(order?.claimedRedemptions ?? order?.claimedCount ?? NaN);
          const total = Number(order?.maxRedemptions ?? NaN);
          if (Number.isFinite(claimed) || Number.isFinite(total)) {
            nextCounts[orderId] = {
              claimed: Number.isFinite(claimed) ? claimed : 0,
              total: Number.isFinite(total) ? total : 0,
            };
          }
        });

        // If the business payload doesn't contain the images for all orderIds, hydrate missing ones
        // using the canonical endpoint: GET /orders/:orderId
        const missingOfferIds = offerOrderIds
          .map((x) => String(x))
          .filter((id) => id && !next[id])
          .slice(0, 25);

        if (missingOfferIds.length > 0) {
          await Promise.all(
            missingOfferIds.map(async (orderId) => {
              try {
                const orderRes = await fetch(apiUrl(`/orders/${encodeURIComponent(orderId)}`));
                const orderJson = await orderRes.json().catch(() => ({}));
                const orderObj = (orderJson as any)?.order ?? (orderJson as any);
                const raw =
                  orderObj?.imageUrl ??
                  orderObj?.imageAsset?.publicUrl ??
                  orderObj?.imageAsset?.url ??
                  orderObj?.image?.publicUrl ??
                  orderObj?.image?.url;
                const normalized = normalizeImageUrl(raw);
                if (normalized) next[orderId] = normalized;

                const claimed = Number(orderObj?.claimedRedemptions ?? orderObj?.claimedCount ?? NaN);
                const total = Number(orderObj?.maxRedemptions ?? NaN);
                if (Number.isFinite(claimed) || Number.isFinite(total)) {
                  nextCounts[orderId] = {
                    claimed: Number.isFinite(claimed) ? claimed : 0,
                    total: Number.isFinite(total) ? total : 0,
                  };
                }
              } catch {
                // ignore per-order failures
              }
            })
          );
        }

        const activeOrders = ordersRaw.filter((order: any) => isActiveOffer(order));

        if (!cancelled) {
          setOrderImageUriById(next);
          setLiveCountsByOrderId(nextCounts);
          setHydratedOrders(activeOrders);
          setHydratedBusiness(businessObj ?? null);
        }
      } catch {
        if (!cancelled) {
          setOrderImageUriById({});
          setLiveCountsByOrderId({});
          setHydratedOrders([]);
          setHydratedBusiness(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [claimBusinessIdText, businessIdFromIdParam, offerOrderIds]);

  const mapOrderToOffer = (order: any, index: number) => {
    const orderId = String(order?.id ?? order?._id ?? `order-${index}`);
    const live = liveCountsByOrderId[orderId];
    const claimedCount = live
      ? live.claimed
      : Number(order?.claimedRedemptions ?? order?.claimedCount ?? 0);
    const totalCount = live && live.total > 0 ? live.total : Number(order?.maxRedemptions ?? 0);
    const publishEndMs = getOrderPublishEndMs(order);
    const endDate = publishEndMs != null ? new Date(publishEndMs) : undefined;
    const timeLeftMs = endDate ? Math.max(endDate.getTime() - nowMs, 0) : 0;

    return {
      id: orderId,
      orderId,
      text: order?.title ?? order?.description ?? "Erbjudande",
      priceText: order?.price != null ? String(order.price) : undefined,
      originalPriceText: order?.originalPrice != null ? String(order.originalPrice) : undefined,
      claimedCount,
      totalCount,
      progressPercent: totalCount > 0 ? Math.min((claimedCount / totalCount) * 100, 100) : 0,
      endDate,
      timeLeftMs,
    };
  };

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
      return hydratedOrders
        .map(mapOrderToOffer)
        .filter((offer) => offer.text || offer.priceText || offer.originalPriceText || offer.totalCount > 0 || offer.endDate)
        .filter((offer) => !offer.endDate || offer.endDate.getTime() > nowMs);
    }

    const parsedOffers = Array.from({ length: maxLength }, (_, index) => {
      const text = offerTexts[index] ?? offerTexts[0];
      const orderId = offerOrderIds[index] ?? offerOrderIds[0] ?? claimOrderIdText;
      const priceText = offerPriceTexts[index] ?? offerPriceTexts[0];
      const originalPriceText = offerOriginalPriceTexts[index] ?? offerOriginalPriceTexts[0];
      const claimedText = offerClaimedTexts[index] ?? offerClaimedTexts[0];
      const amountText = offerAmountTexts[index] ?? offerAmountTexts[0];
      const endText = offerEndTexts[index] ?? offerEndTexts[0];
      const live = orderId ? liveCountsByOrderId[String(orderId)] : undefined;
      const claimedCount = live ? live.claimed : Number(claimedText ?? 0);
      const totalCount = live && live.total > 0 ? live.total : Number(amountText ?? 0);
      const progressPercent = totalCount > 0 ? Math.min((claimedCount / totalCount) * 100, 100) : 0;
      const publishEndMs = endText ? Date.parse(endText) : NaN;
      const endDate = Number.isFinite(publishEndMs) ? new Date(publishEndMs) : undefined;
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
  }, [offerTexts, offerOrderIds, claimOrderIdText, offerPriceTexts, offerOriginalPriceTexts, offerClaimedTexts, offerAmountTexts, offerEndTexts, liveCountsByOrderId, nowMs, dealFlag, hydratedOrders]);

  const hydratedImageUri = normalizeImageUrl(
    hydratedBusiness?.image?.publicUrl ??
      hydratedBusiness?.image?.url ??
      hydratedBusiness?.imageUrl
  );
  const effectiveImageSource = imageSource ?? (hydratedImageUri ? { uri: hydratedImageUri } : undefined);
  const effectiveWebsiteUrl =
    websiteUrl ||
    (typeof hydratedBusiness?.website === "string" ? hydratedBusiness.website : undefined);
  const effectivePhoneText = phoneText || hydratedBusiness?.contactPhone;
  const effectiveDescription =
    (Array.isArray(långbeskrivning) ? långbeskrivning[0] : långbeskrivning) ||
    hydratedBusiness?.description;
  const showOffersSection = offers.length > 0;

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

      const notClaimableReason = getOrderNotClaimableReason(order);
      if (notClaimableReason) {
        Alert.alert('Kunde inte claima', notClaimableReason);
        return;
      }

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
          const notClaimableMessage = getOrderNotClaimableReason(order) ?? 'Ordern går inte att claima just nu.';
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
        // Optimistically bump the live claimed count so the progress bar moves immediately.
        setLiveCountsByOrderId((prev) => {
          const orderIdKey = String(offer.orderId);
          const current = prev[orderIdKey];
          const fallbackTotal = Number(offer.totalCount ?? 0);
          const nextEntry = {
            claimed: (current?.claimed ?? Number(offer.claimedCount ?? 0)) + 1,
            total: current?.total ?? (Number.isFinite(fallbackTotal) ? fallbackTotal : 0),
          };
          return { ...prev, [orderIdKey]: nextEntry };
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
    if (!showOffersSection) {
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
  }, [showOffersSection, claimWobbleValue]);

  const phoneUrl = effectivePhoneText
    ? `tel:${effectivePhoneText.replace(/[\s-]/g, "")}`
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
    if (!showOffersSection) {
      return;
    }

    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [showOffersSection]);

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

  const showCompanyDetail = Boolean(title || id || claimBusinessId);
  const handleDetailBack = useCallback(() => {
    if (Platform.OS === 'web' && router.canDismiss()) {
      router.dismiss();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    navigateBackFromDetail(router, returnTo);
  }, [router, returnTo]);

  return (
    <WebStackSwipeContainer>
    <View style={{ flex: 1, backgroundColor: theme.screenBg }}>
      <CompanyDetailTabBarSync />
      {showCompanyDetail ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tillbaka"
          onPress={handleDetailBack}
          style={{
            position: "absolute",
            top: insets.top + 8,
            left: 16,
            zIndex: 30,
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.isDark ? "rgba(0, 0, 0, 0.5)" : "rgba(255, 255, 255, 0.82)",
          }}
        >
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
      ) : null}
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: theme.screenBg }}
        contentContainerStyle={{ paddingBottom: showCompanyDetail ? 40 : 140 }}
        keyboardShouldPersistTaps="handled"
      >
      {effectiveImageSource ? (
        <View className="relative h-72 w-full overflow-hidden rounded-xl">
          {effectiveImageSource ? <CardMedia source={effectiveImageSource} rasterResizeMode="cover" svgContain /> : null}
          <LinearGradient
            colors={mode === "dark" ? [brandNavyRgba(0), BrandColors.dark.background] : [brandInkRgba(0), BrandColors.light.background]}
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
      <Text className="text-3xl font-semibold px-6 mt-4" style={{ color: theme.text }}>
        {title}
      </Text>) : null}

      <View className="mt-6 overflow-hidden rounded-2xl p-4 m-2 flex-row items-center gap-3">
        {mapsUrl ? (
          <Button className="flex-1" onPress={() => Linking.openURL(mapsUrl)}>
            Hitta hit
          </Button>
        ) : null}

        {effectiveWebsiteUrl ? (
          <Button
            className="flex-1"
            onPress={() => Linking.openURL(effectiveWebsiteUrl)}
          >
            Webbplats
          </Button>
        ) : null}
      </View>

      {showOffersSection ? (
        <View className="mt-2">
          {offers.length > 1 ? (
            <Text className="mb-2 px-6 text-sm" style={{ color: theme.textMuted }}>Svep sidledes för fler erbjudanden</Text>
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
              <View key={offer.id} className="mr-3 w-[320px] rounded-2xl p-4" style={{ backgroundColor: theme.cardBg }}>
                <View className="flex-row gap-3">
                  <View className="relative h-28 w-28 overflow-hidden rounded-xl" style={{ backgroundColor: theme.cardBgMuted }}>
                    {(() => {
                      const orderId = offer.orderId ? String(offer.orderId) : '';
                      const offerImageUri = orderId ? orderImageUriById[orderId] : undefined;
                      const offerImageSource = offerImageUri
                        ? ({ uri: offerImageUri } as const)
                        : effectiveImageSource;
                      return offerImageSource ? (
                        <CardMedia source={offerImageSource} rasterResizeMode="cover" svgContain />
                      ) : null;
                    })()}
                    <LinearGradient
                      colors={[brandNavyRgba(0), brandNavyRgba(0.9)]}
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
                    <View
                      className="absolute bottom-1 left-2 rounded-full border px-2 py-1"
                      style={{
                        backgroundColor: theme.isDark ? "rgba(0,0,0,0.6)" : brandInkRgba(0.06),
                        borderColor: theme.isDark ? "rgba(255,255,255,0.15)" : theme.border,
                      }}
                    >
                      <Text className="text-[10px] font-medium" style={{ color: theme.text }}>
                        {offer.endDate ? formatRemaining(offer.timeLeftMs) : "--:--:--"}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-1 justify-center">
                    <Text style={{ color: theme.textMuted }}>{offer.text ?? "-"}</Text>
                    <View className="mt-1 flex-row items-center gap-2">
                      <Text className="font-medium" style={{ color: theme.text }}>{offer.priceText ? `${offer.priceText} kr` : "-"}</Text>
                      {offer.originalPriceText ? (
                        <Text className="text-blue-300 line-through">{offer.originalPriceText} kr</Text>
                      ) : null}
                    </View>
                    <Text className="mt-1" style={{ color: theme.textMuted }}>Claimade: {offer.claimedCount} / {offer.totalCount || "-"}</Text>
                    <View className="mt-2 h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: theme.cardBgMuted }}>
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
        <View
          className="flex-1 justify-end"
          style={{ backgroundColor: theme.isDark ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.25)" }}
        >
          <Pressable className="flex-1" onPress={() => setIsLoginOpen(false)} />
          <View className="rounded-t-3xl px-6 pb-9 pt-6" style={{ backgroundColor: theme.cardBg }}>
            <View
              className="mb-4 h-1 w-10 self-center rounded-full"
              style={{ backgroundColor: theme.isDark ? "rgba(255,255,255,0.30)" : brandInkRgba(0.10) }}
            />
            <Text className="text-2xl font-semibold" style={{ color: theme.text }}>
              Välkommen!
            </Text>
            <Text className="mb-5 mt-1 text-sm" style={{ color: theme.textFaint }}>
              Logga in för att se dina deals och favoriter
            </Text>

            <Pressable
              className="mb-2 rounded-2xl border px-4 py-3"
              style={{ borderColor: theme.border, backgroundColor: theme.cardBgMuted }}
              onPress={() => socialLogin('Google')}
            >
              <Text className="text-center font-medium" style={{ color: theme.text }}>
                Fortsätt med Google
              </Text>
            </Pressable>

            <Pressable
              className="mb-4 rounded-2xl border px-4 py-3"
              style={{ borderColor: theme.border, backgroundColor: theme.cardBgMuted }}
              onPress={() => socialLogin('Apple')}
            >
              <Text className="text-center font-medium" style={{ color: theme.text }}>
                Fortsätt med Apple
              </Text>
            </Pressable>

            <TextInput
              placeholder="Din e-postadress"
              placeholderTextColor={theme.textFaint}
              keyboardType="email-address"
              className="mb-2 rounded-2xl border px-4 py-3"
              style={{ borderColor: theme.border, backgroundColor: theme.cardBgMuted, color: theme.text }}
            />

            <Pressable className="mb-4 rounded-2xl bg-[#ff3b30] px-4 py-3" onPress={() => Alert.alert('E-post', 'Fortsätt med e-post')}>
              <Text className="text-center font-medium text-white">Fortsätt med e-post</Text>
            </Pressable>

            <View className="mb-4 flex-row justify-center">
              <Text className="text-md" style={{ color: theme.textFaint }}>
                Har du inget konto?{" "}
              </Text>
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

            <Text className="text-center text-xs leading-5" style={{ color: theme.textFaint }}>
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
        <View
          className="flex-1 items-center justify-center px-6"
          style={{ backgroundColor: theme.isDark ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.25)" }}
        >
          <Pressable className="absolute inset-0" onPress={() => setClaimSuccess(null)} />
          <View
            className="w-full max-w-md rounded-3xl border p-6"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
          >
            <Text className="text-2xl font-semibold text-center" style={{ color: theme.text }}>
              Claimat!
            </Text>
            <Text className="mt-2 text-center" style={{ color: theme.textMuted }}>
              {claimSuccess?.title ?? 'Erbjudandet är claimat.'}
            </Text>

            <View
              className="mt-5 rounded-2xl border px-4 py-4"
              style={{ backgroundColor: theme.cardBgMuted, borderColor: theme.border }}
            >
              <Text className="text-sm" style={{ color: theme.textFaint }}>
                Din kod
              </Text>
              <Text selectable className="mt-2 text-lg font-semibold" style={{ color: theme.text }}>
                {claimSuccess?.qrCode ?? '-'}
              </Text>
              <Text className="mt-2 text-xs" style={{ color: theme.textFaint }}>
                Visa koden i kassan eller på plats för att lösa in erbjudandet.
              </Text>
            </View>

            <Pressable
              className="mt-5 rounded-2xl px-4 py-3"
              style={{ backgroundColor: theme.primary }}
              onPress={() => setClaimSuccess(null)}
            >
              <Text className="text-center font-medium" style={{ color: theme.isDark ? '#ffffff' : BrandColors.light.foreground }}>
                Stäng
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {title ? (
        <View className=" mt-6 overflow-hidden rounded-2xl p-4 mx-6" style={{ backgroundColor: theme.cardBg }}>
          <Text className=" text-xl font-semibold" style={{ color: theme.text }}>Om oss:</Text>
          {effectiveDescription ? (
            <Text className="mt-2" style={{ color: theme.textMuted }}>{effectiveDescription}</Text>
          ) : null}

          {addressText ? (
            <Text className=" mt-6" style={{ color: theme.text }}>Adress: {addressText}</Text>
          ) : null}
          {effectivePhoneText && phoneUrl ? (
            <Text className=" mt-2" style={{ color: theme.text }}>
              Telefon:{" "}
              <Text
                className="text-blue-400 underline"
                onPress={() => Linking.openURL(phoneUrl)}
              >
                {effectivePhoneText}
              </Text>
            </Text>
          ) : null}
        </View>
      ) : (
        <Text className="mt-4" style={{ color: theme.textMuted }}>
          Välj ett kort från startsidan för att se detaljer här.
        </Text>
      )}

      {addressText && mapCoordinate && mapCoordinate.addressText === addressText ? (
        <View className="mt-6 mx-6 mb-2">
          <Text className="mb-2 text-xl font-medium ml-4" style={{ color: theme.text }}>Karta:</Text>
          <View className="overflow-hidden rounded-2xl border" style={{ borderColor: theme.border }}>
            <OfferMap
              mapKey={mapResetKey}
              latitude={mapCoordinate.latitude}
              longitude={mapCoordinate.longitude}
              title={title ?? "Erbjudande"}
              addressText={addressText}
            />
          </View>

          <Text className="mt-5 mb-2 text-xl font-medium ml-4" style={{ color: theme.text }}>Ta dig hit:</Text>
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
    </View>
    </WebStackSwipeContainer>
  );
}
