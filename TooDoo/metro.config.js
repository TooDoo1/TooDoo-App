const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Keep Expo's default (inlineRequires off). Turning it on deferred module eval
// until first use and made the first taps after open feel stuttery on Android.

module.exports = withNativeWind(config, { input: './global.css' });
