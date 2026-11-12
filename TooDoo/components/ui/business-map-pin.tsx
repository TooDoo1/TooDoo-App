import { memo, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  EVENT_ACTIVITY_COLOR,
  OFFER_ACTIVITY_COLOR,
} from '@/components/ui/company-activity-dots';
import { useThemePreference } from '@/context/theme-preference-context';
import { uiTheme } from '@/lib/ui-theme';

type Props = {
  color?: string;
  title?: string;
  imageUri?: string;
  selected?: boolean;
  hasEvent?: boolean;
  hasOffer?: boolean;
};

function MiniActivityIcon({
  icon,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}) {
  return (
    <View
      style={{
        width: 14,
        height: 14,
        borderRadius: 7,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: color,
      }}
    >
      <Ionicons name={icon} size={8} color="#ffffff" />
    </View>
  );
}

/**
 * TooDoo company map pin — round avatar with a small activity badge
 * (event + offer) in the top-left corner.
 */
function BusinessMapPinComponent({
  color = '#9b5de5',
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
  const showBadge = hasEvent || hasOffer;
  const [imageFailed, setImageFailed] = useState(false);
  const photoOpacity = useRef(new Animated.Value(0)).current;
  const initialOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setImageFailed(false);
    photoOpacity.setValue(0);
    initialOpacity.setValue(1);
  }, [imageUri, photoOpacity, initialOpacity]);

  const revealPhoto = () => {
    Animated.parallel([
      Animated.timing(photoOpacity, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(initialOpacity, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  };

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
          },
        ]}
      >
        <Animated.Text
          style={[
            styles.initial,
            { color, fontSize: selected ? 15 : 13, opacity: initialOpacity },
          ]}
        >
          {initial}
        </Animated.Text>
        {imageUri && !imageFailed ? (
          <Animated.Image
            key={imageUri}
            source={{ uri: imageUri }}
            onLoad={revealPhoto}
            onError={() => setImageFailed(true)}
            style={[styles.image, { opacity: photoOpacity }]}
          />
        ) : null}
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              borderRadius: size / 2,
              borderWidth: border,
              borderColor: color,
            },
          ]}
        />
      </View>
      {showBadge ? (
        <View style={[styles.badge, { backgroundColor: theme.cardBg }]}>
          {hasEvent ? (
            <MiniActivityIcon icon="calendar" color={EVENT_ACTIVITY_COLOR} />
          ) : null}
          {hasOffer ? (
            <MiniActivityIcon icon="pricetag" color={OFFER_ACTIVITY_COLOR} />
          ) : null}
        </View>
      ) : null}
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
    ...StyleSheet.absoluteFillObject,
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
