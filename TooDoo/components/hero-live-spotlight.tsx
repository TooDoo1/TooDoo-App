import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
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

export const LIVE_HERO_HEIGHT = 200;
const AUTO_MS = 4200;
const SCROLL_ANIM_MS = 680;
const TAP_MOVE_THRESHOLD = 12;
const INTERACT_RESUME_MS = 2000;
const COPY_BOTTOM_PAD = 40;
const DECELERATION = Platform.OS === 'android' ? 0.994 : ('normal' as const);

export type HeroLiveSlide = {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  eyebrow?: string;
  accentColor?: string;
  image: ImageSourcePropType;
  sourceId: string;
  kind: 'near' | 'hot' | 'ending' | 'event';
};

type HeroLiveSpotlightProps = {
  slides: HeroLiveSlide[];
  panelBackgroundColor: string;
  topInset?: number;
  onPressSlide?: (slide: HeroLiveSlide) => void;
};

function buildLoopSlides(slides: HeroLiveSlide[]): HeroLiveSlide[] {
  if (slides.length <= 1) return slides;
  return [slides[slides.length - 1], ...slides, slides[0]];
}

function loopIndexToLogical(loopIndex: number, slideCount: number): number {
  if (slideCount <= 1) return 0;
  if (loopIndex === 0) return slideCount - 1;
  if (loopIndex === slideCount + 1) return 0;
  return loopIndex - 1;
}

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
  const kindColor = slide.accentColor ?? '#ffffff';
  const content = (
    <>
      <SlideImage
        source={slide.image}
        width={slideWidth}
        height={shellHeight}
        fillWidth={fillWidth}
        priority={priority}
      />
      <LinearGradient
        colors={['rgba(8,10,18,0.22)', 'rgba(8,10,18,0.08)', 'rgba(8,10,18,0.78)', 'rgba(8,10,18,0.94)']}
        locations={[0, 0.35, 0.72, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[styles.copy, { paddingTop: Math.max(topInset + 10, 16), paddingBottom: COPY_BOTTOM_PAD }]}
        pointerEvents="none"
      >
        <View style={styles.topRow}>
          {slide.eyebrow ? (
            <View style={styles.eyebrowChip}>
              <Text style={[styles.eyebrowText, { color: kindColor }]}>{slide.eyebrow}</Text>
            </View>
          ) : (
            <View />
          )}
          {slide.badge ? (
            <View
              style={[
                styles.badgeChip,
                slide.kind === 'event' ? styles.eventBadgeChip : null,
              ]}
            >
              <Text style={styles.badgeText}>{slide.badge}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.bottomCopy}>
          <Text style={styles.title} numberOfLines={2}>
            {slide.title}
          </Text>
          {slide.subtitle ? (
            <View style={styles.subtitleRow}>
              <Ionicons name="location-outline" size={14} color="#ffffff" />
              <Text style={styles.subtitle} numberOfLines={1}>
                {slide.subtitle}
              </Text>
            </View>
          ) : null}
          <View style={styles.ctaRow}>
            <Text style={styles.ctaText}>Visa mer</Text>
            <Ionicons name="chevron-forward" size={13} color="#ffffff" />
          </View>
        </View>
      </View>
    </>
  );

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

function WebLiveCarousel({
  slides,
  shellHeight,
  topInset,
  onLogicalIndexChange,
  onPressSlide,
  onInteractStart,
  onInteractEnd,
  controlsRef,
}: {
  slides: HeroLiveSlide[];
  shellHeight: number;
  topInset: number;
  onLogicalIndexChange?: (logicalIndex: number) => void;
  onPressSlide?: (slide: HeroLiveSlide) => void;
  onInteractStart?: () => void;
  onInteractEnd?: () => void;
  controlsRef?: MutableRefObject<{
    step: (direction: -1 | 1) => void;
    goTo: (logicalIndex: number) => void;
  } | null>;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const slideCount = slides.length;
  const loopSlides = useMemo(() => buildLoopSlides(slides), [slides]);
  const [trackWidth, setTrackWidth] = useState(0);
  const slideWidth = Math.max(trackWidth, 1);
  const activeLogicalRef = useRef(0);
  const wrappingRef = useRef(false);
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; scrollLeft: number } | null>(null);
  const movedRef = useRef(false);

  const publishLogical = useCallback(
    (loopIndex: number) => {
      const logical = loopIndexToLogical(loopIndex, slideCount);
      if (logical === activeLogicalRef.current) return;
      activeLogicalRef.current = logical;
      onLogicalIndexChange?.(logical);
    },
    [onLogicalIndexChange, slideCount]
  );

  const scrollToLoopIndex = useCallback(
    (loopIndex: number, behavior: ScrollBehavior) => {
      const node = trackRef.current;
      if (!node || slideWidth <= 1) return;
      node.scrollTo({ left: loopIndex * slideWidth, behavior });
      publishLogical(loopIndex);
    },
    [publishLogical, slideWidth]
  );

  const wrapClonesIfNeeded = useCallback(() => {
    const node = trackRef.current;
    if (!node || slideCount <= 1 || slideWidth <= 1 || wrappingRef.current) return;
    const maxIndex = slideCount + 1;
    const approx = node.scrollLeft / slideWidth;
    if (approx < 0.5) {
      wrappingRef.current = true;
      node.scrollTo({ left: slideCount * slideWidth, behavior: 'auto' });
      publishLogical(slideCount - 1);
      requestAnimationFrame(() => {
        wrappingRef.current = false;
      });
      return;
    }
    if (approx > maxIndex - 0.5) {
      wrappingRef.current = true;
      node.scrollTo({ left: slideWidth, behavior: 'auto' });
      publishLogical(0);
      requestAnimationFrame(() => {
        wrappingRef.current = false;
      });
    }
  }, [publishLogical, slideCount, slideWidth]);

  useEffect(() => {
    const node = trackRef.current;
    if (!node) return;
    const update = () => setTrackWidth(Math.round(node.getBoundingClientRect().width));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = trackRef.current;
    if (!node || trackWidth <= 0) return;
    const startIndex = slideCount > 1 ? 1 : 0;
    wrappingRef.current = true;
    node.scrollTo({ left: startIndex * trackWidth, behavior: 'auto' });
    publishLogical(startIndex);
    requestAnimationFrame(() => {
      wrappingRef.current = false;
    });
  }, [trackWidth, slideCount, publishLogical]);

  const step = useCallback(
    (direction: -1 | 1) => {
      if (slideCount <= 1 || wrappingRef.current) return;
      const node = trackRef.current;
      if (!node) return;
      const current = Math.round(node.scrollLeft / slideWidth);
      scrollToLoopIndex(current + direction, 'smooth');
    },
    [scrollToLoopIndex, slideCount, slideWidth]
  );

  const goTo = useCallback(
    (logicalIndex: number) => {
      if (slideCount <= 1 || wrappingRef.current) return;
      const target = Math.max(0, Math.min(slideCount - 1, logicalIndex));
      scrollToLoopIndex(target + (slideCount > 1 ? 1 : 0), 'smooth');
    },
    [scrollToLoopIndex, slideCount]
  );

  useEffect(() => {
    if (!controlsRef) return;
    controlsRef.current = { step, goTo };
    return () => {
      controlsRef.current = null;
    };
  }, [controlsRef, goTo, step]);

  useEffect(() => {
    return () => {
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
    };
  }, []);

  const handleScroll = () => {
    const node = trackRef.current;
    if (!node || wrappingRef.current || slideWidth <= 1) return;
    const approx = Math.round(node.scrollLeft / slideWidth);
    publishLogical(approx);
    onInteractStart?.();
    if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
    scrollEndTimerRef.current = setTimeout(() => {
      wrapClonesIfNeeded();
      onInteractEnd?.();
      scrollEndTimerRef.current = null;
    }, 140);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const node = trackRef.current;
    pointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: node?.scrollLeft ?? 0,
    };
    movedRef.current = false;
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

  const handlePointerUp = () => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start || movedRef.current || slideCount === 0) return;
    const logical = activeLogicalRef.current;
    const slide = slides[logical];
    if (slide) onPressSlide?.(slide);
  };

  return (
    <div
      ref={trackRef}
      className="hero-carousel-web-track hero-carousel-native-scroll"
      style={{ height: shellHeight }}
      onScroll={handleScroll}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        pointerStartRef.current = null;
      }}
    >
      {loopSlides.map((slide, idx) => (
        <div
          key={`${slide.id}:loop:${idx}`}
          className="hero-carousel-web-slide"
          style={{
            width: trackWidth > 0 ? slideWidth : '100%',
            flex: trackWidth > 0 ? `0 0 ${slideWidth}px` : '0 0 100%',
            height: shellHeight,
          }}
        >
          <LiveSlideFrame
            slide={slide}
            shellHeight={shellHeight}
            slideWidth={slideWidth}
            fillWidth
            priority="high"
            topInset={topInset}
            disablePress
          />
        </div>
      ))}
    </div>
  );
}

/**
 * Logged-in home hero with the same horizontal scroll animation as the image carousel.
 */
export function HeroLiveSpotlight({
  slides,
  panelBackgroundColor,
  topInset = 0,
  onPressSlide,
}: HeroLiveSpotlightProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [layoutWidth, setLayoutWidth] = useState(() =>
    Platform.OS === 'web' ? 0 : Math.max(windowWidth, 1)
  );
  const shellHeight = LIVE_HERO_HEIGHT + topInset;
  const scrollRef = useRef<ScrollView>(null);
  const currentLoopIndexRef = useRef(0);
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

  const safeSlides = useMemo(() => slides.filter((s) => Boolean(s?.id)), [slides]);
  const slideCount = safeSlides.length;
  const loopSlides = useMemo(() => buildLoopSlides(safeSlides), [safeSlides]);
  const loopStartIndex = slideCount > 1 ? 1 : 0;
  const carouselSlides = loopSlides;
  const slideStride = Math.max(layoutWidth, 1);
  const isLayoutReady = useWebTrack || slideStride > 1;
  const initialScrollIndex = loopStartIndex;

  useEffect(() => {
    schedulePrefetchImageUris(
      safeSlides.map((slide) => slide.image),
      Math.min(slideCount, 6)
    );
  }, [safeSlides, slideCount]);

  const scrollToIndex = useCallback(
    (index: number, animated: boolean) => {
      if (!isLayoutReady || slideCount === 0 || useWebTrack) return;
      scrollRef.current?.scrollTo({ x: index * slideStride, animated });
    },
    [isLayoutReady, slideCount, slideStride, useWebTrack]
  );

  const settleLoopIndex = useCallback(
    (loopIndex: number) => {
      if (slideCount <= 1 || useWebTrack) return;
      if (loopIndex === 0) {
        currentLoopIndexRef.current = slideCount;
        scrollToIndex(slideCount, false);
        setActiveDot(slideCount - 1);
        return;
      }
      if (loopIndex === slideCount + 1) {
        currentLoopIndexRef.current = 1;
        scrollToIndex(1, false);
        setActiveDot(0);
        return;
      }
      setActiveDot(loopIndexToLogical(loopIndex, slideCount));
    },
    [scrollToIndex, slideCount, useWebTrack]
  );

  const handleScrollEnd = useCallback(
    (offsetX: number) => {
      if (!isLayoutReady || slideCount === 0 || useWebTrack) return;
      const nextIndex = Math.round(offsetX / slideStride);
      currentLoopIndexRef.current = nextIndex;
      settleLoopIndex(nextIndex);
      scheduleAutoplayResume();
    },
    [isLayoutReady, scheduleAutoplayResume, settleLoopIndex, slideCount, slideStride, useWebTrack]
  );

  const stepLogicalIndex = useCallback(
    (direction: -1 | 1) => {
      if (slideCount <= 1) return;
      if (useWebTrack) {
        webControlsRef.current?.step(direction);
        return;
      }
      if (!isLayoutReady) return;
      const base = Math.round(currentLoopIndexRef.current);
      const nextLoopIndex = base + direction;
      currentLoopIndexRef.current = nextLoopIndex;
      scrollToIndex(nextLoopIndex, true);
      setActiveDot(loopIndexToLogical(nextLoopIndex, slideCount));
      setTimeout(() => settleLoopIndex(currentLoopIndexRef.current), SCROLL_ANIM_MS);
    },
    [isLayoutReady, scrollToIndex, settleLoopIndex, slideCount, useWebTrack]
  );

  useEffect(() => {
    if (!isLayoutReady || slideCount === 0 || useWebTrack) return;
    currentLoopIndexRef.current = initialScrollIndex;
    setActiveDot(loopIndexToLogical(initialScrollIndex, slideCount));
    scrollToIndex(initialScrollIndex, false);
  }, [initialScrollIndex, isLayoutReady, scrollToIndex, slideCount, useWebTrack]);

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
      return;
    }
    if (!isLayoutReady) return;
    const targetIndex = slideCount > 1 ? logicalIndex + 1 : 0;
    currentLoopIndexRef.current = targetIndex;
    setActiveDot(logicalIndex);
    scrollToIndex(targetIndex, true);
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
        <WebLiveCarousel
          slides={safeSlides}
          shellHeight={shellHeight}
          topInset={topInset}
          onLogicalIndexChange={setActiveDot}
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
            setActiveDot(loopIndexToLogical(approx, slideCount));
          }}
          onScrollEndDrag={(event) => handleScrollEnd(event.nativeEvent.contentOffset.x)}
          onMomentumScrollEnd={(event) => handleScrollEnd(event.nativeEvent.contentOffset.x)}
        >
          {carouselSlides.map((slide, idx) => (
            <View key={`${slide.id}:${idx}`} style={[styles.slide, { width: slideStride, height: shellHeight }]}>
              <LiveSlideFrame
                slide={slide}
                shellHeight={shellHeight}
                slideWidth={slideStride}
                fillWidth={false}
                priority={idx === initialScrollIndex ? 'high' : 'low'}
                topInset={topInset}
                onPress={() => onPressSlide?.(slide)}
              />
            </View>
          ))}
        </ScrollView>
      ) : null}

      <LinearGradient
        pointerEvents="none"
        colors={[`${panelBackgroundColor}00`, panelBackgroundColor]}
        style={styles.panelFade}
      />
      <View style={styles.dotsOverlay}>
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
  },
  scrollView: {
    width: '100%',
    height: '100%',
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
  copy: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 18,
    justifyContent: 'space-between',
    zIndex: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  eyebrowChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  eyebrowText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  badgeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  eventBadgeChip: {
    backgroundColor: BrandColors.dark.primary,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  bottomCopy: {
    gap: 4,
    paddingRight: 4,
    maxWidth: '100%',
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 26,
    letterSpacing: -0.3,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
  },
  subtitle: {
    flexShrink: 1,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  ctaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ctaText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  dotsOverlay: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    zIndex: 3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotActive: {
    width: 16,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffffff',
  },
  panelFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 36,
    zIndex: 2,
  },
});
