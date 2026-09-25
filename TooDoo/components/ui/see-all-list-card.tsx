import { memo, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ImageSourcePropType } from 'react-native';

import { CardMedia } from '@/components/ui/card-media';
import { IMAGE_DISPLAY_WIDTH } from '@/lib/image-url';
import { uiTheme } from '@/lib/ui-theme';

type SeeAllListCardProps = {
  title: string;
  subtitle?: string;
  meta?: string;
  image: ImageSourcePropType;
  theme: ReturnType<typeof uiTheme>;
  onPress: () => void;
  imagePriority?: 'high' | 'normal';
  topLeft?: ReactNode;
  topRight?: ReactNode;
  accentColor?: string;
};

/**
 * Editorial “see all” row: image plane on top, readable meta below.
 * Fresher than full-bleed text-on-photo stacks used on the home carousels.
 */
export const SeeAllListCard = memo(function SeeAllListCard({
  title,
  subtitle,
  meta,
  image,
  theme,
  onPress,
  imagePriority = 'normal',
  topLeft,
  topRight,
  accentColor,
}: SeeAllListCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={{
        width: '100%',
        borderRadius: 22,
        overflow: 'hidden',
        backgroundColor: theme.cardBg,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      <View style={{ height: 168, width: '100%', backgroundColor: theme.cardBgMuted }}>
        <CardMedia
          source={image}
          svgFit="fill"
          priority={imagePriority}
          displayWidth={IMAGE_DISPLAY_WIDTH.cardWide}
        />
        {topLeft ? (
          <View style={{ position: 'absolute', top: 12, left: 12, zIndex: 2 }}>{topLeft}</View>
        ) : null}
        {topRight ? (
          <View style={{ position: 'absolute', top: 12, right: 12, zIndex: 2 }}>{topRight}</View>
        ) : null}
        {accentColor ? (
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 3,
              backgroundColor: accentColor,
              opacity: 0.9,
            }}
          />
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={2}
              style={{
                color: theme.text,
                fontSize: 17,
                fontWeight: '700',
                letterSpacing: -0.2,
                lineHeight: 22,
              }}
            >
              {title}
            </Text>
            {meta ? (
              <Text
                numberOfLines={1}
                style={{
                  marginTop: 4,
                  color: theme.textMuted,
                  fontSize: 12,
                  fontWeight: '600',
                }}
              >
                {meta}
              </Text>
            ) : null}
            {subtitle ? (
              <Text
                numberOfLines={2}
                style={{
                  marginTop: 6,
                  color: theme.textFaint,
                  fontSize: 13,
                  lineHeight: 18,
                }}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
          <View
            style={{
              marginTop: 2,
              width: 28,
              height: 28,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.cardBgMuted,
            }}
          >
            <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
          </View>
        </View>
      </View>
    </Pressable>
  );
});

export function SeeAllPill({
  label,
  backgroundColor = 'rgba(0,0,0,0.55)',
  color = '#ffffff',
}: {
  label: string;
  backgroundColor?: string;
  color?: string;
}) {
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor,
      }}
    >
      <Text style={{ color, fontSize: 11, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

/** Shared circular overlay action (share / favorite) for see-all cards. */
export function SeeAllIconButton({
  icon,
  label,
  onPress,
  active = false,
  activeColor = '#ff3b5c',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
  activeColor?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={(e: any) => {
        e?.stopPropagation?.();
        onPress();
      }}
      hitSlop={8}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.55)',
      }}
    >
      <Ionicons name={icon} size={18} color={active ? activeColor : '#ffffff'} />
    </Pressable>
  );
}

/** Favorite + share overlay actions shared by every see-all card. */
export function SeeAllCardActions({
  isFavorite,
  onFavoritePress,
  onSharePress,
  shareLabel = 'Dela',
  favoriteColor = '#ff3b5c',
}: {
  isFavorite: boolean;
  onFavoritePress: () => void;
  onSharePress: () => void;
  shareLabel?: string;
  favoriteColor?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <SeeAllIconButton
        icon={isFavorite ? 'heart' : 'heart-outline'}
        label={isFavorite ? 'Ta bort favorit' : 'Lägg till favorit'}
        onPress={onFavoritePress}
        active={isFavorite}
        activeColor={favoriteColor}
      />
      <SeeAllIconButton icon="share-outline" label={shareLabel} onPress={onSharePress} />
    </View>
  );
}

