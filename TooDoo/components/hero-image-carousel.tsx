import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent as ReactTouchEvent,
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
import { LinearGradient } from 'expo-linear-gradient';

import { resolveHeroImageUri, type HeroSlide } from '@/lib/hero-slides';
import { schedulePrefetchImageUris } from '@/lib/image-prefetch';

export type { HeroSlide };

const HERO_HEIGHT = 210;
const HERO_AUTO_MS = 3000;
const HERO_SCROLL_ANIM_MS = 520;
const HERO_DECELERATION = Platform.OS === 'android' ? 0.992 : ('normal' as const);
const HERO_WEB_SWIPE_THRESHOLD = 40;

function buildLoopSlides(slides: HeroSlide[]): HeroSlide[] {
  if (slides.length <= 1) return slides;
  return [slides[slides.length - 1], ...slides, slides[0]];
}

function loopIndexToLogical(loopIndex: number, slideCount: number): number {
  if (slideCount <= 1) return 0;
  if (loopIndex === 0) return slideCount - 1;
  if (loopIndex === slideCount + 1) return 0;
  return loopIndex - 1;
}

function HeroSlideImage({
  source,
  width,
  height,
  priority = 'normal',
  fillWidth = false,
}: {
  source: ImageSourcePropType;
  width: number;
  height: number;
  priority?: 'high' | 'normal' | 'low';
  fillWidth?: boolean;
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

function HeroSlideFrame({
  slide,
  shellHeight,
  slideWidth,
  fillWidth,
  priority,
}: {
  slide: HeroSlide;
  shellHeight: number;
  slideWidth: number;
  fillWidth: boolean;
  priority: 'high' | 'normal' | 'low';
}) {
  return (
    <>
      <HeroSlideImage
        source={slide.source}
        width={slideWidth}
        height={shellHeight}
        fillWidth={fillWidth}
        priority={priority}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.7)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.titleWrap}>
        <Text style={styles.titleText} numberOfLines={2}>
          {slide.title}
        </Text>
      </View>
    </>
  );
}

function WebHeroCarousel({
  slides,
  shellHeight,
  activeDot,
  onStep,
}: {
  slides: HeroSlide[];
  shellHeight: number;
  activeDot: number;
  onStep: (direction: -1 | 1) => void;
}) {
  const touchStartXRef = useRef<number | null>(null);
  const slideCount = slides.length;
  const slideShare = slideCount > 0 ? 100 / slideCount : 100;

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    if (startX == null) return;

    const endX = event.changedTouches[0]?.clientX ?? startX;
    const delta = endX - startX;
    if (Math.abs(delta) < HERO_WEB_SWIPE_THRESHOLD) return;
    onStep(delta > 0 ? -1 : 1);
  };

  return (
    <div
      className="hero-carousel-web-track"
      style={{ height: shellHeight }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="hero-carousel-web-slider"
        style={{
          width: `${slideCount * 100}%`,
          transform: `translateX(-${activeDot * slideShare}%)`,
        }}
      >
        {slides.map((slide, idx) => (
          <div
            key={`hero-web-${idx}-${slide.title}`}
            className="hero-carousel-web-slide"
            style={{ width: `${slideShare}%` }}
          >
            <HeroSlideFrame
              slide={slide}
              shellHeight={shellHeight}
              slideWidth={0}
              fillWidth
              priority={idx === activeDot ? 'high' : 'low'}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroImageCarouselInner({
  slides,
  panelBackgroundColor,
  topInset = 0,
}: {
  slides: HeroSlide[];
  panelBackgroundColor: string;
  topInset?: number;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const [layoutWidth, setLayoutWidth] = useState(() =>
    Platform.OS === 'web' ? 0 : Math.max(windowWidth, 1)
  );
  const shellHeight = HERO_HEIGHT + topInset;
  const scrollRef = useRef<ScrollView>(null);
  const currentLoopIndexRef = useRef(0);
  const isInteractingRef = useRef(false);
  const [activeDot, setActiveDot] = useState(0);
  const useWebTrack = Platform.OS === 'web';

  const slideCount = slides.length;
  const loopSlides = useMemo(() => buildLoopSlides(slides), [slides]);
  const loopStartIndex = slideCount > 1 ? 1 : 0;
  const carouselSlides = useWebTrack ? slides : loopSlides;
  const slideStride = Math.max(layoutWidth, 1);
  const isLayoutReady = useWebTrack || slideStride > 1;
  const initialScrollIndex = useWebTrack ? 0 : loopStartIndex;

  useEffect(() => {
    schedulePrefetchImageUris(slides.map((slide) => slide.source), slideCount);
  }, [slides, slideCount]);

  const scrollToIndex = useCallback(
    (index: number, animated: boolean) => {
      if (!isLayoutReady || slideCount === 0 || useWebTrack) return;
      scrollRef.current?.scrollTo({ x: index * slideStride, animated });
    },
    [isLayoutReady, slideCount, slideStride, useWebTrack]
  );

  useEffect(() => {
    if (!isLayoutReady || slideCount === 0 || useWebTrack) return;

    currentLoopIndexRef.current = initialScrollIndex;
    setActiveDot(loopIndexToLogical(initialScrollIndex, slideCount));

    const frame = requestAnimationFrame(() => {
      scrollToIndex(initialScrollIndex, false);
    });

    return () => cancelAnimationFrame(frame);
  }, [initialScrollIndex, isLayoutReady, scrollToIndex, slideCount, useWebTrack]);

  const snapCloneIfNeeded = useCallback(
    (loopIndex: number): number => {
      if (slideCount <= 1 || slideStride <= 0) return loopIndex;

      if (loopIndex <= 0) {
        const snapped = slideCount;
        scrollRef.current?.scrollTo({ x: snapped * slideStride, animated: false });
        return snapped;
      }

      if (loopIndex >= slideCount + 1) {
        const snapped = 1;
        scrollRef.current?.scrollTo({ x: snapped * slideStride, animated: false });
        return snapped;
      }

      return loopIndex;
    },
    [slideCount, slideStride]
  );

  const settleLoopIndex = useCallback(
    (loopIndex: number) => {
      const snapped = snapCloneIfNeeded(loopIndex);
      currentLoopIndexRef.current = snapped;
      setActiveDot(loopIndexToLogical(snapped, slideCount));
      return snapped;
    },
    [slideCount, snapCloneIfNeeded]
  );

  const handleScrollEnd = useCallback(
    (offsetX: number) => {
      isInteractingRef.current = false;
      if (!isLayoutReady || slideCount === 0 || useWebTrack) return;

      const loopIndex = Math.round(offsetX / slideStride);
      settleLoopIndex(loopIndex);
    },
    [isLayoutReady, slideCount, slideStride, settleLoopIndex, useWebTrack]
  );

  const stepLogicalIndex = useCallback(
    (direction: -1 | 1) => {
      if (slideCount === 0) return;
      setActiveDot((current) => {
        const nextIndex = (current + direction + slideCount) % slideCount;
        currentLoopIndexRef.current = nextIndex;
        return nextIndex;
      });
    },
    [slideCount]
  );

  useEffect(() => {
    if (slideCount <= 1) return;

    const timer = setInterval(() => {
      if (isInteractingRef.current) return;

      if (useWebTrack) {
        stepLogicalIndex(1);
        return;
      }

      if (!isLayoutReady) return;

      const nextLoopIndex = currentLoopIndexRef.current + 1;
      currentLoopIndexRef.current = nextLoopIndex;
      scrollToIndex(nextLoopIndex, true);
      setActiveDot(loopIndexToLogical(nextLoopIndex, slideCount));

      setTimeout(() => {
        settleLoopIndex(currentLoopIndexRef.current);
      }, HERO_SCROLL_ANIM_MS);
    }, HERO_AUTO_MS);

    return () => clearInterval(timer);
  }, [isLayoutReady, scrollToIndex, slideCount, settleLoopIndex, stepLogicalIndex, useWebTrack]);

  const scrollToLogicalIndex = (logicalIndex: number) => {
    if (slideCount === 0) return;

    if (useWebTrack) {
      currentLoopIndexRef.current = logicalIndex;
      setActiveDot(logicalIndex);
      return;
    }

    if (!isLayoutReady) return;

    const targetIndex = slideCount > 1 ? logicalIndex + 1 : 0;
    currentLoopIndexRef.current = targetIndex;
    setActiveDot(logicalIndex);
    scrollToIndex(targetIndex, true);
  };

  if (slideCount === 0) return null;

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
        <WebHeroCarousel
          slides={slides}
          shellHeight={shellHeight}
          activeDot={activeDot}
          onStep={stepLogicalIndex}
        />
      ) : isLayoutReady ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          nestedScrollEnabled
          pagingEnabled
          removeClippedSubviews
          showsHorizontalScrollIndicator={false}
          decelerationRate={HERO_DECELERATION}
          directionalLockEnabled={Platform.OS === 'ios'}
          snapToInterval={slideStride}
          snapToAlignment="start"
          disableIntervalMomentum
          scrollEventThrottle={16}
          style={[styles.scrollView, { height: shellHeight }]}
          contentContainerStyle={styles.scrollContent}
          onScrollBeginDrag={() => {
            isInteractingRef.current = true;
          }}
          onScrollEndDrag={(event) => handleScrollEnd(event.nativeEvent.contentOffset.x)}
          onMomentumScrollEnd={(event) => handleScrollEnd(event.nativeEvent.contentOffset.x)}
        >
          {carouselSlides.map((slide, idx) => (
            <View
              key={`hero-${idx}-${slide.title}`}
              style={[styles.slide, { width: slideStride, height: shellHeight }]}
            >
              <HeroSlideFrame
                slide={slide}
                shellHeight={shellHeight}
                slideWidth={slideStride}
                fillWidth={false}
                priority={idx === initialScrollIndex ? 'high' : 'low'}
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
        {slides.map((_, idx) => (
          <Pressable
            key={`hero-dot-${idx}`}
            onPress={() => scrollToLogicalIndex(idx)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Bild ${idx + 1}`}
          >
            <View style={idx === activeDot ? styles.dotActive : styles.dot} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export const HeroImageCarousel = HeroImageCarouselInner;
export { HERO_HEIGHT };

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
  titleWrap: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 28,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 2,
  },
  titleText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 24,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  panelFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 52,
    zIndex: 1,
  },
  dotsOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    zIndex: 3,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },
});
