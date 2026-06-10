import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export type { HeroSlide };

const HERO_HEIGHT = 210;
const HERO_AUTO_MS = 3000;
const HERO_SCROLL_ANIM_MS = 450;

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
}: {
  source: ImageSourcePropType;
  width: number;
  height: number;
}) {
  const uri = resolveHeroImageUri(source);

  if (Platform.OS === 'web' && uri) {
    return (
      <img
        src={uri}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width,
          height,
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
    />
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
  const { width: screenWidth } = useWindowDimensions();
  const shellHeight = HERO_HEIGHT + topInset;
  const scrollRef = useRef<ScrollView>(null);
  const currentLoopIndexRef = useRef(0);
  const isInteractingRef = useRef(false);
  const [activeDot, setActiveDot] = useState(0);

  const slideCount = slides.length;
  const loopSlides = useMemo(() => buildLoopSlides(slides), [slides]);
  const loopStartIndex = slideCount > 1 ? 1 : 0;
  const slideStride = screenWidth;

  useEffect(() => {
    if (slideStride <= 0 || slideCount === 0) return;

    currentLoopIndexRef.current = loopStartIndex;
    setActiveDot(0);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: loopStartIndex * slideStride, animated: false });
    });
  }, [loopStartIndex, slideCount, slideStride]);

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
      if (slideStride <= 0 || slideCount === 0) return;

      const loopIndex = Math.round(offsetX / slideStride);
      settleLoopIndex(loopIndex);
    },
    [slideCount, slideStride, settleLoopIndex]
  );

  useEffect(() => {
    if (slideCount <= 1 || slideStride <= 0) return;

    const timer = setInterval(() => {
      if (isInteractingRef.current) return;

      const nextLoopIndex = currentLoopIndexRef.current + 1;
      currentLoopIndexRef.current = nextLoopIndex;
      scrollRef.current?.scrollTo({ x: nextLoopIndex * slideStride, animated: true });
      setActiveDot(loopIndexToLogical(nextLoopIndex, slideCount));

      // Programmatic scrolls don't always fire onMomentumScrollEnd (especially on web).
      setTimeout(() => {
        settleLoopIndex(currentLoopIndexRef.current);
      }, HERO_SCROLL_ANIM_MS);
    }, HERO_AUTO_MS);

    return () => clearInterval(timer);
  }, [slideCount, slideStride, settleLoopIndex]);

  const scrollToLogicalIndex = (logicalIndex: number) => {
    if (slideCount === 0 || slideStride <= 0) return;

    const targetLoopIndex = slideCount > 1 ? logicalIndex + 1 : 0;
    currentLoopIndexRef.current = targetLoopIndex;
    setActiveDot(logicalIndex);
    scrollRef.current?.scrollTo({ x: targetLoopIndex * slideStride, animated: true });
  };

  if (slideCount === 0 || slideStride <= 0) return null;

  return (
    <View style={[styles.shell, { height: shellHeight, backgroundColor: panelBackgroundColor }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        nestedScrollEnabled
        pagingEnabled
        removeClippedSubviews={Platform.OS !== 'web'}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={slideStride}
        snapToAlignment="start"
        disableIntervalMomentum
        scrollEventThrottle={32}
        style={{ height: shellHeight }}
        onScrollBeginDrag={() => {
          isInteractingRef.current = true;
        }}
        onScrollEndDrag={(event) => handleScrollEnd(event.nativeEvent.contentOffset.x)}
        onMomentumScrollEnd={(event) => handleScrollEnd(event.nativeEvent.contentOffset.x)}
      >
        {loopSlides.map((slide, idx) => (
          <View
            key={`hero-${idx}-${slide.title}`}
            style={{ width: slideStride, height: shellHeight, position: 'relative', overflow: 'hidden' }}
          >
            <HeroSlideImage source={slide.source} width={slideStride} height={shellHeight} />
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
          </View>
        ))}
      </ScrollView>
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
    overflow: 'hidden',
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
