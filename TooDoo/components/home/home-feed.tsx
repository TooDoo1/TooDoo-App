import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from 'react';
import {
  ImageSourcePropType,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from '@react-navigation/native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { CardMedia } from '@/components/ui/card-media';
import { CompanyActivityDots } from '@/components/ui/company-activity-dots';
import { useAuth } from '@/context/auth-context';
import { useFavorites } from '@/context/favorites-context';
import { useThemePreference } from '@/context/theme-preference-context';
import { type OfferCardItem } from '@/lib/home-offers';
import {
  formatRecentVisitLabel,
  isNewRecentCompany,
  type RecentCompanyCard,
} from '@/lib/recent-businesses';
import {
  getFeedEventStartParts,
  HOME_EVENT_TICKET_COUNT,
  isUpcomingFeedEvent,
  type EventFeedItem,
} from '@/lib/events-feed';
import {
  getCategoryAccentColor,
  getCategoryIconName,
  getCategoryLabelsForItem,
} from '@/lib/category-colors';
import {
  getTodayOpeningHoursText,
  normalizeBusinessOpeningHours,
} from '@/lib/business-opening-hours';
import { formatDistanceKm } from '@/lib/geo';
import {
  getHomeRailScrollOffset,
  setHomeRailScrollOffset,
} from '@/lib/home-list-cache';
import { prefetchImageUris } from '@/lib/image-prefetch';
import { IMAGE_DISPLAY_WIDTH, sizedImageUrl } from '@/lib/image-url';
import { FAVORITE_HEART_COLOR } from '@/lib/tab-colors';
import { uiTheme } from '@/lib/ui-theme';

/** Remember horizontal rail position across company/detail navigation. */
function usePersistedRailScroll(scrollKey?: string) {
  const scrollRef = useRef<ScrollView>(null);
  const isFocused = useIsFocused();
  const initialX = scrollKey ? getHomeRailScrollOffset(scrollKey) : 0;

  const onScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      if (!scrollKey) return;
      setHomeRailScrollOffset(scrollKey, event.nativeEvent.contentOffset.x);
    },
    [scrollKey]
  );

  const restore = useCallback(() => {
    if (!scrollKey) return;
    const x = getHomeRailScrollOffset(scrollKey);
    if (x <= 0) return;
    const apply = () => {
      scrollRef.current?.scrollTo({ x, animated: false });
    };
    apply();
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(apply);
    });
    if (Platform.OS === 'web') {
      setTimeout(apply, 50);
      setTimeout(apply, 160);
    }
  }, [scrollKey]);

  useLayoutEffect(() => {
    if (!isFocused || !scrollKey) return;
    restore();
  }, [isFocused, restore, scrollKey]);

  return {
    scrollRef,
    onScroll,
    contentOffset: { x: initialX, y: 0 },
    scrollEventThrottle: 16,
  };
}

export const HOME_RADIUS = 16;
export const HOME_PAGE_PAD = 20;
const POSTER_WIDTH = 168;
const POSTER_IMAGE_H = 112;
const POSTER_IMAGE_H_COMPACT = 100;
const POSTER_IMAGE_H_FULL = 200;
const POSTER_IMAGE_H_FULL_COMPACT = 152;
const FEATURED_H = 268;
const FEATURED_IMAGE_H = 156;
const FEATURED_AUTO_MS = 5200;
const FEATURED_RESUME_MS = 12000;
const FEATURED_CARD_RATIO = 0.72;
const FEATURED_SIDE_SCALE = 0.86;
const FEATURED_GAP = 10;
const FEATURED_MIN_WIDTH = 80;
const FEATURED_PRELOAD_AHEAD = 4;
/** Dark lens under card overlay blur so tags/heart stay readable on bright photos. */
const OVERLAY_DARK_LENS = 'rgba(10,15,28,0.58)';
const OVERLAY_BLUR_WEB =
  Platform.OS === 'web'
    ? ({
        backdropFilter: 'blur(16px) saturate(150%)',
        WebkitBackdropFilter: 'blur(16px) saturate(150%)',
      } as const)
    : null;
const NO_OUTLINE = Platform.OS === 'web'
  ? ({ outlineWidth: 0, borderWidth: 0, cursor: 'pointer' } as const)
  : null;

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace('#', '').trim();
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) {
    return `rgba(20, 25, 46, ${alpha})`;
  }
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Frosted blur wash behind card overlays (category tag, heart) — same as Helsingborg pill. */
function FrostedOverlayWash() {
  if (Platform.OS === 'web') return null;
  return (
    <BlurView
      tint="systemThinMaterialDark"
      intensity={Platform.OS === 'android' ? 64 : 40}
      experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
      style={StyleSheet.absoluteFillObject}
    />
  );
}

function OverlayDarkLens() {
  return <View pointerEvents="none" style={styles.overlayDarkLens} />;
}
const LAUNCH_BLUE = '#3f78cc';
const LAUNCH_RED = '#e0443c';
const LAUNCH_ORANGE = '#e0883e';
const LAUNCH_PURPLE = '#9a5ad1';
const LAUNCH_ORB = 64;

export type HomeFeedCard = OfferCardItem & {
  resultKind?: 'business' | 'event';
};

function featuredImageUri(card: HomeFeedCard): string | undefined {
  const raw =
    typeof card.image === 'object' && card.image && 'uri' in card.image && typeof card.image.uri === 'string'
      ? card.image.uri
      : undefined;
  return sizedImageUrl(raw, IMAGE_DISPLAY_WIDTH.hero) ?? raw;
}

function cssImageUrl(uri: string) {
  return `url(${JSON.stringify(uri)})`;
}

const decodedFeaturedUris = new Set<string>();

function featuredAheadUris(items: HomeFeedCard[], logical: number, ahead = FEATURED_PRELOAD_AHEAD) {
  const count = items.length;
  if (count === 0) return [] as string[];
  const start = ((logical % count) + count) % count;
  const uris: string[] = [];
  const seen = new Set<string>();
  for (let step = 1; step <= ahead; step++) {
    const uri = featuredImageUri(items[(start + step) % count]);
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    uris.push(uri);
  }
  return uris;
}

function decodeFeaturedUris(uris: Array<string | undefined>) {
  if (typeof window === 'undefined' || typeof window.Image === 'undefined') return;
  uris.forEach((uri) => {
    if (!uri || decodedFeaturedUris.has(uri)) return;
    decodedFeaturedUris.add(uri);
    const img = new window.Image();
    img.decoding = 'async';
    img.src = uri;
    void img.decode?.().catch(() => undefined);
  });
}

function warmFeaturedAhead(items: HomeFeedCard[], logical: number) {
  const uris = featuredAheadUris(items, logical);
  decodeFeaturedUris(uris);
  void prefetchImageUris(uris, FEATURED_PRELOAD_AHEAD + 1);
}

/** City from "Street, City" address strings used on offer cards. */
function cardCityLabel(card: HomeFeedCard): string | null {
  const raw = typeof card.Adress === 'string' ? card.Adress.trim() : '';
  if (!raw || raw === 'Adress saknas') return null;
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1] ?? null;
  // Bare city-only values (no street) — show when it looks like a place name.
  if (parts.length === 1 && parts[0].length <= 32 && !/\d/.test(parts[0])) {
    return parts[0];
  }
  return null;
}

function displayName(value: string) {
  const text = value.trim();
  const letters = text.match(/[A-Za-zÅÄÖåäö]/g) ?? [];
  if (letters.length < 6) return text;
  const upper = (text.match(/[A-ZÅÄÖ]/g) ?? []).length;
  if (upper / letters.length < 0.7) return text;
  return text
    .toLocaleLowerCase('sv-SE')
    .replace(/(^|[^A-Za-zÅÄÖåäö])([A-Za-zÅÄÖåäö])/g, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase('sv-SE'));
}

function cardTodayHoursLabel(card: HomeFeedCard): string | null {
  if (card.resultKind === 'event') return null;
  const hours = getTodayOpeningHoursText(normalizeBusinessOpeningHours(card.openingHours));
  if (!hours) return null;
  return `Idag ${hours.replace(/\s*–\s*/g, '–')}`;
}

function cardPriceLabel(card: HomeFeedCard): string | null {
  const priceArr = Array.isArray(card.erbjudandepris) ? card.erbjudandepris : [];
  const raw = priceArr[0];
  if (raw == null || raw === '') return null;
  const price = Number(raw);
  if (!Number.isFinite(price)) return null;
  if (price <= 0) return 'Gratis';
  return `Från ${Math.round(price)} kr`;
}

function cardCategoryTagLabel(card: HomeFeedCard): string | null {
  if (card.resultKind === 'event') return 'Evenemang';
  const labels = getCategoryLabelsForItem(card);
  return labels[0] ?? card.categoryName?.trim() ?? null;
}

/** Place meta under the title: hours, then price · distance · subcategory. */
function CardPlaceMeta({
  card,
  compact = false,
}: {
  card: HomeFeedCard;
  compact?: boolean;
}) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const hoursLabel = cardTodayHoursLabel(card);
  const priceLabel = cardPriceLabel(card);
  const distance = formatDistanceKm(card.distanceKm);
  const subcategory =
    typeof card.subcategoryName === 'string' ? card.subcategoryName.trim() : '';
  const iconSize = compact ? 13 : 14;
  const textSize = compact ? 12 : 13;
  const ink = theme.textFaint;
  const pinParts = [priceLabel, distance, subcategory || null].filter(Boolean);
  const pinText = pinParts.join(' · ');

  const rowGap = compact ? 3 : 4;
  const rowH = Math.ceil(textSize * 1.25);

  // Always reserve two meta rows so card heights stay even when hours are missing.
  // When there's no öppettid, pin meta sits in the first row (pushed up).
  return (
    <View style={{ gap: rowGap, marginTop: compact ? 4 : 5, minHeight: rowH * 2 + rowGap }}>
      {hoursLabel ? (
        <>
          <View style={[styles.metaRow, { minHeight: rowH }]}>
            <Ionicons name="time-outline" size={iconSize} color={ink} />
            <Text style={[styles.metaText, { color: ink, fontSize: textSize }]} numberOfLines={1}>
              {hoursLabel}
            </Text>
          </View>
          <View style={[styles.metaRow, { minHeight: rowH }]}>
            {pinText ? (
              <>
                <Ionicons name="location-outline" size={iconSize} color={ink} />
                <Text style={[styles.metaText, { color: ink, fontSize: textSize }]} numberOfLines={1}>
                  {pinText}
                </Text>
              </>
            ) : null}
          </View>
        </>
      ) : (
        <>
          <View style={[styles.metaRow, { minHeight: rowH }]}>
            {pinText ? (
              <>
                <Ionicons name="location-outline" size={iconSize} color={ink} />
                <Text style={[styles.metaText, { color: ink, fontSize: textSize }]} numberOfLines={1}>
                  {pinText}
                </Text>
              </>
            ) : null}
          </View>
          <View style={[styles.metaRow, { minHeight: rowH }]} />
        </>
      )}
    </View>
  );
}

function CategoryTagPill({ label }: { label: string }) {
  return (
    <View style={[styles.categoryTag, OVERLAY_BLUR_WEB]}>
      <OverlayDarkLens />
      <FrostedOverlayWash />
      <Ionicons
        name={getCategoryIconName(label)}
        size={12}
        color={getCategoryAccentColor(label)}
        style={{ zIndex: 1 }}
      />
      <Text style={styles.categoryTagText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function CardFavoriteButton({
  businessId,
  enabled,
}: {
  businessId: string;
  enabled: boolean;
}) {
  const { isFavorite, toggleFavorite } = useFavorites();
  if (!enabled) return null;
  const active = isFavorite(businessId);
  return (
    <Pressable
      onPress={async (e: any) => {
        e?.stopPropagation?.();
        await toggleFavorite(businessId);
      }}
      hitSlop={10}
      style={[styles.favHit, OVERLAY_BLUR_WEB]}
      accessibilityRole="button"
      accessibilityLabel={active ? 'Ta bort favorit' : 'Lägg till favorit'}
    >
      <OverlayDarkLens />
      <FrostedOverlayWash />
      <Ionicons
        name={active ? 'heart' : 'heart-outline'}
        size={15}
        color={active ? FAVORITE_HEART_COLOR : '#ffffff'}
        style={{ zIndex: 1 }}
      />
    </Pressable>
  );
}

export function getRemainingLabel(card: HomeFeedCard): string | null {
  const claimedRaw = Array.isArray(card.erbjudandeclaimade)
    ? card.erbjudandeclaimade[0]
    : card.erbjudandeclaimade;
  const maxRaw = Array.isArray(card.erbjudandemängd) ? card.erbjudandemängd[0] : card.erbjudandemängd;
  const claimed = Number(claimedRaw);
  const max = Number(maxRaw);
  if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(claimed)) return null;
  const left = Math.max(0, max - claimed);
  if (left <= 0) return null;
  return `${left} kvar`;
}

export function HomeLaunchPad({
  onMap,
  onLunch,
  onWeekend,
  onEndingSoon,
}: {
  onMap: () => void;
  onLunch: () => void;
  onWeekend: () => void;
  onEndingSoon: () => void;
}) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const tiles = [
    { key: 'map', label: 'Karta', icon: 'map' as const, color: LAUNCH_BLUE, onPress: onMap },
    { key: 'lunch', label: 'Lunch', icon: 'restaurant' as const, color: LAUNCH_RED, onPress: onLunch },
    { key: 'weekend', label: 'Helg', icon: 'sunny' as const, color: LAUNCH_ORANGE, onPress: onWeekend },
    {
      key: 'ending',
      label: 'Snart',
      icon: 'hourglass' as const,
      color: LAUNCH_PURPLE,
      onPress: onEndingSoon,
    },
  ];

  return (
    <View style={styles.launchBar}>
      {tiles.map((tile) => (
        <Pressable
          key={tile.key}
          onPress={tile.onPress}
          accessibilityRole="button"
          accessibilityLabel={tile.label}
          style={[styles.launchSeg, NO_OUTLINE]}
        >
          <View style={[styles.launchOrb, { backgroundColor: tile.color }]}>
            <Ionicons name={tile.icon} size={28} color="#ffffff" />
          </View>
          <Text numberOfLines={1} style={[styles.launchLabel, { color: theme.text }]}>
            {tile.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function HomeSectionHeader({
  kicker,
  title,
  subtitle,
  onSeeAllPress,
  seeAllLabel = 'Visa alla',
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  onSeeAllPress?: () => void;
  seeAllLabel?: string;
}) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);

  return (
    <View style={{ marginBottom: 14 }}>
      {kicker ? (
        <Text
          style={{
            color: theme.textFaint,
            fontSize: 12,
            fontWeight: '600',
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          {kicker}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text
          style={{
            flex: 1,
            color: theme.text,
            fontSize: 24,
            fontWeight: '700',
            letterSpacing: -0.7,
            lineHeight: 28,
            paddingRight: 12,
          }}
        >
          {title}
        </Text>
        {onSeeAllPress ? (
          <Pressable
            onPress={onSeeAllPress}
            style={styles.seeAll}
            accessibilityRole="button"
            accessibilityLabel={seeAllLabel}
          >
            <Text style={{ color: theme.link, fontSize: 14, fontWeight: '600' }}>{seeAllLabel}</Text>
            <Ionicons name="chevron-forward" size={15} color={theme.link} />
          </Pressable>
        ) : null}
      </View>
      {subtitle ? (
        <Text style={{ marginTop: 6, color: theme.textMuted, fontSize: 14, fontWeight: '500', letterSpacing: -0.15 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

function HomeListingCard({
  card,
  onPress,
  imageHeight = POSTER_IMAGE_H,
  showFavorite = true,
  showActivityDots = false,
  businessIdsWithEvents,
  imagePriority = 'normal',
  editorial = false,
  compact = false,
}: {
  card: HomeFeedCard;
  onPress?: (card: HomeFeedCard) => void;
  imageHeight?: number;
  showFavorite?: boolean;
  showActivityDots?: boolean;
  businessIdsWithEvents?: Set<string>;
  imagePriority?: 'high' | 'normal';
  /** Full-width explore cards — taller media, softer chrome, roomier type. */
  editorial?: boolean;
  compact?: boolean;
}) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const { isLoggedIn, role } = useAuth();
  const isEvent = card.resultKind === 'event';
  const canFavorite = showFavorite && !isEvent && isLoggedIn && role === 'USER';
  const placeName = displayName(card.title);
  const tagLabel = cardCategoryTagLabel(card);
  const cityLabel = cardCityLabel(card);

  return (
    <Pressable
      onPress={() => onPress?.(card)}
      style={[
        styles.listingCard,
        { backgroundColor: 'transparent' },
        editorial ? styles.listingCardEditorial : null,
        NO_OUTLINE,
      ]}
      accessibilityRole="button"
      accessibilityLabel={placeName}
    >
      <View style={[styles.posterImageWrap, { height: imageHeight }]}>
        <CardMedia
          source={card.image}
          svgFit="fill"
          priority={imagePriority}
          displayWidth={editorial ? IMAGE_DISPLAY_WIDTH.cardWide : IMAGE_DISPLAY_WIDTH.card}
        />
        {editorial ? (
          <LinearGradient
            colors={['transparent', 'rgba(8,12,22,0.55)']}
            locations={[0.45, 1]}
            style={styles.editorialImageFade}
            pointerEvents="none"
          />
        ) : null}
        <View style={styles.dealTopRow} pointerEvents="box-none">
          <View style={{ gap: 4, alignItems: 'flex-start', flexShrink: 1 }}>
            {tagLabel ? <CategoryTagPill label={tagLabel} /> : null}
            {showActivityDots && !isEvent ? (
              <CompanyActivityDots
                hasEvent={businessIdsWithEvents?.has(card.id) ?? false}
                hasOffer={Boolean(card.deal)}
                eventColor={theme.eventColor}
              />
            ) : null}
          </View>
          <CardFavoriteButton businessId={card.id} enabled={canFavorite} />
        </View>
      </View>
      <View
        style={
          editorial
            ? compact
              ? styles.editorialBodyCompact
              : styles.editorialBody
            : styles.posterBody
        }
      >
        <View style={editorial ? undefined : styles.posterTextBlock}>
          <Text
            style={[
              editorial
                ? compact
                  ? styles.editorialTitleCompact
                  : styles.editorialTitle
                : styles.posterTitle,
              { color: theme.text },
            ]}
            numberOfLines={2}
          >
            {placeName}
          </Text>
          {editorial && cityLabel ? (
            <Text
              style={[
                compact ? styles.editorialCityCompact : styles.editorialCity,
                { color: theme.textFaint },
              ]}
              numberOfLines={1}
            >
              {cityLabel}
            </Text>
          ) : null}
          <CardPlaceMeta card={card} compact={!editorial || compact} />
        </View>
      </View>
    </Pressable>
  );
}

/** Editorial grid used by home sections. Default two columns; `columns={1}` is full width. */
export function HomeCardGrid({
  cards,
  onCardPress,
  emptyText,
  maxItems = 4,
  columns = 2,
  compact = false,
  showFavoriteButton = true,
  showActivityDots = false,
  businessIdsWithEvents,
}: {
  cards: HomeFeedCard[];
  onCardPress?: (card: HomeFeedCard) => void;
  emptyText: string;
  /** Pass `null` to render every card (endless explore). */
  maxItems?: number | null;
  columns?: 1 | 2;
  compact?: boolean;
  showFavoriteButton?: boolean;
  showActivityDots?: boolean;
  businessIdsWithEvents?: Set<string>;
}) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const items = maxItems == null ? cards : cards.slice(0, maxItems);
  const fullWidth = columns === 1;
  const imageHeight = fullWidth
    ? compact
      ? POSTER_IMAGE_H_FULL_COMPACT
      : POSTER_IMAGE_H_FULL
    : compact
      ? POSTER_IMAGE_H_COMPACT
      : POSTER_IMAGE_H;

  if (items.length === 0) {
    return <Text style={{ color: theme.textMuted }}>{emptyText}</Text>;
  }

  return (
    <View
      style={
        fullWidth
          ? [styles.cardStack, compact ? styles.cardStackCompact : null]
          : styles.cardGrid
      }
    >
      {items.map((card, idx) => (
        <View
          key={`${card.resultKind ?? 'business'}:${card.orderIds?.[0] ?? card.id}-${idx}`}
          style={fullWidth ? styles.cardStackCell : styles.cardGridCell}
        >
          <HomeListingCard
            card={card}
            onPress={onCardPress}
            imageHeight={imageHeight}
            showFavorite={showFavoriteButton}
            showActivityDots={showActivityDots}
            businessIdsWithEvents={businessIdsWithEvents}
            imagePriority={idx < 4 ? 'high' : 'normal'}
            editorial={fullWidth}
            compact={compact}
          />
        </View>
      ))}
    </View>
  );
}

export function HomeDealTile({
  card,
  onPress,
  titleSize = 'sm',
  height,
  rank,
  /** Full-bleed photo with text on the image — used by the Populärt mosaic. */
  variant = 'stack',
}: {
  card: HomeFeedCard;
  onPress?: (card: HomeFeedCard) => void;
  titleSize?: 'sm' | 'lg';
  height?: number;
  rank?: number;
  variant?: 'stack' | 'overlay';
}) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const { isLoggedIn, role } = useAuth();
  const isEvent = card.resultKind === 'event';
  const large = titleSize === 'lg';
  const overlay = variant === 'overlay';
  const placeName = displayName(card.title);
  const tagLabel =
    rank != null
      ? String(rank).padStart(2, '0')
      : cardCategoryTagLabel(card);
  const canFavorite = !isEvent && isLoggedIn && role === 'USER';
  const hoursLabel = cardTodayHoursLabel(card);
  const distance = formatDistanceKm(card.distanceKm);
  const subcategory =
    typeof card.subcategoryName === 'string' ? card.subcategoryName.trim() : '';
  const overlayMeta = [subcategory || null, distance].filter(Boolean).join(' · ');
  const focusPlaceLine = overlayMeta;
  const fadeBase = theme.cardBg;

  return (
    <Pressable
      onPress={() => onPress?.(card)}
      style={[
        styles.dealTile,
        height != null ? { height, width: '100%' } : StyleSheet.absoluteFillObject,
        {
          backgroundColor: overlay ? theme.cardBg : 'transparent',
        },
        NO_OUTLINE,
      ]}
    >
      {overlay ? (
        <>
          <View style={StyleSheet.absoluteFillObject}>
            <CardMedia
              source={card.image}
              svgFit="fill"
              priority="high"
              displayWidth={IMAGE_DISPLAY_WIDTH.cardWide}
            />
          </View>
          <View style={styles.dealTopRow} pointerEvents="box-none">
            {tagLabel ? <CategoryTagPill label={tagLabel} /> : <View />}
            <CardFavoriteButton businessId={card.id} enabled={canFavorite} />
          </View>
          <LinearGradient
            colors={[
              hexToRgba(fadeBase, 0),
              hexToRgba(fadeBase, 0.58),
              hexToRgba(fadeBase, 0.96),
            ]}
            locations={[0, 0.45, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[
              styles.dealOverlayGradient,
              large ? styles.dealOverlayGradientLg : styles.dealOverlayGradientSm,
            ]}
          >
            <Text
              style={{
                color: '#ffffff',
                fontSize: large ? 17 : 13,
                fontWeight: '800',
                letterSpacing: large ? -0.3 : -0.15,
                lineHeight: large ? 21 : 16,
              }}
              numberOfLines={large ? 2 : 2}
            >
              {placeName}
            </Text>
            {large ? (
              <>
                {hoursLabel ? (
                  <Text
                    style={{
                      marginTop: 5,
                      color: 'rgba(255,255,255,0.88)',
                      fontSize: 12,
                      fontWeight: '600',
                    }}
                    numberOfLines={1}
                  >
                    {hoursLabel}
                  </Text>
                ) : null}
                {focusPlaceLine ? (
                  <Text
                    style={{
                      marginTop: hoursLabel ? 2 : 5,
                      color: 'rgba(255,255,255,0.78)',
                      fontSize: 12,
                      fontWeight: '600',
                    }}
                    numberOfLines={1}
                  >
                    {focusPlaceLine}
                  </Text>
                ) : null}
              </>
            ) : overlayMeta ? (
              <Text
                style={{
                  marginTop: 3,
                  color: 'rgba(255,255,255,0.88)',
                  fontSize: 11,
                  fontWeight: '600',
                }}
                numberOfLines={1}
              >
                {overlayMeta}
              </Text>
            ) : null}
          </LinearGradient>
        </>
      ) : (
        <>
          <View style={styles.dealImageWrap}>
            <CardMedia
              source={card.image}
              svgFit="fill"
              priority="high"
              displayWidth={IMAGE_DISPLAY_WIDTH.cardWide}
            />
            <View style={styles.dealTopRow} pointerEvents="box-none">
              {tagLabel ? <CategoryTagPill label={tagLabel} /> : <View />}
              <CardFavoriteButton businessId={card.id} enabled={canFavorite} />
            </View>
          </View>
          <View style={[styles.dealBody, large ? styles.dealBodyLg : styles.dealBodySm]}>
            <View style={large ? styles.dealTextBlockLg : undefined}>
              <Text
                style={{
                  color: theme.text,
                  fontSize: large ? 16 : 13,
                  fontWeight: '800',
                  letterSpacing: large ? -0.3 : -0.15,
                  lineHeight: large ? 20 : 16,
                }}
                numberOfLines={large ? 2 : 1}
              >
                {placeName}
              </Text>
              <CardPlaceMeta card={card} compact={!large} />
            </View>
          </View>
        </>
      )}
    </Pressable>
  );
}

function featuredLayout(width: number, count: number) {
  if (width < FEATURED_MIN_WIDTH) {
    return { cardWidth: 0, interval: 0, sidePad: 0 };
  }
  const cardWidth = count <= 1 ? width : Math.round(width * FEATURED_CARD_RATIO);
  const interval = cardWidth + (count <= 1 ? 0 : FEATURED_GAP);
  const sidePad = Math.max(0, (width - cardWidth) / 2);
  return { cardWidth, interval, sidePad };
}

const FeaturedSlideBody = memo(function FeaturedSlideBody({
  card,
  onPress,
}: {
  card: HomeFeedCard;
  onPress?: (card: HomeFeedCard) => void;
}) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const { isLoggedIn, role } = useAuth();
  const placeName = displayName(card.title);
  const imageUri = featuredImageUri(card);
  const tagLabel = cardCategoryTagLabel(card);
  const canFavorite = card.resultKind !== 'event' && isLoggedIn && role === 'USER';

  return (
    <Pressable
      onPress={() => onPress?.(card)}
      style={[
        styles.featuredSlide,
        { backgroundColor: 'transparent' },
        NO_OUTLINE,
      ]}
      accessibilityRole="button"
      accessibilityLabel={placeName}
    >
      <View style={styles.featuredImageWrap}>
        {Platform.OS === 'web' && imageUri ? (
          <div className="toodoo-featured-photo" style={{ backgroundImage: cssImageUrl(imageUri) }} />
        ) : (
          <CardMedia
            source={card.image}
            svgFit="fill"
            priority="high"
            cachePolicy="memory-disk"
            displayWidth={IMAGE_DISPLAY_WIDTH.hero}
          />
        )}
        <View style={styles.dealTopRow} pointerEvents="box-none">
          {tagLabel ? <CategoryTagPill label={tagLabel} /> : <View />}
          <CardFavoriteButton businessId={card.id} enabled={canFavorite} />
        </View>
      </View>
      <View style={styles.featuredBody}>
        <Text
          style={{ color: theme.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.35 }}
          numberOfLines={2}
        >
          {placeName}
        </Text>
        <CardPlaceMeta card={card} />
      </View>
    </Pressable>
  );
}, (prev, next) => (
  prev.card.id === next.card.id &&
  featuredImageUri(prev.card) === featuredImageUri(next.card) &&
  prev.card.title === next.card.title &&
  prev.card.distanceKm === next.card.distanceKm &&
  prev.card.categoryName === next.card.categoryName &&
  (prev.card.categoryNames ?? []).join('|') === (next.card.categoryNames ?? []).join('|') &&
  prev.card.openingHours === next.card.openingHours &&
  prev.card.erbjudandepris === next.card.erbjudandepris &&
  prev.onPress === next.onPress
));

function FeaturedSlide({
  card,
  width,
  index,
  interval,
  scrollX,
  marginRight,
  onPress,
}: {
  card: HomeFeedCard;
  width: number;
  index: number;
  interval: number;
  scrollX: SharedValue<number>;
  marginRight: number;
  onPress?: (card: HomeFeedCard) => void;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const center = index * interval;
    const scale = interpolate(
      scrollX.value,
      [center - interval, center, center + interval],
      [FEATURED_SIDE_SCALE, 1, FEATURED_SIDE_SCALE],
      Extrapolation.CLAMP
    );
    const focus = interpolate(
      scrollX.value,
      [center - interval, center, center + interval],
      [0, 1, 0],
      Extrapolation.CLAMP
    );
    return {
      transform: [{ scale }],
      opacity: 0.78 + focus * 0.22,
      zIndex: Math.round(focus * 10),
    };
  });

  return (
    <Animated.View
      style={[
        {
          width,
          height: FEATURED_H,
          marginRight,
        },
        animatedStyle,
      ]}
    >
      <FeaturedSlideBody card={card} onPress={onPress} />
    </Animated.View>
  );
}

/**
 * Infinite web coverflow: triple the cards, stay in the middle copy, teleport
 * when you cross into an edge copy. No empty spacers — those caused the blank strip.
 */
function WebFeaturedCoverflow({
  items,
  onPress,
  pauseRef,
  active,
}: {
  items: HomeFeedCard[];
  onPress?: (card: HomeFeedCard) => void;
  pauseRef?: { current: boolean };
  active: boolean;
}) {
  const count = items.length;
  const looping = count > 1;
  const slides = useMemo(
    () => (looping ? [...items, ...items, ...items] : items),
    [items, looping]
  );
  const itemKey = items.map((card) => card.id).join('|');
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const preloadRef = useRef<HTMLDivElement>(null);
  const slideEls = useRef<(HTMLDivElement | null)[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const lastWarmLogicalRef = useRef(-1);
  const wrappingRef = useRef(false);
  const ignoreScrollRef = useRef(false);
  const userPausedRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageRef = useRef(looping ? count : 0);
  const activeRef = useRef(active);
  activeRef.current = active;
  const layoutRef = useRef({ cardWidth: 0, interval: 0, sidePad: 0, width: 0 });
  const [width, setWidth] = useState(0);

  const { cardWidth, interval, sidePad } = featuredLayout(width, count);
  layoutRef.current = { cardWidth, interval, sidePad, width };

  const scrollerVisible = useCallback(() => {
    const el = scrollerRef.current ?? rootRef.current;
    if (!el) return false;
    return el.clientWidth >= FEATURED_MIN_WIDTH;
  }, []);

  const paintPreload = useCallback((uris: string[]) => {
    const root = preloadRef.current;
    if (!root) return;
    const have = new Set(
      Array.from(root.children, (node) => (node as HTMLElement).dataset.uri).filter(Boolean)
    );
    const slideW = layoutRef.current.cardWidth;
    uris.forEach((uri) => {
      if (have.has(uri)) return;
      const el = document.createElement('div');
      el.className = 'toodoo-featured-photo';
      el.dataset.uri = uri;
      el.style.backgroundImage = cssImageUrl(uri);
      el.style.width = slideW > 0 ? `${slideW}px` : '100%';
      el.style.height = `${FEATURED_IMAGE_H}px`;
      root.appendChild(el);
    });
  }, []);

  const logicalFromPage = useCallback(
    (page: number) => {
      if (count <= 0) return 0;
      return ((page % count) + count) % count;
    },
    [count]
  );

  const warmFromPage = useCallback(
    (page: number) => {
      const cards = itemsRef.current;
      if (cards.length === 0) return;
      const logical = logicalFromPage(page);
      if (logical === lastWarmLogicalRef.current) return;
      lastWarmLogicalRef.current = logical;
      const uris = featuredAheadUris(cards, logical);
      decodeFeaturedUris(uris);
      void prefetchImageUris(uris, FEATURED_PRELOAD_AHEAD + 1);
      paintPreload(uris);
    },
    [logicalFromPage, paintPreload]
  );

  const scrollLeftForPage = useCallback((page: number) => {
    const { interval: step, sidePad: pad } = layoutRef.current;
    if (step <= 0) return 0;
    // Center the page without spacer elements (spacers were the empty zone).
    return Math.max(0, page * step - pad);
  }, []);

  const applyScales = useCallback(
    (x: number, commitPage = true) => {
      if (!activeRef.current || !scrollerVisible()) return;
      const step = layoutRef.current.interval;
      const pad = layoutRef.current.sidePad;
      if (step <= 0) return;
      // Invert centered scroll math: page ≈ (x + pad) / step
      const page = Math.round((x + pad) / step);
      if (commitPage) {
        pageRef.current = page;
        warmFromPage(page);
      }
      slides.forEach((_, i) => {
        const el = slideEls.current[i];
        if (!el) return;
        const center = scrollLeftForPage(i);
        const dist = Math.min(Math.abs(x - center) / step, 1);
        const scale = 1 - dist * (1 - FEATURED_SIDE_SCALE);
        el.style.transform = `scale(${scale})`;
        el.style.zIndex = String(Math.round((1 - dist) * 10));
      });
    },
    [scrollerVisible, scrollLeftForPage, slides, warmFromPage]
  );

  const jumpTo = useCallback(
    (page: number) => {
      const el = scrollerRef.current;
      const step = layoutRef.current.interval;
      if (!el || step <= 0 || slides.length === 0) return;
      const nextPage = Math.min(slides.length - 1, Math.max(0, page));
      const x = scrollLeftForPage(nextPage);
      pageRef.current = nextPage;
      warmFromPage(nextPage);

      wrappingRef.current = true;
      ignoreScrollRef.current = true;
      el.classList.add('is-wrapping');
      el.style.setProperty('scroll-snap-type', 'none');
      void el.offsetWidth;
      el.scrollLeft = x;
      applyScales(x, false);

      requestAnimationFrame(() => {
        el.scrollLeft = x;
        applyScales(x, false);
        requestAnimationFrame(() => {
          el.scrollLeft = x;
          el.style.removeProperty('scroll-snap-type');
          el.classList.remove('is-wrapping');
          applyScales(el.scrollLeft, true);
          wrappingRef.current = false;
          ignoreScrollRef.current = false;
        });
      });
    },
    [applyScales, scrollLeftForPage, slides.length, warmFromPage]
  );

  /** Keep the viewport in the middle copy so you can keep swiping forever. */
  const wrapIfNeeded = useCallback(
    (x: number) => {
      if (!looping || wrappingRef.current || ignoreScrollRef.current) return false;
      const step = layoutRef.current.interval;
      const pad = layoutRef.current.sidePad;
      if (step <= 0) return false;
      const page = Math.round((x + pad) / step);

      if (page >= count * 2) {
        jumpTo(page - count);
        return true;
      }
      if (page < count) {
        jumpTo(page + count);
        return true;
      }
      return false;
    },
    [count, jumpTo, looping]
  );

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const sync = () => {
      const next = Math.round(root.getBoundingClientRect().width);
      if (next >= FEATURED_MIN_WIDTH) {
        setWidth((current) => (Math.abs(current - next) < 8 ? current : next));
      }
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(root);
    return () => observer.disconnect();
  }, [itemKey]);

  useLayoutEffect(() => {
    pageRef.current = looping ? count : 0;
  }, [count, itemKey, looping]);

  useLayoutEffect(() => {
    if (!active || interval <= 0) return;
    jumpTo(pageRef.current);
  }, [active, interval, itemKey, jumpTo]);

  const pauseAutoplay = useCallback(() => {
    userPausedRef.current = true;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      userPausedRef.current = false;
      resumeTimerRef.current = null;
    }, FEATURED_RESUME_MS);
  }, []);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!activeRef.current || wrappingRef.current || ignoreScrollRef.current) return;
    const x = event.currentTarget.scrollLeft;
    applyScales(x);
    // Mid-swipe wrap when deep into an edge copy keeps a real card on screen.
    wrapIfNeeded(x);
  };

  const settleWrap = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || wrappingRef.current) return;
    if (wrapIfNeeded(el.scrollLeft)) return;
    applyScales(el.scrollLeft, true);
  }, [applyScales, wrapIfNeeded]);

  useEffect(() => {
    lastWarmLogicalRef.current = -1;
    warmFromPage(looping ? count : 0);
  }, [count, itemKey, looping, warmFromPage]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onEnd = () => settleWrap();
    el.addEventListener('scrollend', onEnd);
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('scrollend', onEnd);
      el.removeEventListener('touchend', onEnd);
    };
  }, [cardWidth, itemKey, settleWrap]);

  useEffect(() => {
    if (!active || !looping || interval <= 0) return;
    const id = setInterval(() => {
      if (!activeRef.current || userPausedRef.current || pauseRef?.current) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (!scrollerVisible()) return;
      const page = pageRef.current;
      // Step forward inside the middle/third copy, then normalize back to middle.
      const next = page + 1;
      jumpTo(next);
      if (next >= count * 2) {
        // Silent normalize: third-copy first card ≡ middle-copy first card.
        requestAnimationFrame(() => jumpTo(next - count));
      }
    }, FEATURED_AUTO_MS);
    return () => {
      clearInterval(id);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [active, count, interval, jumpTo, looping, pauseRef, scrollerVisible]);

  return (
    <div ref={rootRef} style={{ position: 'relative', width: '100%', height: FEATURED_H }}>
      <div ref={preloadRef} aria-hidden className="toodoo-featured-preload" />
      {cardWidth > 0 ? (
        <div
          ref={scrollerRef}
          className="toodoo-featured-coverflow"
          onScroll={handleScroll}
          onPointerDown={pauseAutoplay}
          onWheel={pauseAutoplay}
        >
          {slides.map((card, idx) => (
            <div
              key={`${card.id}:${idx}`}
              ref={(node) => {
                slideEls.current[idx] = node;
              }}
              className="toodoo-featured-slide"
              style={{
                flex: `0 0 ${cardWidth}px`,
                width: cardWidth,
                height: FEATURED_H,
                marginRight: idx < slides.length - 1 ? FEATURED_GAP : 0,
                borderRadius: HOME_RADIUS,
              }}
            >
              <FeaturedSlideBody card={card} onPress={onPress} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function HomeFeaturedPick({
  cards,
  onPress,
  pauseRef,
}: {
  cards: HomeFeedCard[];
  onPress?: (card: HomeFeedCard) => void;
  pauseRef?: { current: boolean };
}) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const isFocused = useIsFocused();
  const items = cards.slice(0, 6);
  const count = items.length;
  const looping = count > 1;
  const slides = useMemo(
    () => (looping ? [...items, ...items, ...items] : items),
    [items, looping]
  );
  const itemKey = items.map((card) => card.id).join('|');
  const scrollRef = useRef<ScrollView>(null);
  const indexRef = useRef(looping ? count : 0);
  const wrappingRef = useRef(false);
  const widthRef = useRef(0);
  const intervalRef = useRef(0);
  const userPausedRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [width, setWidth] = useState(0);
  const scrollX = useSharedValue(0);

  const { cardWidth, interval, sidePad } = featuredLayout(width, count);
  const snapOffsets = useMemo(
    () => (interval > 0 ? slides.map((_, i) => i * interval) : []),
    [interval, slides.length]
  );

  const scrollToPage = useCallback(
    (page: number, animated: boolean) => {
      const step = intervalRef.current;
      if (step <= 0 || slides.length === 0) return;
      const nextPage = Math.min(slides.length - 1, Math.max(0, page));
      const x = nextPage * step;
      indexRef.current = nextPage;
      scrollX.value = x;
      scrollRef.current?.scrollTo({ x, animated });
    },
    [scrollX, slides.length]
  );

  const applyLogical = useCallback(
    (page: number) => {
      const logical = count > 0 ? ((page % count) + count) % count : 0;
      warmFeaturedAhead(items, logical);
    },
    [count, itemKey]
  );

  const wrapIfNeeded = useCallback(
    (x: number) => {
      const step = intervalRef.current;
      if (!looping || step <= 0 || wrappingRef.current) return;
      const page = Math.round(x / step);
      if (page >= count * 2) {
        wrappingRef.current = true;
        scrollToPage(page - count, false);
        applyLogical(page - count);
        requestAnimationFrame(() => {
          scrollToPage(page - count, false);
          wrappingRef.current = false;
        });
        return;
      }
      if (page < count) {
        wrappingRef.current = true;
        scrollToPage(page + count, false);
        applyLogical(page + count);
        requestAnimationFrame(() => {
          scrollToPage(page + count, false);
          wrappingRef.current = false;
        });
      }
    },
    [applyLogical, count, looping, scrollToPage]
  );

  const handleOffset = useCallback(
    (x: number) => {
      scrollX.value = x;
      const step = intervalRef.current;
      if (step <= 0 || wrappingRef.current) return;
      const page = Math.round(x / step);
      indexRef.current = page;
      applyLogical(page);
      wrapIfNeeded(x);
    },
    [applyLogical, scrollX, wrapIfNeeded]
  );

  const pauseAutoplay = useCallback(() => {
    userPausedRef.current = true;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      userPausedRef.current = false;
      resumeTimerRef.current = null;
    }, FEATURED_RESUME_MS);
  }, []);

  useEffect(() => {
    const start = looping ? count : 0;
    indexRef.current = start;
    if (intervalRef.current > 0) scrollToPage(start, false);
  }, [count, itemKey, looping, scrollToPage]);

  useEffect(() => {
    if (Platform.OS === 'web' || !isFocused || !looping || width <= 0) return;

    const id = setInterval(() => {
      if (!isFocused || userPausedRef.current || pauseRef?.current) return;
      const page = indexRef.current;
      const next = page + 1;
      scrollToPage(next, false);
      applyLogical(next);
      if (next >= count * 2) {
        requestAnimationFrame(() => {
          scrollToPage(next - count, false);
          applyLogical(next - count);
        });
      }
    }, FEATURED_AUTO_MS);

    return () => {
      clearInterval(id);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [applyLogical, count, isFocused, looping, pauseRef, scrollToPage, width]);

  useEffect(() => {
    if (Platform.OS === 'web' || !isFocused || intervalRef.current <= 0) return;
    scrollToPage(indexRef.current, false);
  }, [isFocused, scrollToPage]);

  useEffect(() => {
    warmFeaturedAhead(items, count > 0 ? ((indexRef.current % count) + count) % count : 0);
  }, [itemKey]);

  if (items.length === 0) {
    return <Text style={{ color: theme.textMuted }}>Inga heta erbjudanden just nu.</Text>;
  }

  if (Platform.OS === 'web') {
    return (
      <View style={{ marginHorizontal: -HOME_PAGE_PAD }}>
        <WebFeaturedCoverflow items={items} onPress={onPress} pauseRef={pauseRef} active={isFocused} />
      </View>
    );
  }

  const syncToWidth = (next: number) => {
    const layout = featuredLayout(next, count);
    widthRef.current = next;
    intervalRef.current = layout.interval;
    setWidth(next);
    const start = (looping ? count : 0) * layout.interval;
    indexRef.current = looping ? count : 0;
    scrollX.value = start;
    requestAnimationFrame(() => {
      scrollToPage(indexRef.current, false);
    });
  };

  return (
    <View
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        if (!isFocused || next < FEATURED_MIN_WIDTH || next === widthRef.current) return;
        syncToWidth(next);
      }}
      style={[styles.featured, { marginHorizontal: -HOME_PAGE_PAD }]}
    >
      {interval > 0 ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          nestedScrollEnabled
          directionalLockEnabled={Platform.OS === 'ios'}
          decelerationRate="fast"
          snapToInterval={interval}
          snapToOffsets={snapOffsets}
          snapToAlignment="start"
          disableIntervalMomentum
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: sidePad }}
          onScroll={(event) => handleOffset(event.nativeEvent.contentOffset.x)}
          onScrollBeginDrag={pauseAutoplay}
          onMomentumScrollEnd={(event) => {
            handleOffset(event.nativeEvent.contentOffset.x);
            wrapIfNeeded(event.nativeEvent.contentOffset.x);
          }}
          onScrollEndDrag={(event) => {
            handleOffset(event.nativeEvent.contentOffset.x);
            wrapIfNeeded(event.nativeEvent.contentOffset.x);
          }}
        >
          {slides.map((card, idx) => (
            <FeaturedSlide
              key={`${card.id}:${idx}`}
              card={card}
              width={cardWidth}
              index={idx}
              interval={interval}
              scrollX={scrollX}
              marginRight={idx < slides.length - 1 ? FEATURED_GAP : 0}
              onPress={onPress}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const RECENT_CARD_W = 108;
const RECENT_IMG_H = 108;
const RECENT_RADIUS = 16;

export function HomeRecentCompanies({
  cards,
  onCardPress,
  scrollKey = 'home:recent',
}: {
  cards: RecentCompanyCard[];
  onCardPress?: (card: HomeFeedCard) => void;
  scrollKey?: string;
}) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const items = useMemo(() => cards.slice(0, 12), [cards]);
  const rail = usePersistedRailScroll(scrollKey);

  useEffect(() => {
    const uris = items
      .map((card) => {
        const raw =
          typeof card.image === 'object' && card.image && 'uri' in card.image
            ? card.image.uri
            : undefined;
        return typeof raw === 'string' ? sizedImageUrl(raw, IMAGE_DISPLAY_WIDTH.thumb) ?? raw : undefined;
      })
      .filter((uri): uri is string => Boolean(uri));
    void prefetchImageUris(uris, 12);
  }, [items]);

  if (items.length === 0) return null;

  return (
    <View style={{ marginHorizontal: -HOME_PAGE_PAD }}>
      <ScrollView
        ref={rail.scrollRef}
        horizontal
        nestedScrollEnabled
        directionalLockEnabled={Platform.OS === 'ios'}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: HOME_PAGE_PAD, paddingVertical: 2 }}
        contentOffset={rail.contentOffset}
        scrollEventThrottle={rail.scrollEventThrottle}
        onScroll={rail.onScroll}
      >
        <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 14 }}>
          {items.map((card, idx) => {
            const category = card.categoryName?.trim() || undefined;
            const accent = getCategoryAccentColor(category);
            const isNew = isNewRecentCompany(card.id);
            const visitLabel = formatRecentVisitLabel(card.lastClickedAt);
            const meta = isNew ? 'Nytt' : visitLabel;
            return (
              <Pressable
                key={`recent:${card.id}-${idx}`}
                onPress={() => onCardPress?.(card)}
                accessibilityRole="button"
                accessibilityLabel={
                  meta ? `${card.title}, ${meta}` : card.title
                }
                style={[styles.recentItem, NO_OUTLINE]}
              >
                <View
                  style={[
                    styles.recentMedia,
                    {
                      backgroundColor: theme.cardBg,
                    },
                  ]}
                >
                  <CardMedia
                    source={card.image}
                    svgFit="cover"
                    priority={idx < 6 ? 'high' : 'normal'}
                    displayWidth={IMAGE_DISPLAY_WIDTH.thumb}
                  />
                  <View
                    style={[styles.recentAccentBar, { backgroundColor: accent }]}
                  />
                  {meta ? (
                    <View
                      style={[
                        styles.recentMetaChip,
                        {
                          backgroundColor:
                            mode === 'dark'
                              ? 'rgba(8,12,20,0.78)'
                              : 'rgba(255,255,255,0.92)',
                        },
                      ]}
                    >
                      {isNew ? (
                        <View style={[styles.recentMetaDot, { backgroundColor: theme.danger }]} />
                      ) : null}
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.recentMetaText,
                          { color: isNew ? theme.danger : theme.textMuted },
                        ]}
                      >
                        {meta}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  numberOfLines={2}
                  style={[styles.recentName, { color: theme.text }]}
                >
                  {card.title}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

export function HomePosterCarousel({
  cards,
  onCardPress,
  emptyText,
  badgeLabel: _badgeLabel,
  badgeColor: _badgeColor,
  getBadgeLabel: _getBadgeLabel,
  getBadgeColor: _getBadgeColor,
  showBadge: _showBadge = true,
  showFavoriteButton = true,
  showActivityDots = false,
  businessIdsWithEvents,
  bleed = true,
  compact = false,
  scrollKey,
}: {
  cards: HomeFeedCard[];
  onCardPress?: (card: HomeFeedCard) => void;
  emptyText: string;
  badgeLabel: string;
  badgeColor: string;
  getBadgeLabel?: (card: HomeFeedCard) => string;
  getBadgeColor?: (card: HomeFeedCard) => string;
  showBadge?: boolean;
  showFavoriteButton?: boolean;
  showActivityDots?: boolean;
  businessIdsWithEvents?: Set<string>;
  bleed?: boolean;
  compact?: boolean;
  scrollKey?: string;
}) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const items = cards.slice(0, 10);
  const rail = usePersistedRailScroll(scrollKey);
  const imageH = compact ? POSTER_IMAGE_H_COMPACT : POSTER_IMAGE_H;

  if (items.length === 0) {
    return <Text style={{ color: theme.textMuted }}>{emptyText}</Text>;
  }

  return (
    <View style={bleed ? { marginHorizontal: -HOME_PAGE_PAD } : undefined}>
      <ScrollView
        ref={rail.scrollRef}
        horizontal
        removeClippedSubviews
        nestedScrollEnabled
        directionalLockEnabled={Platform.OS === 'ios'}
        decelerationRate={Platform.OS === 'android' ? 0.992 : 'normal'}
        showsHorizontalScrollIndicator={false}
        // RN Web ScrollView defaults to flex:1 and can leave a tall empty gap under rails.
        style={{ flexGrow: 0, flexShrink: 0 }}
        contentContainerStyle={{
          paddingHorizontal: bleed ? HOME_PAGE_PAD : 0,
          flexGrow: 0,
          alignItems: 'flex-start',
        }}
        contentOffset={rail.contentOffset}
        scrollEventThrottle={rail.scrollEventThrottle}
        onScroll={rail.onScroll}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
          {items.map((card, idx) => (
            <View key={`${card.resultKind ?? 'business'}:${card.orderIds?.[0] ?? card.id}-${idx}`} style={styles.poster}>
              <HomeListingCard
                card={card}
                onPress={onCardPress}
                imageHeight={imageH}
                showFavorite={showFavoriteButton}
                showActivityDots={showActivityDots}
                businessIdsWithEvents={businessIdsWithEvents}
                imagePriority={idx < 4 ? 'high' : 'normal'}
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export function HomeEventTickets({
  events,
  onEventPress,
  emptyText,
  scrollKey = 'home:events',
}: {
  events: EventFeedItem[];
  onEventPress?: (event: EventFeedItem) => void;
  emptyText: string;
  scrollKey?: string;
}) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const items = events.filter((event) => isUpcomingFeedEvent(event)).slice(0, HOME_EVENT_TICKET_COUNT);
  const rail = usePersistedRailScroll(scrollKey);

  if (items.length === 0) {
    return <Text style={{ color: theme.textMuted }}>{emptyText}</Text>;
  }

  return (
    <View style={{ marginHorizontal: -HOME_PAGE_PAD }}>
      <ScrollView
        ref={rail.scrollRef}
        horizontal
        nestedScrollEnabled
        directionalLockEnabled={Platform.OS === 'ios'}
        removeClippedSubviews
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: HOME_PAGE_PAD }}
        contentOffset={rail.contentOffset}
        scrollEventThrottle={rail.scrollEventThrottle}
        onScroll={rail.onScroll}
      >
        <View style={{ flexDirection: 'row', gap: 14 }}>
          {items.map((event, idx) => {
            const startDate = getFeedEventStartParts(event);
            return (
              <Pressable
                key={`${event.id}-${idx}`}
                onPress={() => onEventPress?.(event)}
                style={[
                  styles.ticket,
                  { backgroundColor: theme.cardBg },
                  NO_OUTLINE,
                ]}
              >
                <View style={[styles.ticketDate, { backgroundColor: theme.eventColor }]}>
                  <Text style={styles.ticketDay}>{startDate?.day ?? '—'}</Text>
                  <Text style={styles.ticketMonth}>{startDate?.month ?? 'SNART'}</Text>
                  {startDate?.time ? <Text style={styles.ticketTime}>{startDate.time}</Text> : null}
                </View>
                <View style={styles.ticketImage}>
                  {event.image ? (
                    <CardMedia
                      source={event.image as ImageSourcePropType}
                      svgFit="fill"
                      priority={idx < 4 ? 'high' : 'normal'}
                      displayWidth={220}
                    />
                  ) : (
                    <View style={{ flex: 1, backgroundColor: theme.cardBgMuted }} />
                  )}
                </View>
                <View style={styles.ticketCopy}>
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }} numberOfLines={2}>
                    {event.title}
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }} numberOfLines={1}>
                    {event.subtitle}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  launchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    gap: 22,
  },
  launchSeg: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    width: 72,
  },
  launchOrb: {
    width: LAUNCH_ORB,
    height: LAUNCH_ORB,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  launchLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingLeft: 8,
  },
  dealTile: {
    overflow: 'hidden',
    borderRadius: HOME_RADIUS,
  },
  dealImageWrap: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#121826',
  },
  dealTopRow: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    zIndex: 2,
  },
  dealBody: {
    backgroundColor: 'transparent',
  },
  dealBodyLg: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  dealBodySm: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
  },
  dealTextBlockLg: {
    minHeight: 40 + 5 + 15 * 2 + 4,
  },
  dealOverlayGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  dealOverlayGradientLg: {
    paddingHorizontal: 12,
    paddingBottom: 14,
    paddingTop: 48,
  },
  dealOverlayGradientSm: {
    paddingHorizontal: 10,
    paddingBottom: 9,
    paddingTop: 28,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 5,
    minWidth: 0,
  },
  metaText: {
    flexShrink: 1,
    fontWeight: '500',
    letterSpacing: -0.15,
  },
  overlayDarkLens: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: OVERLAY_DARK_LENS,
  },
  categoryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  categoryTagText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 1,
    zIndex: 1,
  },
  featured: {
    height: FEATURED_H,
    overflow: 'visible',
  },
  featuredSlide: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    borderRadius: HOME_RADIUS,
  },
  featuredImageWrap: {
    height: FEATURED_IMAGE_H,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#121826',
  },
  featuredBody: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    justifyContent: 'flex-start',
  },
  listingCard: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: HOME_RADIUS,
  },
  listingCardEditorial: {
    borderRadius: 20,
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -5,
  },
  cardGridCell: {
    width: '50%',
    paddingHorizontal: 5,
    marginBottom: 18,
  },
  cardStack: {
    width: '100%',
    gap: 22,
  },
  cardStackCompact: {
    gap: 16,
  },
  cardStackCell: {
    width: '100%',
  },
  poster: {
    width: POSTER_WIDTH,
  },
  posterImageWrap: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#121826',
  },
  editorialImageFade: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  posterBody: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 9,
  },
  // Reserve 2 title lines + 2 meta rows so card height stays even; short titles
  // let the meta sit tight under the name, with leftover space below.
  posterTextBlock: {
    minHeight: 36 + 4 + 14 * 2 + 3,
  },
  editorialBody: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },
  editorialBodyCompact: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  posterTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.35,
    lineHeight: 19,
  },
  editorialTitle: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.55,
    lineHeight: 23,
  },
  editorialTitleCompact: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 20,
  },
  editorialCity: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  editorialCityCompact: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  favHit: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  ticket: {
    width: 268,
    height: 108,
    borderRadius: HOME_RADIUS,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  ticketDate: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticketDay: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 24,
  },
  ticketMonth: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  ticketTime: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 3,
  },
  ticketImage: {
    width: 88,
    position: 'relative',
    overflow: 'hidden',
  },
  ticketCopy: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  recentItem: {
    width: RECENT_CARD_W,
  },
  recentMedia: {
    width: RECENT_CARD_W,
    height: RECENT_IMG_H,
    borderRadius: RECENT_RADIUS,
    overflow: 'hidden',
  },
  recentAccentBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
  },
  recentMetaChip: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  recentMetaDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  recentMetaText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  recentName: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
    letterSpacing: -0.15,
  },
});
