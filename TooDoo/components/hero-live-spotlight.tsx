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
const SWIPE_THRESHOLD = 28;
const INTERACT_RESUME_MS = 3200;
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
  onInteract,
  controlsRef,
}: {
  slides: HeroLiveSlide[];
  shellHeight: number;
  topInset: number;
  onLogicalIndexChange?: (logicalIndex: number) => void;
  onPressSlide?: (slide: HeroLiveSlide) => void;
  onInteract?: () => void;
  controlsRef?: MutableRefObject<{
    step: (direction: -1 | 1) => void;
    goTo: (logicalIndex: number) => void;
  } | null>;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const pointerIdRef = useRef<number | null>(null);
  const pointerStartXRef = useRef(0);
  const pointerStartYRef = useRef(0);
  const scrollStartRef = useRef(0);
  const lastMoveXRef = useRef(0);
  const lastMoveTsRef = useRef(0);
  const velocityRef = useRef(0);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const axisLockedRef = useRef<'x' | 'y' | null>(null);
  const wrappingRef = useRef(false);
  const slideCount = slides.length;
  const loopSlides = useMemo(() => buildLoopSlides(slides), [slides]);
  const loopCount = loopSlides.length;
  const slideWidthPx = Math.max(trackWidth, 1);
  const slideWidthRef = useRef(slideWidthPx);
  slideWidthRef.current = slideWidthPx;
  const scrollXRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [, setTick] = useState(0);
  const activeLogicalRef = useRef(0);

  const publishFromScroll = useCallback(
    (x: number) => {
      const width = slideWidthRef.current;
      if (width <= 1) return;
      const loopIndex = Math.round(x / width);
      const logical = loopIndexToLogical(loopIndex, slideCount);
      if (logical === activeLogicalRef.current) return;
      activeLogicalRef.current = logical;
      onLogicalIndexChange?.(logical);
    },
    [onLogicalIndexChange, slideCount]
  );

  const applyTransform = useCallback((x: number, instant: boolean) => {
    const slider = sliderRef.current;
    if (!slider) return;
    if (instant) {
      slider.classList.add('is-instant');
    } else {
      slider.classList.remove('is-instant');
    }
    slider.style.transform = `translate3d(${-x}px,0,0)`;
  }, []);

  const setScrollX = useCallback(
    (x: number, instant: boolean) => {
      scrollXRef.current = x;
      applyTransform(x, instant);
      publishFromScroll(x);
    },
    [applyTransform, publishFromScroll]
  );

  const wrapIfNeeded = useCallback(
    (x: number) => {
      const width = slideWidthRef.current;
      if (slideCount <= 1 || width <= 1) return x;
      const span = slideCount * width;
      if (x < width * 0.5) return x + span;
      if (x > slideCount * width + width * 0.5) return x - span;
      return x;
    },
    [slideCount]
  );

  useEffect(() => {
    const node = trackRef.current;
    if (!node || typeof ResizeObserver === 'undefined') {
      if (node) setTrackWidth(Math.round(node.getBoundingClientRect().width));
      return;
    }
    const update = () => setTrackWidth(Math.round(node.getBoundingClientRect().width));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (trackWidth <= 0) return;
    const logical = activeLogicalRef.current;
    const next = (slideCount > 1 ? logical + 1 : 0) * trackWidth;
    setScrollX(next, true);
  }, [trackWidth, slideCount, setScrollX]);

  const animateTo = useCallback(
    (target: number) => {
      const width = slideWidthRef.current;
      const start = scrollXRef.current;
      let end = target;
      if (slideCount > 1 && width > 1) {
        const span = slideCount * width;
        const candidates = [target, target - span, target + span];
        end = candidates.reduce((best, value) =>
          Math.abs(value - start) < Math.abs(best - start) ? value : best
        );
      }
      if (Math.abs(end - start) < 0.5) {
        const settled = wrapIfNeeded(end);
        setScrollX(settled, true);
        return;
      }
      // Distance-scaled duration keeps short snaps snappy and long ones fluid.
      const distance = Math.abs(end - start);
      const duration = Math.min(820, Math.max(420, distance * 0.75 + 280));
      const slider = sliderRef.current;
      if (slider) {
        slider.style.transitionDuration = `${duration}ms`;
      }
      setScrollX(end, false);
      wrappingRef.current = true;
      window.setTimeout(() => {
        const settled = wrapIfNeeded(scrollXRef.current);
        if (settled !== scrollXRef.current) {
          setScrollX(settled, true);
        } else {
          applyTransform(settled, true);
        }
        wrappingRef.current = false;
        if (slider) {
          slider.style.transitionDuration = '';
        }
      }, duration + 16);
    },
    [applyTransform, setScrollX, slideCount, wrapIfNeeded]
  );

  const step = useCallback(
    (direction: -1 | 1) => {
      if (slideCount <= 1 || draggingRef.current || wrappingRef.current) return;
      const width = slideWidthRef.current;
      const currentIndex = Math.round(scrollXRef.current / width);
      animateTo((currentIndex + direction) * width);
    },
    [animateTo, slideCount]
  );

  const goTo = useCallback(
    (logicalIndex: number) => {
      if (slideCount <= 1 || draggingRef.current || wrappingRef.current) return;
      const width = slideWidthRef.current;
      const target = Math.max(0, Math.min(slideCount - 1, logicalIndex));
      animateTo((target + (slideCount > 1 ? 1 : 0)) * width);
    },
    [animateTo, slideCount]
  );

  useEffect(() => {
    if (!controlsRef) return;
    controlsRef.current = { step, goTo };
    return () => {
      controlsRef.current = null;
    };
  }, [controlsRef, goTo, step]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (slideCount <= 1) return;
    pointerIdRef.current = event.pointerId;
    pointerStartXRef.current = event.clientX;
    pointerStartYRef.current = event.clientY;
    lastMoveXRef.current = event.clientX;
    lastMoveTsRef.current = performance.now();
    velocityRef.current = 0;
    scrollStartRef.current = scrollXRef.current;
    movedRef.current = false;
    axisLockedRef.current = null;
    draggingRef.current = true;
    wrappingRef.current = false;
    setDragging(true);
    applyTransform(scrollXRef.current, true);
    onInteract?.();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId || !draggingRef.current) return;
    const dx = event.clientX - pointerStartXRef.current;
    const dy = event.clientY - pointerStartYRef.current;

    if (!axisLockedRef.current) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      axisLockedRef.current = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      if (axisLockedRef.current === 'y') {
        draggingRef.current = false;
        setDragging(false);
        pointerIdRef.current = null;
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          // ignore
        }
        return;
      }
    }

    if (axisLockedRef.current !== 'x') return;
    event.preventDefault();
    movedRef.current = true;

    const now = performance.now();
    const dt = Math.max(8, now - lastMoveTsRef.current);
    const moveDx = event.clientX - lastMoveXRef.current;
    // Smooth velocity with light EMA so snaps feel intentional.
    const instantVelocity = moveDx / dt;
    velocityRef.current = velocityRef.current * 0.65 + instantVelocity * 0.35;
    lastMoveXRef.current = event.clientX;
    lastMoveTsRef.current = now;

    const next = scrollStartRef.current - dx;
    scrollXRef.current = next;
    applyTransform(next, true);
    publishFromScroll(next);
  };

  const finishDrag = (clientX: number) => {
    if (!draggingRef.current && pointerIdRef.current == null) return;
    draggingRef.current = false;
    setDragging(false);
    pointerIdRef.current = null;

    const width = slideWidthRef.current;
    const dx = clientX - pointerStartXRef.current;
    const velocity = velocityRef.current;

    if (!movedRef.current || (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(velocity) < 0.2)) {
      const nearest = Math.round(scrollStartRef.current / width) * width;
      animateTo(nearest);
      if (!movedRef.current) {
        const logical = loopIndexToLogical(Math.round(nearest / width), slideCount);
        const slide = slides[logical];
        if (slide) onPressSlide?.(slide);
      }
      onInteract?.();
      return;
    }

    // Velocity chooses direction; otherwise snap to nearest.
    const progress = scrollXRef.current / width;
    let targetIndex = Math.round(progress);
    if (Math.abs(velocity) > 0.35) {
      // Finger moving right (positive velocity) reveals previous slide.
      targetIndex = velocity > 0 ? Math.floor(progress) : Math.ceil(progress);
    } else if (Math.abs(velocity) > 0.18) {
      targetIndex = velocity > 0 ? Math.floor(progress + 0.15) : Math.ceil(progress - 0.15);
    }
    animateTo(targetIndex * width);
    onInteract?.();
    setTick((value) => value + 1);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    finishDrag(event.clientX);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    finishDrag(event.clientX);
  };

  const activeLogical = activeLogicalRef.current;

  return (
    <div
      ref={trackRef}
      className="hero-carousel-web-track"
      style={{
        height: shellHeight,
        cursor: slideCount > 1 ? (dragging ? 'grabbing' : 'grab') : 'default',
        touchAction: 'pan-y',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div
        ref={sliderRef}
        className={`hero-carousel-web-slider${dragging ? ' is-instant' : ''}`}
        style={{
          width: trackWidth > 0 ? loopCount * slideWidthPx : `${Math.max(loopCount, 1) * 100}%`,
          transform: trackWidth > 0 ? `translate3d(${-scrollXRef.current}px,0,0)` : 'translate3d(0,0,0)',
        }}
      >
        {loopSlides.map((slide, idx) => (
          <div
            key={`${slide.id}:loop:${idx}`}
            className="hero-carousel-web-slide"
            style={{
              width: trackWidth > 0 ? slideWidthPx : `${100 / Math.max(loopCount, 1)}%`,
              flex: trackWidth > 0 ? `0 0 ${slideWidthPx}px` : `0 0 ${100 / Math.max(loopCount, 1)}%`,
            }}
          >
            <LiveSlideFrame
              slide={slide}
              shellHeight={shellHeight}
              slideWidth={slideWidthPx}
              fillWidth
              priority={loopIndexToLogical(idx, slideCount) === activeLogical ? 'high' : 'low'}
              topInset={topInset}
              disablePress
            />
          </div>
        ))}
      </div>
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

  const markInteracting = useCallback(() => {
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
      isInteractingRef.current = false;
    },
    [isLayoutReady, settleLoopIndex, slideCount, slideStride, useWebTrack]
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
    markInteracting();
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
          onInteract={markInteracting}
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
            markInteracting();
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
