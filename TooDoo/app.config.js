const appJson = require('./app.json');

const googleMapsApiKey =
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  '';

/**
 * react-native-maps is NOT an Expo config plugin (no app.plugin.js).
 * Do not list it under `plugins` — that crashes Expo start with
 * "Unexpected token '<'" when Node tries to load its JSX entry.
 *
 * On Android, react-native-maps always renders through the Google Maps SDK,
 * even with mapType="none" + UrlTile. Without a key the app crashes natively
 * as soon as a MapView mounts. Set GOOGLE_MAPS_API_KEY as an EAS environment
 * variable (preview + production) — see docs/android-google-maps-key.md.
 */
const isEasAndroidBuild =
  process.env.EAS_BUILD === 'true' && process.env.EAS_BUILD_PLATFORM === 'android';

if (!googleMapsApiKey && (isEasAndroidBuild || process.env.EXPO_WARN_MISSING_MAPS_KEY)) {
  console.warn(
    '\n[app.config] GOOGLE_MAPS_API_KEY is empty — the Android map will crash on open.\n' +
      'Add it with: eas env:create --name GOOGLE_MAPS_API_KEY --environment preview --environment production --visibility sensitive\n'
  );
}
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
