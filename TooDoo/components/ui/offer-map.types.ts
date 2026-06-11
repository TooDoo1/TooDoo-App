export type OfferMapProps = {
  mapKey: string;
  latitude: number;
  longitude: number;
  title?: string;
  addressText: string;
  originCoords?: { latitude: number; longitude: number } | null;
};
