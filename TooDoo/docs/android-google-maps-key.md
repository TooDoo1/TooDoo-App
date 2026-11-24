# Android: Google Maps API key

`react-native-maps` renders through the Google Maps SDK on Android. Without an
API key the app crashes natively the moment a map opens (business map, company
detail map). Maps SDK for Android map loads are free and unlimited, but Google
requires billing to be enabled on the project. Do not use a "map ID" — loads
with a map ID are billed as Dynamic Maps.

## 1. Create the key

1. Open <https://console.cloud.google.com/> and create (or pick) a project.
2. Enable billing on the project (a card is required, usage stays at $0).
3. APIs & Services → Library → enable **Maps SDK for Android**.
4. APIs & Services → Credentials → **Create credentials → API key**.
5. Edit the key:
   - Application restrictions: **Android apps**
   - Add package name `com.toodoo` once for each SHA-1 below.
   - API restrictions: restrict to **Maps SDK for Android**.

## 2. SHA-1 fingerprints to add

Add both, otherwise the map is blank on one of the install paths:

- **EAS upload key** (APK installs / preview builds):
  `eas credentials -p android` → pick the build profile → copy `SHA1 Fingerprint`.
- **Play App Signing key** (installs from Play internal testing / production):
  Play Console → TooDoo → Test and release → App integrity → App signing →
  copy `SHA-1 certificate fingerprint`.

## 3. Store the key in EAS

```bash
cd TooDoo
eas env:create --name GOOGLE_MAPS_API_KEY --value <YOUR_KEY> \
  --environment preview --environment production --visibility sensitive
```

`app.config.js` reads `GOOGLE_MAPS_API_KEY` and writes it into the Android
manifest. EAS builds print a warning if it is missing.

## 4. Rebuild

The key lives in the native manifest, so an OTA/JS update is not enough:

```bash
eas build -p android --profile preview
```

## Verify

Before the fix, `adb logcat | grep -i "api key"` shows
`API key not found` when opening the map. After the rebuild the map opens.
