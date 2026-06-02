import { Linking, Pressable, Text, View } from 'react-native';
import { useThemePreference } from '@/context/theme-preference-context';
import { uiTheme } from '@/lib/ui-theme';

export type OfferMapProps = {
  mapKey: string;
  latitude: number;
  longitude: number;
  title?: string;
  addressText: string;
};

export function OfferMap({ latitude, longitude, title, addressText }: OfferMapProps) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

  return (
    <View
      style={{
        width: '100%',
        height: 220,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        backgroundColor: theme.cardBg,
      }}
    >
      <Text style={{ color: theme.text, fontWeight: '600', textAlign: 'center' }} numberOfLines={2}>
        {title ?? 'Erbjudande'}
      </Text>
      <Text style={{ color: theme.textMuted, marginTop: 8, textAlign: 'center' }} numberOfLines={3}>
        {addressText}
      </Text>
      <Pressable
        onPress={() => Linking.openURL(mapsUrl)}
        style={{
          marginTop: 16,
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 999,
          backgroundColor: '#ff3b30',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '600' }}>Öppna i Google Maps</Text>
      </Pressable>
    </View>
  );
}
