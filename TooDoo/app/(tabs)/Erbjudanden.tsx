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
import { useAuth } from "@/context/auth-context";

const localImagesById: Record<string, ImageSourcePropType> = {
  "event-3": require("../../assets/images/testbild.jpg"),
};

export default function ErbjudandenScreen() {
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const [geocodedCoordinate, setGeocodedCoordinate] = useState<{ latitude: number; longitude: number; addressText?: string }>();
  const [nowMs, setNowMs] = useState(Date.now());
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const {
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
    erbjudandepris,
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
    Telefon?: string;
    Website?: string;
    kortbeskrivning?: string;
    långbeskrivning?: string;
    erbjudande?: string;
    erbjudandepris?: string;
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
  const offerPriceTexts = toParamList(erbjudandepris);
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
      offerPriceTexts.length,
      offerClaimedTexts.length,
      offerAmountTexts.length,
      offerEndTexts.length
    );

    if (maxLength === 0) {
      return [];
    }

    const parsedOffers = Array.from({ length: maxLength }, (_, index) => {
      const text = offerTexts[index] ?? offerTexts[0];
      const priceText = offerPriceTexts[index] ?? offerPriceTexts[0];
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
        text,
        priceText,
        claimedCount,
        totalCount,
        progressPercent,
        endDate,
        timeLeftMs,
      };
    }).filter((offer) => offer.text || offer.priceText || offer.totalCount > 0 || offer.endDate);
    return parsedOffers;
  }, [offerTexts, offerPriceTexts, offerClaimedTexts, offerAmountTexts, offerEndTexts, nowMs, dealFlag]);

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

    const geocodeAddress = async () => {
      setGeocodedCoordinate(undefined);
      if (!addressText) {
        return;
      }

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addressText)}`,
          {
            headers: {
              Accept: "application/json",
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
  }, [addressText, resetNonceText]);

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
                    <Text className="mt-1 font-medium text-white">{offer.priceText ? `${offer.priceText} kr` : "-"}</Text>
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
                      onPress={() => {
                        if (!isLoggedIn) {
                          setIsLoginOpen(true);
                          return;
                        }
                      }}
                    >
                      {isLoggedIn ? "Claima" : "Logga in för att claima!"}
                    </Button>
                  </Animated.View>
                </View>
              </View>
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
        </View>
      ) : null}
    </ScrollView>
  );
}
