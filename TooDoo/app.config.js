const appJson = require('./app.json');

const googleMapsApiKey =
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  '';

/**
 * react-native-maps is NOT an Expo config plugin (no app.plugin.js).
 * Do not list it under `plugins` — that crashes Expo start with
 * "Unexpected token '<'" when Node tries to load its JSX entry.
 * Android/iOS Google Maps keys below are only needed if you switch
 * MapView to the Google provider; OSM UrlTile works without them.
 */
module.exports = {
  expo: {
    ...appJson.expo,
    ios: {
      ...appJson.expo.ios,
      config: {
        ...(appJson.expo.ios?.config ?? {}),
        googleMapsApiKey: googleMapsApiKey || undefined,
      },
    },
    android: {
      ...appJson.expo.android,
      config: {
        ...(appJson.expo.android?.config ?? {}),
        googleMaps: {
          apiKey: googleMapsApiKey,
        },
      },
    },
    plugins: [...(appJson.expo.plugins ?? [])],
  },
};
