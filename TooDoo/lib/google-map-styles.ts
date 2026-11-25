import type { MapStyleElement } from 'react-native-maps';

import type { ThemeMode } from '@/context/theme-preference-context';

/**
 * Android Google Maps ignores `userInterfaceStyle` on react-native-maps 1.20.
 * Use JSON styling for dark mode instead (iOS still gets userInterfaceStyle).
 */
export const GOOGLE_MAP_DARK_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#1d2433' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8b93a7' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1d2433' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry',
    stylers: [{ color: '#2a3344' }],
  },
  {
    featureType: 'administrative.country',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9aa3b5' }],
  },
  {
    featureType: 'administrative.land_parcel',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#b7bfd0' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#757575' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#1a2a24' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6b9a76' }],
  },
  {
    featureType: 'poi.business',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.fill',
    stylers: [{ color: '#2b3445' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#8a93a6' }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'geometry',
    stylers: [{ color: '#373f51' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#3d465a' }],
  },
  {
    featureType: 'road.highway.controlled_access',
    elementType: 'geometry',
    stylers: [{ color: '#4a5568' }],
  },
  {
    featureType: 'road.local',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#747d90' }],
  },
  {
    featureType: 'transit',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#757575' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0e1325' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#515c6d' }],
  },
];

export function googleMapStyleForMode(mode: ThemeMode): MapStyleElement[] | undefined {
  return mode === 'dark' ? GOOGLE_MAP_DARK_STYLE : undefined;
}
