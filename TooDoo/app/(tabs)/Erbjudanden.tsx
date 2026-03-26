import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  Animated,
  Image,
  ImageSourcePropType,
  Linking,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Button } from "@react-navigation/elements";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";

const localImagesById: Record<string, ImageSourcePropType> = {
  "event-3": require("../../assets/images/testbild.jpg"),
};

export default function ErbjudandenScreen() {
  const [isOfferOpen, setIsOfferOpen] = useState(false);
  const [geocodedCoordinate, setGeocodedCoordinate] = useState<{ latitude: number; longitude: number; addressText?: string }>();
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
  const offerText = Array.isArray(erbjudande) ? erbjudande[0] : erbjudande;
  const offerPriceText = Array.isArray(erbjudandepris) ? erbjudandepris[0] : erbjudandepris;
  const offerClaimedText = Array.isArray(erbjudandeclaimade) ? erbjudandeclaimade[0] : erbjudandeclaimade;
  const offerAmountText = Array.isArray(erbjudandemängd) ? erbjudandemängd[0] : erbjudandemängd;
  const offerEndText = Array.isArray(erbjudandelängd) ? erbjudandelängd[0] : erbjudandelängd;
  const resetNonceText = Array.isArray(mapResetNonce) ? mapResetNonce[0] : mapResetNonce;
  const claimedCount = Number(offerClaimedText ?? 0);
  const totalCount = Number(offerAmountText ?? 0);
  const progressPercent = totalCount > 0 ? Math.min((claimedCount / totalCount) * 100, 100) : 0;
  const remainingCount = Math.max(totalCount - claimedCount, 0);
  const offerEndDate = offerEndText ? new Date(offerEndText) : undefined;
  const [timeLeftMs, setTimeLeftMs] = useState(() =>
    offerEndDate ? Math.max(offerEndDate.getTime() - Date.now(), 0) : 0
  );
  const phoneUrl = phoneText
    ? `tel:${phoneText.replace(/[\s-]/g, "")}`
    : undefined;
  const mapsUrl = addressText
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`
    : undefined;
  const mapCoordinate = geocodedCoordinate;
  const mapResetKey = `${id ?? "no-id"}-${addressText ?? "no-address"}-${resetNonceText ?? "no-reset"}-${mapCoordinate?.latitude ?? "no-lat"}-${mapCoordinate?.longitude ?? "no-lon"}`;
  const swingValue = useRef(new Animated.Value(0)).current;
  const offerDropAnim = useRef(new Animated.Value(0)).current;
  const seesawRotate = swingValue.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ["-2deg", "0deg", "2deg"],
  });
  const offerDropHeight = offerDropAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 220],
  });
  const offerDropOpacity = offerDropAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const offerDropTranslateY = offerDropAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-8, 0],
  });

  useEffect(() => {
    if (dealFlag !== "1" || isOfferOpen) {
      swingValue.setValue(0);
      return;
    }

    const swingAnimation = Animated.loop(
      Animated.sequence([
        Animated.delay(1800),
        Animated.timing(swingValue, { toValue: -1, duration: 120, useNativeDriver: true }),
        Animated.timing(swingValue, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(swingValue, { toValue: -0.6, duration: 110, useNativeDriver: true }),
        Animated.timing(swingValue, { toValue: 0.6, duration: 110, useNativeDriver: true }),
        Animated.timing(swingValue, { toValue: 0, duration: 110, useNativeDriver: true }),
      ])
    );

    swingAnimation.start();

    return () => {
      swingAnimation.stop();
      swingValue.setValue(0);
    };
  }, [dealFlag, isOfferOpen, swingValue]);

  useEffect(() => {
    Animated.timing(offerDropAnim, {
      toValue: isOfferOpen ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [isOfferOpen, offerDropAnim]);

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

  useEffect(() => {
    if (!offerEndDate || dealFlag !== "1") {
      setTimeLeftMs(0);
      return;
    }

    const updateTimeLeft = () => {
      setTimeLeftMs(Math.max(offerEndDate.getTime() - Date.now(), 0));
    };

    updateTimeLeft();
    const timer = setInterval(updateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [offerEndText, dealFlag]);

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

      {dealFlag === "1" ? (
        <Animated.View
          style={{
            marginHorizontal: 24,
            transform: [{ rotate: seesawRotate }],
          }}
        >
          <Button variant="filled" color="#ff3b30" onPress={() => setIsOfferOpen((prev) => !prev)}>
            {isOfferOpen ? "Erbjudanden" : "Visa erbjudande"}
          </Button>
        </Animated.View>
      ) : null}

      {dealFlag === "1" ? (
        <Animated.View
          style={{
            marginHorizontal: 24,
            marginTop: 8,
            height: offerDropHeight,
            opacity: offerDropOpacity,
            transform: [{ translateY: offerDropTranslateY }],
            overflow: "hidden",
          }}
        >
          <View className="rounded-2xl bg-[#0a1535] p-4">
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
                <View className="absolute bottom-1 left-2 rounded-full bg-black/60 px-2 py-1 border border-white/15">
                  <Text className="text-[10px] font-medium text-white">
                    {offerEndDate ? formatRemaining(timeLeftMs) : "--:--:--"}
                  </Text>
                </View>
              </View>

              <View className="flex-1 justify-center">
                <Text className="text-white/80">{offerText ?? "-"}</Text>
                <Text className="mt-1 text-white font-medium">{offerPriceText ? `${offerPriceText} kr` : "-"}</Text>
                <Text className="mt-1 text-white/80">Claimade: {claimedCount} / {totalCount || "-"}</Text>
                <View className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/20">
                  <View
                    className="h-full rounded-full bg-[#ff3b30]"
                    style={{ width: `${progressPercent}%` }}
                  />
                </View>
              </View>
            </View>
            <View className="mt-3">
              <Button variant="filled" color="#050c62">
                Claima
              </Button>
            </View>
          </View>
        </Animated.View>
      ) : null}

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
