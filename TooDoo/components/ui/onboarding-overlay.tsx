import { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemePreference } from '@/context/theme-preference-context';
import { uiTheme } from '@/lib/ui-theme';

type OnboardingSlide = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: [string, string];
  title: string;
  body: string;
};

const SLIDES: OnboardingSlide[] = [
  {
    key: 'discover',
    icon: 'compass',
    accent: ['#3c7fdd', '#6c9ef5'],
    title: 'Upptäck nära dig',
    body: 'Hitta restauranger, upplevelser och event nära dig — allt samlat på ett ställe.',
  },
  {
    key: 'offers',
    icon: 'pricetags',
    accent: ['#ff7a45', '#ff9b46'],
    title: 'Ta del av erbjudanden',
    body: 'Claima heta erbjudanden och visa enkelt din QR-kod på plats för att lösa in dem.',
  },
  {
    key: 'favorites',
    icon: 'heart',
    accent: ['#d4537e', '#ef7aa0'],
    title: 'Spara dina favoriter',
    body: 'Följ dina favoritföretag så att du aldrig missar ett nytt erbjudande eller event.',
  },
];

type OnboardingOverlayProps = {
  onDone: () => void;
};

type ThemeValue = ReturnType<typeof uiTheme>;

function OnboardingSlideView({
  slide,
  index,
  scrollX,
  slideWidth,
  paddingTop,
  theme,
}: {
  slide: OnboardingSlide;
  index: number;
  scrollX: SharedValue<number>;
  slideWidth: number;
  paddingTop: number;
  theme: ThemeValue;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const position = scrollX.value / slideWidth - index;
    const distance = Math.min(Math.abs(position), 1);
    // Smoothstep easing — gentle at both ends so text never pops in/out.
    const eased = distance * distance * (3 - 2 * distance);

    const opacity = 1 - eased;
    const scale = 1 - eased * 0.12;
    // Content drifts slightly slower than the page for a subtle parallax feel.
    const translateX = interpolate(position, [-1, 0, 1], [slideWidth * 0.12, 0, -slideWidth * 0.12]);

    return {
      opacity,
      transform: [{ translateX }, { scale }],
    };
  });

  return (
    <View style={[styles.slide, { width: slideWidth, paddingTop }]}>
      <Animated.View style={[styles.slideInner, animatedStyle]}>
        <LinearGradient
          colors={slide.accent}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconCircle}
        >
          <Ionicons name={slide.icon} size={72} color="#ffffff" />
        </LinearGradient>

        <Text style={[styles.title, { color: theme.text }]}>{slide.title}</Text>
        <Text style={[styles.body, { color: theme.textMuted }]}>{slide.body}</Text>
      </Animated.View>
    </View>
  );
}

function OnboardingDot({
  index,
  scrollX,
  slideWidth,
  theme,
}: {
  index: number;
  scrollX: SharedValue<number>;
  slideWidth: number;
  theme: ThemeValue;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const position = scrollX.value / slideWidth - index;
    const distance = Math.abs(position);
    const width = interpolate(distance, [0, 1], [22, 8], Extrapolation.CLAMP);
    const opacity = interpolate(distance, [0, 1], [1, 0.4], Extrapolation.CLAMP);

    return { width, opacity };
  });

  return <Animated.View style={[styles.dot, { backgroundColor: theme.primary }, animatedStyle]} />;
}

export function OnboardingOverlay({ onDone }: OnboardingOverlayProps) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const scrollRef = useRef<Animated.ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const exitProgress = useSharedValue(0);
  const scrollX = useSharedValue(0);
  const isLeavingRef = useRef(false);

  const slideWidth = Math.max(windowWidth, 1);
  const isLastSlide = activeIndex >= SLIDES.length - 1;

  const containerStyle = useAnimatedStyle(() => ({
    opacity: 1 - exitProgress.value,
  }));

  const finish = useCallback(
    (navigateTo?: string) => {
      if (isLeavingRef.current) return;
      isLeavingRef.current = true;

      if (navigateTo) {
        router.push(navigateTo as never);
      }

      exitProgress.value = withTiming(
        1,
        { duration: 260, easing: Easing.out(Easing.quad) },
        () => {
          'worklet';
        }
      );

      setTimeout(() => {
        onDone();
      }, 260);
    },
    [exitProgress, onDone, router]
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / slideWidth);
      if (index !== activeIndex && index >= 0 && index < SLIDES.length) {
        setActiveIndex(index);
      }
    },
    [activeIndex, slideWidth]
  );

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const goToNext = useCallback(() => {
    if (isLastSlide) {
      finish();
      return;
    }
    const next = activeIndex + 1;
    scrollRef.current?.scrollTo({ x: next * slideWidth, animated: true });
    setActiveIndex(next);
  }, [activeIndex, finish, isLastSlide, slideWidth]);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: theme.screenBg }, containerStyle]}
    >
      {!isLastSlide ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hoppa över introduktionen"
          onPress={() => finish()}
          hitSlop={12}
          style={[styles.skipButton, { top: insets.top + 12 }]}
        >
          <Text style={[styles.skipText, { color: theme.textMuted }]}>Skippa</Text>
        </Pressable>
      ) : null}

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        style={styles.scroll}
      >
        {SLIDES.map((slide, index) => (
          <OnboardingSlideView
            key={slide.key}
            slide={slide}
            index={index}
            scrollX={scrollX}
            slideWidth={slideWidth}
            paddingTop={insets.top + 72}
            theme={theme}
          />
        ))}
      </Animated.ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        {isLastSlide ? (
          <View style={styles.accountRow}>
            <Text style={[styles.accountPrompt, { color: theme.textFaint }]}>Har du inget konto?</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => finish('/(tabs)/Registrering')}
              hitSlop={8}
            >
              <Text style={[styles.accountLink, { color: theme.link }]}>Skapa konto</Text>
            </Pressable>
            <Text style={[styles.accountPrompt, { color: theme.textFaint }]}>·</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => finish('/(tabs)/Loggain')}
              hitSlop={8}
            >
              <Text style={[styles.accountLink, { color: theme.link }]}>Logga in</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.accountRowPlaceholder} />
        )}

        <View style={styles.dots}>
          {SLIDES.map((slide, index) => (
            <OnboardingDot
              key={slide.key}
              index={index}
              scrollX={scrollX}
              slideWidth={slideWidth}
              theme={theme}
            />
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={goToNext}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: theme.primary, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <Text style={[styles.primaryButtonText, { color: theme.isDark ? '#ffffff' : '#131720' }]}>
            {isLastSlide ? 'Kom igång' : 'Nästa'}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    zIndex: 500,
    elevation: 500,
  },
  skipButton: {
    position: 'absolute',
    right: 20,
    zIndex: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  skipText: {
    fontSize: 15,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  slideInner: {
    flex: 1,
    alignItems: 'center',
  },
  iconCircle: {
    width: 156,
    height: 156,
    borderRadius: 78,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 44,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 14,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 320,
  },
  footer: {
    paddingHorizontal: 28,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  primaryButton: {
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  accountRowPlaceholder: {
    marginBottom: 20,
    minHeight: 22,
  },
  accountPrompt: {
    fontSize: 14,
  },
  accountLink: {
    fontSize: 14,
    fontWeight: '700',
  },
});
