export type OfferMapProps = {
  mapKey: string;
  latitude: number;
  longitude: number;
  title?: string;
  imageUri?: string;
  categoryName?: string;
  hasEvent?: boolean;
  hasOffer?: boolean;
  addressText: string;
  originLatitude?: number;
  originLongitude?: number;
  /** Match Om oss / card surfaces — pass theme.cardBg from the parent screen. */
  chipBackgroundColor?: string;
};
