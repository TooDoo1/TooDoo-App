import { useLocalSearchParams } from "expo-router";
import {
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

const addressCoordinates: Record<string, { latitude: number; longitude: number }> = {
  "Södra Vallgatan 18, Helsingborg": { latitude: 56.0469, longitude: 12.6945 },
};

export default function ErbjudandenScreen() {
  const {
    id,
    title,
    deal,
    imageUri,
    Adress,
    Telefon,
    Website,
    kortbeskrivning,
    långbeskrivning,
  } = useLocalSearchParams<{
    id?: string;
    title?: string;
    deal?: string;
    imageUri?: string;
    Adress?: string;
    Telefon?: string;
    Website?: string;
    kortbeskrivning?: string;
    långbeskrivning?: string;
  }>();

  const imageSource = imageUri
    ? { uri: imageUri }
    : id
      ? localImagesById[id]
      : undefined;
  const websiteUrl = Array.isArray(Website) ? Website[0] : Website;
  const addressText = Array.isArray(Adress) ? Adress[0] : Adress;
  const phoneText = Array.isArray(Telefon) ? Telefon[0] : Telefon;
  const phoneUrl = phoneText
    ? `tel:${phoneText.replace(/[\s-]/g, "")}`
    : undefined;
  const mapsUrl = addressText
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`
    : undefined;
  const mapCoordinate = addressText
    ? addressCoordinates[addressText] ?? { latitude: 56.0465, longitude: 12.6945 }
    : undefined;

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

      {deal=== "1" ? (
        <Button variant="filled" color="#ff3b30" className="mx-6">Erbjudande</Button>
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

      {addressText && mapCoordinate ? (
        <View className="mt-6 mx-6 mb-2">
          <Text className="mb-2 text-white text-xl font-medium ml-4">Karta:</Text>
          <View className="overflow-hidden rounded-2xl border border-white/10">
            <MapView
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
