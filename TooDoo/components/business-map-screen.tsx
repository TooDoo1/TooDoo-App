import { memo, type ComponentType } from 'react';
import { Platform } from 'react-native';

function loadBusinessMapScreen(): ComponentType {
  if (Platform.OS === 'web') {
    return require('./business-map-screen.web').default;
  }
  return require('./business-map-screen.native').default;
}

function BusinessMapScreenRouter() {
  const Impl = loadBusinessMapScreen();
  return <Impl />;
}

export default memo(BusinessMapScreenRouter);
