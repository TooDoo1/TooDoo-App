import { memo, type ComponentType } from 'react';
import { Platform } from 'react-native';

import type { OfferMapProps } from './offer-map.types';

export type { OfferMapProps };

function loadOfferMap(): ComponentType<OfferMapProps> {
  if (Platform.OS === 'web') {
    return require('./offer-map.web').OfferMap;
  }
  return require('./offer-map.native').OfferMap;
}

function OfferMapRouter(props: OfferMapProps) {
  const Impl = loadOfferMap();
  return <Impl {...props} />;
}

export const OfferMap = memo(OfferMapRouter);
