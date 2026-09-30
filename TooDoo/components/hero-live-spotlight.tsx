import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  ImageSourcePropType,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { resolveHeroImageUri } from '@/lib/hero-slides';
import { schedulePrefetchImageUris } from '@/lib/image-prefetch';
import { BrandColors } from '@/lib/brand-colors';

export const LIVE_HERO_HEIGHT = 250;
const AUTO_MS = 5200;
const TAP_MOVE_THRESHOLD = 12;
const INTERACT_RESUME_MS = 2400;
/** Space above dots — use as absolute `bottom`, not padding (RN Web). */
const COPY_BOTTOM_PAD = 58;
const COPY_SIDE_PAD = 18;
const DECELERATION = Platform.OS === 'android' ? 0.994 : ('normal' as const);
const WEB_SWIPE_THRESHOLD = 42;

export type HeroLiveSlide = {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  eyebrow?: string;
  accentColor?: string;
  image: ImageSourcePropType;
  sourceId: string;
  /** Discovery actions — not copies of home carousels. */
  kind: 'try' | 'map' | 'voice' | 'search';
};

type HeroLiveSpotlightProps = {
  slides: HeroLiveSlide[];
  panelBackgroundColor: string;
  topInset?: number;
  /** Visible content height excluding safe-area inset. */
  contentHeight?: number;
  onPressSlide?: (slide: HeroLiveSlide) => void;
};

function SlideImage({
  source,
  width,
  height,
  fillWidth,
  priority,
}: {
  source: ImageSourcePropType;
  width: number;
  height: number;
  fillWidth?: boolean;
  priority: 'high' | 'normal' | 'low';
}) {
  const uri = resolveHeroImageUri(source);

  if (Platform.OS === 'web' && uri) {
    return (
      <img
        src={uri}
        alt=""
        draggable={false}
        loading={priority === 'high' ? 'eager' : 'lazy'}
        fetchPriority={priority === 'high' ? 'high' : 'auto'}
        decoding="async"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: fillWidth ? '100%' : width,
          height: fillWidth ? '100%' : height,
          objectFit: 'cover',
          display: 'block',
        }}
      />
    );
  }

  return (
    <ExpoImage
      source={source}
      style={{ width, height }}
      contentFit="cover"
      cachePolicy="memory-disk"
      priority={priority}
      allowDownscaling
    />
  );
}

function LiveSlideFrame({
  slide,
  shellHeight,
  slideWidth,
  fillWidth,
  priority,
  topInset,
  onPress,
  disablePress,
}: {
  slide: HeroLiveSlide;
  shellHeight: number;
  slideWidth: number;
  fillWidth: boolean;
  priority: 'high' | 'normal' | 'low';
  topInset: number;
  onPress?: () => void;
  disablePress?: boolean;
}) {
  const kindColor = slide.accentColor ?? BrandColors.dark.primary;
  const padTop = Math.max(topInset + 10, 16);

  let content: ReactNode;

  if (slide.kind === 'try') {
    content = (
      <View style={styles.splitRoot}>
        <View style={styles.splitPane} />
        <View style={styles.splitMedia}>
          <SlideImage
            source={slide.image}
            width={slideWidth * 0.52}
            height={shellHeight}
            fillWidth
            priority={priority}
          />
          <LinearGradient
            colors={['rgba(10,12,20,0.15)', 'rgba(10,12,20,0.55)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
        <View
          pointerEvents="none"
          style={[styles.bottomChrome, styles.bottomChromeTry, { bottom: COPY_BOTTOM_PAD }]}
        >
          <Text style={styles.splitEyebrow}>{slide.eyebrow ?? 'Testa något nytt'}</Text>
          {slide.badge ? <Text style={styles.splitDiscount}>{slide.badge}</Text> : null}
          <Text style={styles.splitTitle} numberOfLines={2}>
            {slide.title}
          </Text>
        </View>
      </View>
    );
  } else if (slide.kind === 'search') {
    content = (
      <>
        <SlideImage
          source={slide.image}
          width={slideWidth}
          height={shellHeight}
          fillWidth={fillWidth}
          priority={priority}
        />
        <LinearGradient
          colors={['rgba(14,19,37,0.45)', 'rgba(14,19,37,0.12)', 'rgba(14,19,37,0.88)']}
          locations={[0, 0.42, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={[styles.topChrome, { top: padTop }]}>
          <View style={styles.promoBrandPill}>
            <Text style={styles.promoBrandText}>TooDoo</Text>
          </View>
        </View>
        <View pointerEvents="none" style={[styles.bottomChrome, { bottom: COPY_BOTTOM_PAD }]}>
          <Text style={styles.promoTitle} numberOfLines={2}>
            {slide.title}
          </Text>
          {slide.subtitle ? (
            <Text style={styles.promoSubtitle} numberOfLines={1}>
              {slide.subtitle}
            </Text>
          ) : null}
        </View>
      </>
    );
  } else if (slide.kind === 'map') {
    content = (
      <>
        <SlideImage
          source={slide.image}
          width={slideWidth}
          height={shellHeight}
          fillWidth={fillWidth}
          priority={priority}
        />
        <LinearGradient
          colors={['rgba(8,14,32,0.5)', 'rgba(8,14,32,0.12)', 'rgba(8,14,32,0.88)']}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.eventAccent, { backgroundColor: kindColor }]} />
        <View pointerEvents="none" style={[styles.topChrome, { top: padTop }]}>
          <View style={styles.eyebrowChipEvent}>
            <Ionicons name="map-outline" size={12} color="#ffffff" />
            <Text style={[styles.eyebrowText, { color: '#ffffff', marginLeft: 5 }]}>
              {slide.eyebrow ?? 'Karta'}
            </Text>
          </View>
        </View>
        <View pointerEvents="none" style={[styles.bottomChrome, { bottom: COPY_BOTTOM_PAD }]}>
          <Text style={styles.title} numberOfLines={2}>
            {slide.title}
          </Text>
          {slide.subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {slide.subtitle}
            </Text>
          ) : null}
        </View>
      </>
    );
  } else {
    // voice — whole slide is tappable
    content = (
      <>
        <SlideImage
          source={slide.image}
          width={slideWidth}
          height={shellHeight}
          fillWidth={fillWidth}
          priority={priority}
        />
        <LinearGradient
          colors={['rgba(20,40,80,0.45)', 'rgba(14,19,37,0.1)', 'rgba(14,19,37,0.88)']}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={[styles.topChrome, { top: padTop }]}>
          <View style={styles.voiceBanner}>
            <Ionicons name="mic" size={13} color="#ffffff" />
            <Text style={styles.endingBannerText}>{slide.eyebrow ?? 'Röstsök'}</Text>
          </View>
        </View>
        <View pointerEvents="none" style={[styles.bottomChrome, { bottom: COPY_BOTTOM_PAD }]}>
          <Text style={styles.title} numberOfLines={2}>
            {slide.title}
          </Text>
          {slide.subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {slide.subtitle}
            </Text>
          ) : null}
        </View>
      </>
    );
  }
  const frameStyle = [
    styles.slideFrame,
    fillWidth ? StyleSheet.absoluteFillObject : { width: slideWidth, height: shellHeight },
  ];

  if (disablePress) {
    return <View style={frameStyle}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${slide.eyebrow ?? 'Erbjudande'}: ${slide.title}`}
      onPress={onPress}
      style={frameStyle}
    >
      {content}
    </Pressable>
  );
}

/** Web: crossfade stack — no infinite clones, so it never feels like the same card looping. */
function WebFadeCarousel({
  slides,
  shellHeight,
  topInset,
  activeIndex,
  onActiveIndexChange,
  onPressSlide,
  onInteractStart,
  onInteractEnd,
  controlsRef,
}: {
  slides: HeroLiveSlide[];
  shellHeight: number;
  topInset: number;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onPressSlide?: (slide: HeroLiveSlide) => void;
  onInteractStart?: () => void;
  onInteractEnd?: () => void;
  controlsRef?: MutableRefObject<{
    step: (direction: -1 | 1) => void;
    goTo: (logicalIndex: number) => void;
  } | null>;
}) {
  const slideCount = slides.length;
  const activeRef = useRef(activeIndex);
  activeRef.current = activeIndex;
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);

  const goTo = useCallback(
    (index: number) => {
      if (slideCount <= 0) return;
      const next = ((index % slideCount) + slideCount) % slideCount;
      onActiveIndexChange(next);
    },
    [onActiveIndexChange, slideCount]
  );

  const step = useCallback(
    (direction: -1 | 1) => {
      goTo(activeRef.current + direction);
    },
    [goTo]
  );

  useEffect(() => {
    if (!controlsRef) return;
    controlsRef.current = { step, goTo };
    return () => {
      controlsRef.current = null;
    };
  }, [controlsRef, goTo, step]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    movedRef.current = false;
    onInteractStart?.();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    if (!start) return;
    if (
      Math.abs(event.clientX - start.x) > TAP_MOVE_THRESHOLD ||
      Math.abs(event.clientY - start.y) > TAP_MOVE_THRESHOLD
    ) {
      movedRef.current = true;
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    onInteractEnd?.();
    if (!start || slideCount <= 1) {
      if (start && !movedRef.current) {
        const slide = slides[activeRef.current];
        if (slide) onPressSlide?.(slide);
      }
      return;
    }
    const dx = event.clientX - start.x;
    if (Math.abs(dx) >= WEB_SWIPE_THRESHOLD) {
      step(dx > 0 ? -1 : 1);
      return;
    }
    if (!movedRef.current) {
      const slide = slides[activeRef.current];
      if (slide) onPressSlide?.(slide);
    }
  };

  return (
    <div
      className="hero-fade-carousel"
      style={{
        position: 'relative',
        width: '100%',
        height: shellHeight,
        overflow: 'hidden',
        touchAction: 'pan-y',
        zIndex: 2,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        pointerStartRef.current = null;
        onInteractEnd?.();
      }}
    >
      {slides.map((slide, idx) => {
        const active = idx === activeIndex;
        return (
          <div
            key={slide.id}
            style={{
              position: 'absolute',
              inset: 0,
              opacity: active ? 1 : 0,
              transition: 'opacity 520ms ease',
              pointerEvents: active ? 'auto' : 'none',
              zIndex: active ? 2 : 1,
            }}
          >
            <LiveSlideFrame
              slide={slide}
              shellHeight={shellHeight}
              slideWidth={0}
              fillWidth
              priority={active ? 'high' : 'low'}
              topInset={topInset}
              disablePress
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Logged-in home hero — editorial variety, not a repeating card strip.
 */
export function HeroLiveSpotlight({
  slides,
  panelBackgroundColor,
  topInset = 0,
  contentHeight = LIVE_HERO_HEIGHT,
  onPressSlide,
}: HeroLiveSpotlightProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [layoutWidth, setLayoutWidth] = useState(() =>
    Platform.OS === 'web' ? 0 : Math.max(windowWidth, 1)
  );
  const shellHeight = contentHeight + topInset;
  const scrollRef = useRef<ScrollView>(null);
  const currentIndexRef = useRef(0);
  const isInteractingRef = useRef(false);
  const interactResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webControlsRef = useRef<{
    step: (direction: -1 | 1) => void;
    goTo: (logicalIndex: number) => void;
  } | null>(null);
  const [activeDot, setActiveDot] = useState(0);
  const useWebTrack = Platform.OS === 'web';

  const pauseAutoplay = useCallback(() => {
    isInteractingRef.current = true;
    if (interactResumeTimerRef.current) {
      clearTimeout(interactResumeTimerRef.current);
      interactResumeTimerRef.current = null;
    }
  }, []);

  const scheduleAutoplayResume = useCallback(() => {
    isInteractingRef.current = true;
    if (interactResumeTimerRef.current) clearTimeout(interactResumeTimerRef.current);
    interactResumeTimerRef.current = setTimeout(() => {
      isInteractingRef.current = false;
      interactResumeTimerRef.current = null;
    }, INTERACT_RESUME_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (interactResumeTimerRef.current) clearTimeout(interactResumeTimerRef.current);
    };
  }, []);

  const safeSlides = useMemo(() => slides.filter((s) => Boolean(s?.id)).slice(0, 3), [slides]);
  const slideCount = safeSlides.length;
  const slideStride = Math.max(layoutWidth, 1);
  const isLayoutReady = useWebTrack || slideStride > 1;

  useEffect(() => {
    schedulePrefetchImageUris(
      safeSlides.map((slide) => slide.image),
      Math.min(slideCount, 3)
    );
  }, [safeSlides, slideCount]);

  useEffect(() => {
    setActiveDot(0);
    currentIndexRef.current = 0;
  }, [safeSlides.map((s) => s.id).join('|')]);

  const scrollToIndex = useCallback(
    (index: number, animated: boolean) => {
      if (!isLayoutReady || slideCount === 0 || useWebTrack) return;
      scrollRef.current?.scrollTo({ x: index * slideStride, animated });
    },
    [isLayoutReady, slideCount, slideStride, useWebTrack]
  );

  const stepLogicalIndex = useCallback(
    (direction: -1 | 1) => {
      if (slideCount <= 1) return;
      if (useWebTrack) {
        webControlsRef.current?.step(direction);
        return;
      }
      if (!isLayoutReady) return;
      const next = (currentIndexRef.current + direction + slideCount) % slideCount;
      currentIndexRef.current = next;
      setActiveDot(next);
      scrollToIndex(next, true);
    },
    [isLayoutReady, scrollToIndex, slideCount, useWebTrack]
  );

  useEffect(() => {
    if (slideCount <= 1) return;
    const timer = setInterval(() => {
      if (isInteractingRef.current) return;
      stepLogicalIndex(1);
    }, AUTO_MS);
    return () => clearInterval(timer);
  }, [slideCount, stepLogicalIndex]);

  const scrollToLogicalIndex = (logicalIndex: number) => {
    if (slideCount === 0) return;
    pauseAutoplay();
    scheduleAutoplayResume();
    if (useWebTrack) {
      webControlsRef.current?.goTo(logicalIndex);
      setActiveDot(logicalIndex);
      return;
    }
    if (!isLayoutReady) return;
    currentIndexRef.current = logicalIndex;
    setActiveDot(logicalIndex);
    scrollToIndex(logicalIndex, true);
  };

  if (slideCount === 0) {
    return (
      <View style={[styles.shell, { height: shellHeight, backgroundColor: panelBackgroundColor }]} />
    );
  }

  return (
    <View
      nativeID="hero-carousel-shell"
      style={[styles.shell, { height: shellHeight, backgroundColor: panelBackgroundColor }]}
      onLayout={(event) => {
        if (useWebTrack) return;
        const measuredWidth = Math.round(event.nativeEvent.layout.width);
        if (measuredWidth > 1) {
          setLayoutWidth((current) => (current === measuredWidth ? current : measuredWidth));
        }
      }}
    >
      {useWebTrack ? (
        <WebFadeCarousel
          slides={safeSlides}
          shellHeight={shellHeight}
          topInset={topInset}
          activeIndex={activeDot}
          onActiveIndexChange={setActiveDot}
          onPressSlide={onPressSlide}
          onInteractStart={pauseAutoplay}
          onInteractEnd={scheduleAutoplayResume}
          controlsRef={webControlsRef}
        />
      ) : isLayoutReady ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          nestedScrollEnabled
          removeClippedSubviews
          showsHorizontalScrollIndicator={false}
          decelerationRate={DECELERATION}
          directionalLockEnabled={Platform.OS === 'ios'}
          snapToInterval={slideStride}
          snapToAlignment="start"
          disableIntervalMomentum
          scrollEventThrottle={16}
          style={[styles.scrollView, { height: shellHeight }]}
          contentContainerStyle={styles.scrollContent}
          onScrollBeginDrag={() => {
            pauseAutoplay();
          }}
          onScroll={(event) => {
            const offsetX = event.nativeEvent.contentOffset.x;
            const approx = Math.round(offsetX / Math.max(slideStride, 1));
            const clamped = Math.max(0, Math.min(slideCount - 1, approx));
            currentIndexRef.current = clamped;
            setActiveDot(clamped);
          }}
          onScrollEndDrag={(event) => {
            const approx = Math.round(event.nativeEvent.contentOffset.x / Math.max(slideStride, 1));
            const clamped = Math.max(0, Math.min(slideCount - 1, approx));
            currentIndexRef.current = clamped;
            setActiveDot(clamped);
            scheduleAutoplayResume();
          }}
          onMomentumScrollEnd={(event) => {
            const approx = Math.round(event.nativeEvent.contentOffset.x / Math.max(slideStride, 1));
            const clamped = Math.max(0, Math.min(slideCount - 1, approx));
            currentIndexRef.current = clamped;
            setActiveDot(clamped);
            scheduleAutoplayResume();
          }}
        >
          {safeSlides.map((slide, idx) => (
            <View key={slide.id} style={[styles.slide, { width: slideStride, height: shellHeight }]}>
              <LiveSlideFrame
                slide={slide}
                shellHeight={shellHeight}
                slideWidth={slideStride}
                fillWidth={false}
                priority={idx === 0 ? 'high' : 'low'}
                topInset={topInset}
                onPress={() => onPressSlide?.(slide)}
              />
            </View>
          ))}
        </ScrollView>
      ) : null}

      {/* No bottom color-fade — it painted over text and looked like a hard cut into the search panel. */}
      <View style={styles.dotsOverlay} pointerEvents="box-none">
        {safeSlides.map((slide, idx) => (
          <Pressable
            key={`dot-${slide.id}`}
            onPress={() => scrollToLogicalIndex(idx)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Spotlight ${idx + 1}`}
          >
            <View style={idx === activeDot ? styles.dotActive : styles.dot} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    alignSelf: 'stretch',
    overflow: 'hidden',
    position: 'relative',
  },
  scrollView: {
    width: '100%',
    height: '100%',
    zIndex: 2,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  slide: {
    position: 'relative',
    overflow: 'hidden',
    flexShrink: 0,
    flexGrow: 0,
  },
  slideFrame: {
    overflow: 'hidden',
  },
  topChrome: {
    position: 'absolute',
    left: COPY_SIDE_PAD,
    right: COPY_SIDE_PAD,
    zIndex: 5,
  },
  bottomChrome: {
    position: 'absolute',
    left: COPY_SIDE_PAD,
    right: COPY_SIDE_PAD,
    zIndex: 5,
    gap: 6,
  },
  bottomChromeTry: {
    width: '46%',
    right: 'auto',
  },
  eyebrowChipEvent: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(40, 70, 140, 0.72)',
  },
  eyebrowText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  subtitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    opacity: 0.95,
  },
  eventAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    zIndex: 3,
  },
  voiceBanner: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(71, 139, 235, 0.88)',
  },
  endingBannerText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  splitRoot: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    backgroundColor: '#12161f',
    zIndex: 2,
  },
  splitPane: {
    width: '48%',
    height: '100%',
    backgroundColor: '#12161f',
  },
  splitMedia: {
    width: '52%',
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  splitEyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  splitDiscount: {
    color: '#ffffff',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  splitTitle: {
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '700',
  },
  promoBrandPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(71,139,235,0.92)',
  },
  promoBrandText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  promoTitle: {
    color: '#ffffff',
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
    maxWidth: '90%',
  },
  promoSubtitle: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 14,
    fontWeight: '500',
    maxWidth: '88%',
  },
  dotsOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    zIndex: 6,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 7,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  dotActive: {
    width: 16,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffffff',
  },
});

