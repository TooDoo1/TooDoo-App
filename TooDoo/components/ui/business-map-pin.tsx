import { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import {
  EVENT_ACTIVITY_COLOR,
  OFFER_ACTIVITY_COLOR,
} from '@/components/ui/company-activity-dots';
import { useThemePreference } from '@/context/theme-preference-context';
import { OFFERS_CATEGORY_ACCENT } from '@/lib/category-colors';
import { uiTheme } from '@/lib/ui-theme';

type Props = {
  color?: string;
  title?: string;
  imageUri?: string;
  selected?: boolean;
  hasEvent?: boolean;
  hasOffer?: boolean;
};

function MiniDot({ active, color }: { active: boolean; color: string }) {
  return (
    <View
      style={{
        width: 5,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: active ? color : 'rgba(255,255,255,0.28)',
      }}
    />
  );
}

/**
 * TooDoo company map pin — round avatar with a small activity badge
 * (event + offer) in the top-left corner.
 */
function BusinessMapPinComponent({
  color = OFFERS_CATEGORY_ACCENT,
  title,
  imageUri,
  selected = false,
  hasEvent = false,
  hasOffer = false,
}: Props) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const size = selected ? 42 : 34;
  const border = selected ? 3.5 : 3;
  const initial = (title?.trim().charAt(0) || '•').toUpperCase();

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      pointerEvents="none"
    >
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: border,
            borderColor: color,
          },
        ]}
      >
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} />
        ) : (
          <Text style={[styles.initial, { color, fontSize: selected ? 15 : 13 }]}>
            {initial}
          </Text>
        )}
      </View>
      <View style={[styles.badge, { backgroundColor: theme.cardBg }]}>
        <MiniDot active={hasEvent} color={EVENT_ACTIVITY_COLOR} />
        <MiniDot active={hasOffer} color={OFFER_ACTIVITY_COLOR} />
      </View>
    </View>
  );
}

export const BusinessMapPin = memo(BusinessMapPinComponent);

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  initial: {
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    top: 1,
    left: 0,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 3,
    paddingVertical: 2,
    borderRadius: 999,
  },
});
