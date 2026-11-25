import { memo, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, Text, View } from 'react-native';
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
  /** Fires once the photo has faded in (or failed), so native markers can stop tracking view changes. */
  onImageSettled?: () => void;
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
 *
 * On Android Google Maps, marker children are snapshotted to bitmaps.
 * Native-driver Animated opacity often freezes as a blank pin, so Android
 * skips the fade and settles immediately after the image loads.
 */
function BusinessMapPinComponent({
  color = '#9b5de5',
  title,
  imageUri,
  selected = false,
  hasEvent = false,
  hasOffer = false,
  onImageSettled,
}: Props) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const size = selected ? 42 : 34;
  const border = selected ? 3.5 : 3;
  const initial = (title?.trim().charAt(0) || '•').toUpperCase();
  const showBadge = hasEvent || hasOffer;
  const [imageFailed, setImageFailed] = useState(false);
  const [androidPhotoReady, setAndroidPhotoReady] = useState(false);
  const photoOpacity = useRef(new Animated.Value(0)).current;
  const initialOpacity = useRef(new Animated.Value(1)).current;
  const settledRef = useRef(false);

  const markSettled = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onImageSettled?.();
  };

  useEffect(() => {
    settledRef.current = false;
    setImageFailed(false);
    setAndroidPhotoReady(false);
    photoOpacity.setValue(0);
    initialOpacity.setValue(1);

    // Letter-only pins still need one layout pass before tracking can stop.
    if (!imageUri) {
      const frame = requestAnimationFrame(() => markSettled());
      return () => cancelAnimationFrame(frame);
    }
  }, [imageUri, photoOpacity, initialOpacity]);

  const revealPhoto = () => {
    if (Platform.OS === 'android') {
      setAndroidPhotoReady(true);
      // Let the Image paint once, then stop tracksViewChanges.
      requestAnimationFrame(() => markSettled());
      return;
    }
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
    ]).start(() => markSettled());
  };

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      pointerEvents="none"
      collapsable={false}
    >
      <View
        collapsable={false}
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        {Platform.OS === 'android' ? (
          <Text
            style={[
              styles.initial,
              {
                color,
                fontSize: selected ? 15 : 13,
                opacity: androidPhotoReady ? 0 : 1,
              },
            ]}
          >
            {initial}
          </Text>
        ) : (
          <Animated.Text
            style={[
              styles.initial,
              { color, fontSize: selected ? 15 : 13, opacity: initialOpacity },
            ]}
          >
            {initial}
          </Animated.Text>
        )}
        {imageUri && !imageFailed ? (
          Platform.OS === 'android' ? (
            <Image
              key={imageUri}
              source={{ uri: imageUri }}
              onLoad={revealPhoto}
              onError={() => {
                setImageFailed(true);
                markSettled();
              }}
              style={[styles.image, { opacity: androidPhotoReady ? 1 : 0 }]}
            />
          ) : (
            <Animated.Image
              key={imageUri}
              source={{ uri: imageUri }}
              onLoad={revealPhoto}
              onError={() => {
                setImageFailed(true);
                markSettled();
              }}
              style={[styles.image, { opacity: photoOpacity }]}
            />
          )
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
            <MiniActivityIcon icon="pricetag-outline" color={OFFER_ACTIVITY_COLOR} />
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
