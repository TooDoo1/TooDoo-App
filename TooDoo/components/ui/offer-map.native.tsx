import { Platform } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

export type OfferMapProps = {
  mapKey: string;
  latitude: number;
  longitude: number;
  title?: string;
  addressText: string;
};

export function OfferMap({ mapKey, latitude, longitude, title, addressText }: OfferMapProps) {
  return (
    <MapView
      key={mapKey}
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      style={{ width: '100%', height: 220 }}
      scrollEnabled
      zoomEnabled
      rotateEnabled
      pitchEnabled
      initialRegion={{
        latitude,
        longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }}
    >
      <Marker coordinate={{ latitude, longitude }} title={title ?? 'Erbjudande'} description={addressText} />
    </MapView>
  );
}
