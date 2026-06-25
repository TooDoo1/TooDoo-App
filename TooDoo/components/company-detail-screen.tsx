import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Alert,
  Animated,
  ImageSourcePropType,
  InteractionManager,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Button } from "@react-navigation/elements";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OfferMap } from "@/components/ui/offer-map";
import { useAuth } from "@/context/auth-context";
import { useFavorites } from "@/context/favorites-context";
import { useRealtimeSubscription } from "@/hooks/use-realtime-subscription";
import { normalizeImageUrl } from "@/lib/api";
import { useThemePreference } from "@/context/theme-preference-context";
import { uiTheme } from "@/lib/ui-theme";
import { CardMedia } from "@/components/ui/card-media";
import { BusinessOpeningHoursPanel } from "@/components/ui/business-opening-hours-panel";
import { schedulePrefetchImageUris } from "@/lib/image-prefetch";
import { IMAGE_DISPLAY_WIDTH } from "@/lib/image-url";
import { CompanyDetailTabBarSync } from "@/components/company-detail-tab-bar-sync";
import { WebStackSwipeContainer } from "@/components/web-stack-edge-swipe-back";
import { navigateBackFromDetail } from "@/lib/detail-navigation";
import { performWebStackBack } from "@/lib/web-stack-navigation";
import { formatBusinessAddress, isPlaceholderNavigationId } from "@/lib/home-offers";
import { BrandColors, brandInkRgba, brandNavyRgba } from "@/lib/brand-colors";
import { FAVORITE_HEART_COLOR } from "@/lib/tab-colors";
import {
  extractClaimCountByOrderId,
  extractClaimQrCode,
  getClaimFailureMessage,
  hasReachedPerPersonClaimLimit,
  isClaimApiSuccess,
  isDuplicateClaimReason,
  isPlaceholderOrderId,
  parseClaimResponse,
} from "@/lib/claim-api";
import { getOrderPublishEndMs } from "@/lib/order-claim-window";
import { geocodeAddressCached, resolveMapOriginCoords, isPlausibleSwedenCoordinate } from "@/lib/geo";
import {
  fetchBusinessEvents,
  formatEventDateRange,
  formatInterestCount,
  registerEventInterest,
  removeEventInterest,
  type BusinessEventItem,
} from "@/lib/business-events";
import {
  enrichCompanyDetailImages,
  invalidateCompanyDetailCache,
  loadCompanyDetail,
} from "@/lib/load-company-detail";
import { shareOffer } from "@/lib/share-offer";

const localImagesById: Record<string, ImageSourcePropType> = {
  "event-3": require("../assets/images/testbild.jpg"),
};

type DetailOffer = {
  id: string;
  orderId?: string;
  text?: string;
  priceText?: string;
  originalPriceText?: string;
  claimedCount: number;
  totalCount: number;
  progressPercent: number;
  endDate?: Date;
};

function sortOffersWithFocusedFirst(offers: DetailOffer[], focusedOrderId?: string) {
  if (!focusedOrderId || offers.length <= 1) {
    return offers;
  }

  const focus = String(focusedOrderId);
  const index = offers.findIndex((offer) => String(offer.orderId) === focus);
  if (index <= 0) {
    return offers;
  }

  const next = [...offers];
  const [focused] = next.splice(index, 1);
  next.unshift(focused);
  return next;
}

function sortEventsWithFocusedFirst(events: BusinessEventItem[], focusedEventId?: string) {
  if (!focusedEventId || events.length <= 1) {
    return events;
  }

  const focus = String(focusedEventId);
  const index = events.findIndex((event) => event.id === focus);
  if (index <= 0) {
    return events;
  }

  const next = [...events];
  const [focused] = next.splice(index, 1);
  next.unshift(focused);
  return next;
}

type DetailCarouselItem =
  | { kind: "offer"; data: DetailOffer }
  | { kind: "event"; data: BusinessEventItem };

export default function CompanyDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoggedIn, token, role, authFetch } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const [claimingOrderId, setClaimingOrderId] = useState<string | null>(null);
  const pendingClaimOfferRef = useRef<DetailOffer | null>(null);
  const [userClaimCountByOrderId, setUserClaimCountByOrderId] = useState<Map<string, number>>(
    () => new Map()
  );
  const claimInFlightRef = useRef(false);
  const [geocodedCoordinate, setGeocodedCoordinate] = useState<{ latitude: number; longitude: number; addressText?: string }>();
  const [mapOriginCoords, setMapOriginCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [claimSuccess, setClaimSuccess] = useState<{ title?: string; qrCode?: string } | null>(null);
  const [orderImageUriById, setOrderImageUriById] = useState<Record<string, string>>({});
  /** Live, fresh-from-API counts per order id so the progress bar reflects current data. */
  const [liveCountsByOrderId, setLiveCountsByOrderId] = useState<
    Record<string, { claimed: number; total: number }>
  >({});
  const [hydratedOrders, setHydratedOrders] = useState<any[]>([]);
  const [hydratedBusiness, setHydratedBusiness] = useState<any>(null);
  const [businessEvents, setBusinessEvents] = useState<BusinessEventItem[]>([]);
  const [interestedEventIds, setInterestedEventIds] = useState<Set<string>>(new Set());
  const [interestLoadingId, setInterestLoadingId] = useState<string | null>(null);
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
    claimEventId,
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
    claimEventId?: string;
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

  useEffect(() => {
    if (!imageUri) return;
    schedulePrefetchImageUris([imageUri], 1);
  }, [imageUri]);

  const websiteUrl = Array.isArray(Website) ? Website[0] : Website;
  const rawAddressText = Array.isArray(Adress) ? Adress[0] : Adress;
  const paramAddressText = (() => {
    const trimmed = rawAddressText?.trim();
    if (!trimmed || trimmed === "Adress saknas") return undefined;
    return trimmed;
  })();
  const addressText = useMemo(
    () => formatBusinessAddress(hydratedBusiness) || paramAddressText,
    [hydratedBusiness, paramAddressText]
  );
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

  const claimOrderIdText = Array.isArray(claimOrderId) ? claimOrderId[0] : claimOrderId;
  const claimBusinessIdText = Array.isArray(claimBusinessId) ? claimBusinessId[0] : claimBusinessId;
  const claimEventIdText = Array.isArray(claimEventId) ? claimEventId[0] : claimEventId;
  const businessIdFromIdParam = Array.isArray(id) ? id[0] : id;
  const resolvedBusinessId = useMemo(() => {
    const fromHydrated = hydratedBusiness?.id ?? hydratedBusiness?._id;
    if (fromHydrated) return String(fromHydrated);

    const candidate = claimBusinessIdText || businessIdFromIdParam;
    if (isPlaceholderNavigationId(candidate)) return undefined;
    return candidate;
  }, [hydratedBusiness, claimBusinessIdText, businessIdFromIdParam]);
  const claimWobbleValue = useMemo(() => new Animated.Value(0), []);
  const claimWobbleRotate = claimWobbleValue.interpolate({
    inputRange: [-1, 1],
    outputRange: ["-2deg", "2deg"],
  });

  const ordersRawRef = useRef<any[]>([]);
  const resolvedBusinessIdRef = useRef<string | undefined>(undefined);
  const [realtimeRefreshNonce, setRealtimeRefreshNonce] = useState(0);

  const bumpCompanyDetailRefresh = useCallback(() => {
    const businessId = resolvedBusinessIdRef.current ?? resolvedBusinessId;
    if (businessId) {
      invalidateCompanyDetailCache(businessId);
    }
    setRealtimeRefreshNonce((nonce) => nonce + 1);
  }, [resolvedBusinessId]);

  useRealtimeSubscription(
    () => {
      bumpCompanyDetailRefresh();
    },
    {
      enabled: Boolean(resolvedBusinessId || claimBusinessIdText || businessIdFromIdParam),
      filter: (event) => {
        const businessId = resolvedBusinessIdRef.current ?? resolvedBusinessId;
        return businessId ? event.businessId === businessId : false;
      },
    }
  );

  useFocusEffect(
    useCallback(() => {
      const timer = setInterval(() => {
        bumpCompanyDetailRefresh();
      }, 30_000);

      return () => clearInterval(timer);
    }, [bumpCompanyDetailRefresh])
  );

  useEffect(() => {
    let cancelled = false;
    ordersRawRef.current = [];
    resolvedBusinessIdRef.current = undefined;

    let businessId = claimBusinessIdText || businessIdFromIdParam;
    if (isPlaceholderNavigationId(businessId)) {
      businessId = undefined;
    }
    resolvedBusinessIdRef.current = businessId;

    void (async () => {
      const result = await loadCompanyDetail({
        businessId,
        claimOrderId: claimOrderIdText,
        forceRefresh: realtimeRefreshNonce > 0,
      });

      if (cancelled || !result) {
        return;
      }

      ordersRawRef.current = result.orders;
      if (result.business?.id ?? result.business?._id) {
        resolvedBusinessIdRef.current = String(result.business.id ?? result.business._id);
      }

      setOrderImageUriById(result.images);
      setLiveCountsByOrderId(result.counts);
      setHydratedOrders(result.orders);
      setHydratedBusiness(result.business ?? null);

      void enrichCompanyDetailImages(
        resolvedBusinessIdRef.current,
        ordersRawRef.current,
        result.images,
        result.counts
      ).then((enriched) => {
        if (cancelled || !enriched) return;
        setOrderImageUriById(enriched.images);
        setLiveCountsByOrderId(enriched.counts);
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [claimBusinessIdText, businessIdFromIdParam, claimOrderIdText, realtimeRefreshNonce]);

  useEffect(() => {
    let cancelled = false;

    if (!resolvedBusinessId) {
      setBusinessEvents([]);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const next = await fetchBusinessEvents({ businessId: resolvedBusinessId });
      if (!cancelled) {
        setBusinessEvents(next);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedBusinessId, realtimeRefreshNonce]);

  const mapOrderToOffer = (order: any): DetailOffer | null => {
    const orderId = String(order?.id ?? order?._id ?? "");
    if (isPlaceholderOrderId(orderId)) return null;

    const live = liveCountsByOrderId[orderId];
    const claimedCount = live
      ? live.claimed
      : Number(order?.claimedRedemptions ?? order?.claimedCount ?? 0);
    const totalCount = live && live.total > 0 ? live.total : Number(order?.maxRedemptions ?? 0);
    const publishEndMs = getOrderPublishEndMs(order);
    const endDate = publishEndMs != null ? new Date(publishEndMs) : undefined;

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
    };
  };

  const offers = useMemo(() => {
    const focusedOrderId = claimOrderIdText;

    const isVisibleOffer = (offer: DetailOffer) =>
      Boolean(
        offer.text ||
          offer.priceText ||
          offer.originalPriceText ||
          offer.totalCount > 0 ||
          offer.endDate
      );

    const hydratedOffers = hydratedOrders
      .map(mapOrderToOffer)
      .filter((offer): offer is DetailOffer => offer != null)
      .filter(isVisibleOffer);

    return sortOffersWithFocusedFirst(hydratedOffers, focusedOrderId);
  }, [claimOrderIdText, liveCountsByOrderId, hydratedOrders]);

  const events = useMemo(
    () => sortEventsWithFocusedFirst(businessEvents, claimEventIdText),
    [businessEvents, claimEventIdText]
  );

  const carouselItems = useMemo<DetailCarouselItem[]>(() => {
    const offerItems = offers.map((offer) => ({ kind: "offer" as const, data: offer }));
    const eventItems = events.map((event) => ({ kind: "event" as const, data: event }));

    if (claimEventIdText) {
      const focus = String(claimEventIdText);
      const focusedIndex = eventItems.findIndex((item) => item.data.id === focus);
      if (focusedIndex >= 0) {
        const focused = eventItems[focusedIndex];
        const restEvents = eventItems.filter((_, index) => index !== focusedIndex);
        return [focused, ...offerItems, ...restEvents];
      }
    }

    return [...offerItems, ...eventItems];
  }, [claimEventIdText, events, offers]);

  const hydratedImageUri = normalizeImageUrl(
    hydratedBusiness?.image?.publicUrl ??
      hydratedBusiness?.image?.url ??
      hydratedBusiness?.imageUrl
  );
  const effectiveImageSource = hydratedImageUri
    ? { uri: hydratedImageUri }
    : imageSource;
  const effectiveWebsiteUrl =
    websiteUrl ||
    (typeof hydratedBusiness?.website === "string" ? hydratedBusiness.website : undefined);
  const effectivePhoneText = phoneText || hydratedBusiness?.contactPhone;
  const paramTitle = Array.isArray(title) ? title[0] : title;
  const displayTitle =
    (typeof hydratedBusiness?.name === "string" && hydratedBusiness.name.trim()) ||
    paramTitle ||
    "";
  const aboutDescription =
    typeof hydratedBusiness?.description === "string"
      ? hydratedBusiness.description.trim()
      : "";

  const showOffersSection = carouselItems.length > 0;

  const navigateToLogin = useCallback(() => {
    const detailReturnParams = Object.fromEntries(
      Object.entries({
        returnTo: Array.isArray(returnTo) ? returnTo[0] : returnTo,
        id: businessIdFromIdParam,
        claimBusinessId: claimBusinessIdText,
        claimOrderId: claimOrderIdText,
        title: Array.isArray(title) ? title[0] : title,
        deal: Array.isArray(deal) ? deal[0] : deal,
        imageUri: Array.isArray(imageUri) ? imageUri[0] : imageUri,
        Adress: Array.isArray(Adress) ? Adress[0] : Adress,
        latitude: Array.isArray(latitude) ? latitude[0] : latitude,
        longitude: Array.isArray(longitude) ? longitude[0] : longitude,
        Telefon: Array.isArray(Telefon) ? Telefon[0] : Telefon,
        Website: Array.isArray(Website) ? Website[0] : Website,
        mapResetNonce: resetNonceText,
      }).filter((entry): entry is [string, string] => {
        const value = entry[1];
        return value != null && value !== '';
      })
    );

    router.push({
      pathname: '/(tabs)/Loggain',
      params: {
        returnTo: 'company-detail',
        returnParams: JSON.stringify(detailReturnParams),
      },
    });
  }, [
    Adress,
    businessIdFromIdParam,
    claimBusinessIdText,
    claimOrderIdText,
    deal,
    imageUri,
    latitude,
    longitude,
    resetNonceText,
    returnTo,
    router,
    Telefon,
    title,
    Website,
  ]);

  const shareDetailOffer = useCallback(
    (offer: DetailOffer) => {
      if (!resolvedBusinessId || !offer.orderId) {
        Alert.alert("Kunde inte dela", "Erbjudandet saknar information som behövs för att skapa en länk.");
        return;
      }

      void shareOffer({
        businessId: resolvedBusinessId,
        orderId: String(offer.orderId),
        businessName: displayTitle,
        offerText: offer.text,
      });
    },
    [displayTitle, resolvedBusinessId]
  );

  const toggleEventInterest = async (event: BusinessEventItem) => {
    if (!isLoggedIn) {
      navigateToLogin();
      return;
    }

    if (!token) {
      Alert.alert("Fel", "Du måste vara inloggad för att visa intresse.");
      return;
    }

    const isInterested = interestedEventIds.has(event.id);
    setInterestLoadingId(event.id);

    try {
      const ok = isInterested
        ? await removeEventInterest(event.id, token)
        : await registerEventInterest(event.id, token);

      if (!ok) {
        Alert.alert("Fel", "Kunde inte spara ditt intresse just nu.");
        return;
      }

      setInterestedEventIds((prev) => {
        const next = new Set(prev);
        if (isInterested) {
          next.delete(event.id);
        } else {
          next.add(event.id);
        }
        return next;
      });

      setBusinessEvents((prev) =>
        prev.map((item) => {
          if (item.id !== event.id) return item;
          const current = item.interestCount ?? 0;
          return {
            ...item,
            interestCount: Math.max(0, current + (isInterested ? -1 : 1)),
          };
        })
      );
    } catch {
      Alert.alert("Fel", "Kunde inte spara ditt intresse just nu.");
    } finally {
      setInterestLoadingId(null);
    }
  };

  const resolveOrderForClaim = (orderId: string) =>
    hydratedOrders.find((order) => String(order?.id ?? order?._id ?? '') === orderId);

  const syncUserClaimCounts = useCallback(async () => {
    const response = await authFetch('/user/me/claims');
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return new Map<string, number>();
    }

    const counts = extractClaimCountByOrderId(payload);
    setUserClaimCountByOrderId(counts);
    return counts;
  }, [authFetch]);

  const getUserClaimCount = (orderId: string, counts = userClaimCountByOrderId) =>
    counts.get(orderId) ?? 0;

  const hasExhaustedPersonalClaims = (orderId: string, counts = userClaimCountByOrderId) => {
    const order = resolveOrderForClaim(orderId);
    return hasReachedPerPersonClaimLimit(order, getUserClaimCount(orderId, counts));
  };

  const claimOffer = async (
    offer: DetailOffer,
    options?: { skipAuthPrompt?: boolean }
  ) => {
    if (!options?.skipAuthPrompt && !isLoggedIn) {
      pendingClaimOfferRef.current = offer;
      navigateToLogin();
      return;
    }

    const orderId = offer.orderId;
    if (!orderId || isPlaceholderOrderId(orderId)) {
      Alert.alert('Fel', 'Saknar order-id för det här erbjudandet.');
      return;
    }

    if (claimInFlightRef.current) {
      return;
    }

    if (hasExhaustedPersonalClaims(orderId)) {
      Alert.alert('Redan claimad', 'Du har redan claimat det här erbjudandet.');
      return;
    }

    setClaimingOrderId(orderId);
    claimInFlightRef.current = true;

    try {
      const latestCounts = await syncUserClaimCounts();
      if (hasExhaustedPersonalClaims(orderId, latestCounts)) {
        Alert.alert('Redan claimad', 'Du har redan claimat det här erbjudandet.');
        return;
      }

      const response = await authFetch('/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId }),
      });

      const { payload, responseText } = await parseClaimResponse(response);
      const order = resolveOrderForClaim(orderId);

      if (!isClaimApiSuccess(response, payload)) {
        if (response.status === 401 || response.status === 403) {
          pendingClaimOfferRef.current = offer;
          Alert.alert('Sessionen har gått ut', 'Logga in igen för att claima erbjudanden.', [
            { text: 'Avbryt', style: 'cancel' },
            { text: 'Logga in', onPress: navigateToLogin },
          ]);
          return;
        }

        if (isDuplicateClaimReason(payload)) {
          await syncUserClaimCounts();
          Alert.alert('Redan claimad', 'Du har redan claimat det här erbjudandet.');
          return;
        }

        const latestCounts = await syncUserClaimCounts();
        if (hasExhaustedPersonalClaims(orderId, latestCounts)) {
          Alert.alert('Redan claimad', 'Du har redan claimat det här erbjudandet.');
          return;
        }

        console.warn('Claim request failed', {
          status: response.status,
          orderId: offer.orderId,
          payload,
          responseText,
        });

        Alert.alert('Kunde inte claima', getClaimFailureMessage(payload, response.status, order));
        return;
      }

      const qrCode = extractClaimQrCode(payload);
      setUserClaimCountByOrderId((prev) => {
        const next = new Map(prev);
        next.set(orderId, (next.get(orderId) ?? 0) + 1);
        return next;
      });
      void syncUserClaimCounts();
      setLiveCountsByOrderId((prev) => {
        const orderIdKey = orderId;
        const current = prev[orderIdKey];
        const fallbackTotal = Number(offer.totalCount ?? 0);
        const nextEntry = {
          claimed: (current?.claimed ?? Number(offer.claimedCount ?? 0)) + 1,
          total: current?.total ?? (Number.isFinite(fallbackTotal) ? fallbackTotal : 0),
        };
        return { ...prev, [orderIdKey]: nextEntry };
      });
      setClaimSuccess({ title: offer.text ?? title ?? 'Erbjudande', qrCode });
    } catch {
      Alert.alert('Kunde inte claima', 'Kontrollera din anslutning och försök igen.');
    } finally {
      claimInFlightRef.current = false;
      setClaimingOrderId(null);
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
  const businessCoordinate = useMemo(() => {
    const lat = Number(hydratedBusiness?.latitude);
    const lng = Number(hydratedBusiness?.longitude);
    if (isPlausibleSwedenCoordinate(lat, lng)) {
      return { latitude: lat, longitude: lng };
    }
    return undefined;
  }, [hydratedBusiness?.latitude, hydratedBusiness?.longitude]);

  const fallbackCoordinate = useMemo(() => {
    if (businessCoordinate) return businessCoordinate;
    if (
      paramCoordinate &&
      isPlausibleSwedenCoordinate(paramCoordinate.latitude, paramCoordinate.longitude)
    ) {
      return paramCoordinate;
    }
    return undefined;
  }, [businessCoordinate, paramCoordinate]);

  const mapCoordinate = geocodedCoordinate ?? fallbackCoordinate;
  const mapsUrl = addressText
    ? mapOriginCoords
      ? `https://www.google.com/maps/dir/?api=1&origin=${mapOriginCoords.latitude},${mapOriginCoords.longitude}&destination=${encodeURIComponent(addressText)}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`
    : undefined;
  const mapResetKey = `${id ?? "no-id"}-${addressText ?? "no-address"}-${resetNonceText ?? "no-reset"}-${mapOriginCoords ? `${mapOriginCoords.latitude},${mapOriginCoords.longitude}` : "no-origin"}`;

  const isFocused = useIsFocused();

  useEffect(() => {
    if (!showOffersSection || !isFocused) {
      return;
    }

    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [showOffersSection, isFocused]);

  const claimOfferRef = useRef(claimOffer);
  claimOfferRef.current = claimOffer;

  useFocusEffect(
    useCallback(() => {
      if (!isLoggedIn) return;

      const pendingOffer = pendingClaimOfferRef.current;
      if (!pendingOffer) return;

      pendingClaimOfferRef.current = null;
      void claimOfferRef.current(pendingOffer, { skipAuthPrompt: true });
    }, [isLoggedIn])
  );

  useEffect(() => {
    let cancelled = false;

    const task = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        if (!isLoggedIn) {
          if (!cancelled) setUserClaimCountByOrderId(new Map());
          return;
        }

        try {
          const response = await authFetch('/user/me/claims');

          const payload = await response.json().catch(() => ({}));

          if (!response.ok || cancelled) {
            return;
          }

          setUserClaimCountByOrderId(extractClaimCountByOrderId(payload));
        } catch {
          if (!cancelled) {
            setUserClaimCountByOrderId(new Map());
          }
        }
      })();
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [authFetch, isLoggedIn, realtimeRefreshNonce]);

  useEffect(() => {
    let cancelled = false;

    setGeocodedCoordinate(undefined);
    if (!addressText) {
      return () => {
        cancelled = true;
      };
    }

    const task = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        const geocoded = await geocodeAddressCached(addressText);
        if (cancelled) return;

        if (geocoded) {
          setGeocodedCoordinate({
            latitude: geocoded.lat,
            longitude: geocoded.lng,
            addressText,
          });
          return;
        }

        if (fallbackCoordinate) {
          setGeocodedCoordinate({ ...fallbackCoordinate, addressText });
        }
      })();
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [
    addressText,
    fallbackCoordinate?.latitude,
    fallbackCoordinate?.longitude,
    resetNonceText,
  ]);

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

  const formatRemaining = (milliseconds: number) => {
    const totalSeconds = Math.max(Math.floor(milliseconds / 1000), 0);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [hours, minutes, seconds].map((value) => value.toString().padStart(2, "0")).join(":");
  };

  const getEventRemainingMs = (event: BusinessEventItem) => {
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
  };

  const getEventImageUri = (event: BusinessEventItem) => {
    if (
      event.image &&
      typeof event.image === "object" &&
      "uri" in event.image &&
      typeof event.image.uri === "string"
    ) {
      return event.image.uri;
    }
    return undefined;
  };

  const showCompanyDetail = Boolean(title || id || claimBusinessId || claimOrderId);
  const showFavoriteButton = Boolean(showCompanyDetail && resolvedBusinessId && isLoggedIn && role === "USER");
  const companyIsFavorite = resolvedBusinessId ? isFavorite(resolvedBusinessId) : false;
  const handleDetailBack = useCallback(() => {
    if (Platform.OS === 'web') {
      performWebStackBack(router, { returnTo, isCompanyDetail: true });
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
      {showFavoriteButton && resolvedBusinessId ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={companyIsFavorite ? "Ta bort favorit" : "Lägg till favorit"}
          onPress={() => void toggleFavorite(resolvedBusinessId)}
          hitSlop={10}
          style={{
            position: "absolute",
            top: insets.top + 8,
            right: 16,
            zIndex: 30,
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.45)",
          }}
        >
          <Ionicons
            name={companyIsFavorite ? "heart" : "heart-outline"}
            size={22}
            color={companyIsFavorite ? FAVORITE_HEART_COLOR : "#ffffff"}
          />
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
          {effectiveImageSource ? (
            <CardMedia
              source={effectiveImageSource}
              rasterResizeMode="cover"
              svgFit="contain"
              priority="high"
              displayWidth={IMAGE_DISPLAY_WIDTH.hero}
            />
          ) : null}
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
      {displayTitle ? (
      <Text className="text-3xl font-semibold px-6 mt-4" style={{ color: theme.text }}>
        {displayTitle}
      </Text>) : null}

      {addressText ? (
        <Text className="mt-3 px-6 text-base" style={{ color: theme.text }}>
          Adress: {addressText}
        </Text>
      ) : null}
      {effectivePhoneText && phoneUrl ? (
        <Text className="mt-1 px-6 text-base" style={{ color: theme.text }}>
          Telefon:{" "}
          <Text
            className="text-blue-400 underline"
            onPress={() => Linking.openURL(phoneUrl)}
          >
            {effectivePhoneText}
          </Text>
        </Text>
      ) : null}

      <View
        style={{
          marginTop: 16,
          marginBottom: 12,
          marginHorizontal: 8,
          paddingHorizontal: 16,
          paddingTop: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: mapsUrl && effectiveWebsiteUrl ? 'space-between' : 'center',
        }}
      >
        {mapsUrl ? (
          <Pressable
            style={{
              width: effectiveWebsiteUrl ? '47%' : '100%',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 999,
              paddingHorizontal: 24,
              paddingVertical: 10,
              backgroundColor: theme.isDark ? '#ffffff' : theme.cardBg,
            }}
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
        ) : null}

        {effectiveWebsiteUrl ? (
          <Pressable
            style={{
              width: mapsUrl ? '47%' : '100%',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 999,
              paddingHorizontal: 24,
              paddingVertical: 10,
              backgroundColor: theme.isDark ? '#ffffff' : theme.cardBg,
            }}
            onPress={() => Linking.openURL(effectiveWebsiteUrl)}
          >
            <Ionicons
              name="globe-outline"
              size={18}
              color={theme.isDark ? BrandColors.dark.background : theme.text}
              style={{ marginRight: 6 }}
            />
            <Text
              className="text-sm font-medium"
              style={{ color: theme.isDark ? BrandColors.dark.background : theme.text }}
            >
              Webbplats
            </Text>
          </Pressable>
        ) : null}
      </View>

      <BusinessOpeningHoursPanel openingHours={hydratedBusiness?.openingHours} mode={mode} />

      {showOffersSection ? (
        <View style={{ marginTop: 32 }}>
          {carouselItems.length > 1 ? (
            <Text className="mb-2 px-6 text-sm" style={{ color: theme.textMuted }}>Svep sidledes för fler erbjudanden</Text>
          ) : null}

          <ScrollView
            horizontal
            nestedScrollEnabled
            directionalLockEnabled={Platform.OS === 'ios'}
            decelerationRate={Platform.OS === 'android' ? 0.992 : 'normal'}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 4 }}
          >
            {carouselItems.map((item) => {
              if (item.kind === "offer") {
                const offer = item.data;
                const isAlreadyClaimed = offer.orderId
                  ? hasExhaustedPersonalClaims(offer.orderId)
                  : false;
                const isThisClaiming = offer.orderId ? claimingOrderId === offer.orderId : false;
                const isClaimDisabled = isThisClaiming || isAlreadyClaimed;

                const claimLabel = !isLoggedIn
                  ? "Logga in för att claima!"
                  : isAlreadyClaimed
                    ? "Redan claimad"
                    : isThisClaiming
                      ? "Claimar..."
                      : "Claima";

                return (
                  <View key={`offer-${offer.id}`} className="mr-3 w-[320px] rounded-2xl p-4" style={{ backgroundColor: theme.cardBg }}>
                    <View className="flex-row gap-3">
                      <View className="relative h-28 w-28 overflow-hidden rounded-xl" style={{ backgroundColor: theme.cardBgMuted }}>
                        {(() => {
                          const orderId = offer.orderId ? String(offer.orderId) : "";
                          const offerImageUri = orderId ? orderImageUriById[orderId] : undefined;
                          const offerImageSource = offerImageUri
                            ? ({ uri: offerImageUri } as const)
                            : effectiveImageSource;
                          return offerImageSource ? (
                            <CardMedia
                              source={offerImageSource}
                              rasterResizeMode="cover"
                              svgFit="contain"
                              priority="low"
                              displayWidth={IMAGE_DISPLAY_WIDTH.thumb}
                            />
                          ) : null;
                        })()}
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Dela erbjudande"
                          onPress={() => shareDetailOffer(offer)}
                          hitSlop={8}
                          style={{
                            position: "absolute",
                            top: 6,
                            left: 6,
                            width: 36,
                            height: 36,
                            borderRadius: 18,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: "rgba(0,0,0,0.72)",
                            zIndex: 2,
                          }}
                        >
                          <Ionicons name="share-outline" size={18} color="#ffffff" />
                        </Pressable>
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
                            {offer.endDate
                              ? formatRemaining(Math.max(offer.endDate.getTime() - nowMs, 0))
                              : "--:--:--"}
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
                            void claimOffer(offer);
                          }}
                        >
                          {claimLabel}
                        </Button>
                      </Animated.View>
                    </View>
                  </View>
                );
              }

              const event = item.data;
              const isInterestLoading = interestLoadingId === event.id;
              const eventRemainingMs = getEventRemainingMs(event);
              const eventImageUri = getEventImageUri(event);
              const eventImageSource = eventImageUri
                ? ({ uri: eventImageUri } as const)
                : effectiveImageSource;
              const when = formatEventDateRange(event);

              const interestLabel = !isLoggedIn
                ? "Logga in för att visa intresse"
                : isInterestLoading
                  ? "Sparar..."
                  : "Intresserad";

              return (
                <View key={`event-${event.id}`} className="mr-3 w-[320px] rounded-2xl p-4" style={{ backgroundColor: theme.cardBg }}>
                  <View className="flex-row gap-4">
                    <View className="relative h-28 w-28 overflow-hidden rounded-xl" style={{ backgroundColor: theme.cardBgMuted }}>
                      {eventImageSource ? (
                        <CardMedia
                          source={eventImageSource}
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
                          {eventRemainingMs != null ? formatRemaining(eventRemainingMs) : "--:--:--"}
                        </Text>
                      </View>
                    </View>

                    <View className="flex-1 justify-center">
                      <Text style={{ color: theme.textMuted }}>{event.title}</Text>
                      <Text className="mt-1 text-sm" style={{ color: theme.text }}>
                        {when ?? "-"}
                      </Text>
                      {event.locationName ? (
                        <Text className="mt-1 text-xs" style={{ color: theme.textMuted }} numberOfLines={1}>
                          {event.locationName}
                        </Text>
                      ) : null}
                      <View
                        className="mt-2 flex-row items-center justify-between rounded-xl px-3 py-2"
                        style={{
                          alignSelf: "stretch",
                          backgroundColor: theme.eventColorMuted,
                        }}
                      >
                        <Text className="text-sm font-semibold text-white">Intresserade:</Text>
                        <Text className="text-2xl font-bold leading-7 text-white">
                          {formatInterestCount(event.interestCount)}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View className="mt-3">
                    <Button
                      variant="filled"
                      color={theme.eventColor}
                      disabled={isInterestLoading}
                      onPress={() => {
                        void toggleEventInterest(event);
                      }}
                    >
                      {interestLabel}
                    </Button>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

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

      {aboutDescription ? (
        <View className=" mt-6 overflow-hidden rounded-2xl p-4 mx-6" style={{ backgroundColor: theme.cardBg }}>
          <Text className=" text-xl font-semibold" style={{ color: theme.text }}>Om oss:</Text>
          <Text className="mt-2" style={{ color: theme.textMuted }}>{aboutDescription}</Text>
        </View>
      ) : null}

      {!showCompanyDetail ? (
        <Text className="mt-4" style={{ color: theme.textMuted }}>
          Välj ett kort från startsidan för att se detaljer här.
        </Text>
      ) : null}

      {addressText ? (
        <View className="mt-6 mx-6 mb-2">
          <Text className="mb-2 text-xl font-medium ml-4" style={{ color: theme.text }}>Hitta hit:</Text>
          <View className="overflow-hidden rounded-2xl border" style={{ borderColor: theme.border }}>
            <OfferMap
              mapKey={mapResetKey}
              latitude={mapCoordinate?.latitude ?? fallbackCoordinate?.latitude ?? Number.NaN}
              longitude={mapCoordinate?.longitude ?? fallbackCoordinate?.longitude ?? Number.NaN}
              title={displayTitle || "Erbjudande"}
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
