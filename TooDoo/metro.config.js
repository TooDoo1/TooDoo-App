const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Expo turns inline requires off by default. Turning them on makes Metro defer
// evaluating each module until first use, so the big home screen and its
// dependencies no longer all run at boot. Bare side-effect imports
// (e.g. `import 'react-native-reanimated'`) are not affected.
const previousGetTransformOptions = config.transformer?.getTransformOptions;
config.transformer = {
  ...config.transformer,
  getTransformOptions: async (...args) => {
    const previous = previousGetTransformOptions
      ? await previousGetTransformOptions(...args)
      : {};
    return {
      ...previous,
      transform: {
        ...previous?.transform,
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    };
  },
};

module.exports = withNativeWind(config, { input: './global.css' });
