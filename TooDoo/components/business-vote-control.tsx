import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { BrandColors } from '@/lib/brand-colors';
import { uiTheme } from '@/lib/ui-theme';
import type { ThemeMode } from '@/context/theme-preference-context';

export type BusinessVoteValue = 'up' | 'down' | null;

type BusinessVoteControlProps = {
  businessId?: string;
  mode: ThemeMode;
  /** Optional seed so empty businesses still show a believable score before an API exists. */
  seedScore?: number;
};

const UPVOTE_COLOR = BrandColors.dark.primary;
const DOWNVOTE_COLOR = '#ff3b30';
const FILL_MS = 240;
/** Ignore extra taps while the strip is still moving. */
const TAP_LOCK_MS = 220;
const PERSIST_DEBOUNCE_MS = 450;
/** Extra width so a mild skew still covers the pill edge-to-edge. */
const SKEW_PAD = 20;
const SKEW_DEG = '-16deg';

function voteStorageKey(businessId: string) {
  return `toodoo:business-vote:v1:${businessId}`;
}

function upFillForMode(mode: ThemeMode) {
  return mode === 'dark' ? 'rgba(71, 139, 235, 0.28)' : 'rgba(71, 139, 235, 0.16)';
}

function downFillForMode(mode: ThemeMode) {
  return mode === 'dark' ? 'rgba(255, 59, 48, 0.24)' : 'rgba(255, 59, 48, 0.12)';
}

function splitTargetForVote(vote: BusinessVoteValue) {
  if (vote === 'up') return 1;
  if (vote === 'down') return 0;
  return 0.5;
}

/** Stable faux baseline score until a real endpoint exists. */
function seededBaselineScore(businessId: string, seedScore?: number) {
  if (typeof seedScore === 'number' && Number.isFinite(seedScore)) {
    return Math.max(0, Math.round(seedScore));
  }
  let hash = 0;
  for (let i = 0; i < businessId.length; i += 1) {
    hash = (hash * 31 + businessId.charCodeAt(i)) >>> 0;
  }
  return 8 + (hash % 42);
}

/**
 * Sliding dual-color strip — only transforms (translateX + light skew for diagonal).
 * split: 0 = all downvote, 0.5 = centered, 1 = all upvote.
 */
function SlidingVoteFill({
  width,
  height,
  mode,
  split,
}: {
  width: number;
  height: number;
  mode: ThemeMode;
  split: SharedValue<number>;
}) {
  const upFill = upFillForMode(mode);
  const downFill = downFillForMode(mode);
  const panelWidth = width + SKEW_PAD * 2;

  const stripStyle = useAnimatedStyle(() => {
    const x = interpolate(split.value, [0, 0.5, 1], [-panelWidth, -panelWidth / 2, 0]);
    return {
      transform: [{ translateX: x }, { skewX: SKEW_DEG }],
    };
  }, [panelWidth]);

  if (width <= 0 || height <= 0) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width,
        height,
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: -SKEW_PAD,
            height,
            width: panelWidth * 2,
            flexDirection: 'row',
          },
          stripStyle,
        ]}
      >
        <View style={{ width: panelWidth, height, backgroundColor: upFill }} />
        <View style={{ width: panelWidth, height, backgroundColor: downFill }} />
      </Animated.View>
    </View>
  );
}

export function BusinessVoteControl({ businessId, mode, seedScore }: BusinessVoteControlProps) {
  const theme = uiTheme(mode);
  const [userVote, setUserVote] = useState<BusinessVoteValue>(null);
  const [baseline, setBaseline] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [pillSize, setPillSize] = useState({ width: 0, height: 0 });
  const userVoteRef = useRef<BusinessVoteValue>(null);
  const lockUntilRef = useRef(0);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 0 = all down, 0.5 = split, 1 = all up */
  const split = useSharedValue(0.5);

  useEffect(() => {
    let cancelled = false;
    userVoteRef.current = null;
    lockUntilRef.current = 0;
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }

    if (!businessId) {
      setUserVote(null);
      setBaseline(0);
      setHydrated(true);
      cancelAnimation(split);
      split.value = 0.5;
      return;
    }

    setHydrated(false);
    const nextBaseline = seededBaselineScore(businessId, seedScore);
    setBaseline(nextBaseline);

    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(voteStorageKey(businessId));
        if (cancelled) return;
        if (raw === 'up' || raw === 'down') {
          userVoteRef.current = raw;
          setUserVote(raw);
          cancelAnimation(split);
          split.value = splitTargetForVote(raw);
        } else {
          userVoteRef.current = null;
          setUserVote(null);
          cancelAnimation(split);
          split.value = 0.5;
        }
      } catch {
        if (!cancelled) {
          userVoteRef.current = null;
          setUserVote(null);
          cancelAnimation(split);
          split.value = 0.5;
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      cancelAnimation(split);
    };
  }, [businessId, seedScore, split]);

  const displayScore = useMemo(() => {
    if (userVote === 'up') return baseline + 1;
    if (userVote === 'down') return Math.max(0, baseline - 1);
    return baseline;
  }, [baseline, userVote]);

  const schedulePersist = useCallback((next: BusinessVoteValue, id: string) => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      void (async () => {
        try {
          if (!next) {
            await AsyncStorage.removeItem(voteStorageKey(id));
          } else {
            await AsyncStorage.setItem(voteStorageKey(id), next);
          }
        } catch {
          // Local preview only — ignore storage failures.
        }
      })();
    }, PERSIST_DEBOUNCE_MS);
  }, []);

  const animateSplitTo = useCallback(
    (target: number) => {
      cancelAnimation(split);
      split.value = withTiming(target, {
        duration: FILL_MS,
        easing: Easing.out(Easing.quad),
      });
    },
    [split]
  );

  const applyVote = useCallback(
    (next: Exclude<BusinessVoteValue, null>) => {
      if (!businessId || !hydrated) return;

      const now = Date.now();
      if (now < lockUntilRef.current) return;
      lockUntilRef.current = now + TAP_LOCK_MS;

      const resolved: BusinessVoteValue = userVoteRef.current === next ? null : next;
      userVoteRef.current = resolved;
      setUserVote(resolved);
      animateSplitTo(splitTargetForVote(resolved));
      schedulePersist(resolved, businessId);
    },
    [animateSplitTo, businessId, hydrated, schedulePersist]
  );

  if (!businessId) return null;

  const upActive = userVote === 'up';
  const downActive = userVote === 'down';
  const hasVoted = upActive || downActive;

  const upColor = upActive ? UPVOTE_COLOR : hasVoted ? theme.textMuted : '#ffffff';
  const downColor = downActive ? DOWNVOTE_COLOR : hasVoted ? theme.textMuted : '#ffffff';
  const scoreColor = upActive
    ? UPVOTE_COLOR
    : downActive
      ? DOWNVOTE_COLOR
      : theme.text;

  const glowColor = upActive ? UPVOTE_COLOR : downActive ? DOWNVOTE_COLOR : null;
  const pillGlowStyle = glowColor
    ? Platform.OS === 'web'
      ? ({
          boxShadow: `0 0 8px 1px ${glowColor}`,
        } as const)
      : {
          shadowColor: glowColor,
          shadowOpacity: 0.55,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 0 },
          elevation: 4,
        }
    : null;

  return (
    <View
      className="mt-4 mx-6 flex-row items-center justify-between"
      style={{
        borderRadius: 16,
        backgroundColor: theme.cardBg,
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
    >
      <View className="flex-1 pr-3">
        <Text className="text-sm font-semibold" style={{ color: theme.text }}>
          Community-betyg
        </Text>
        <Text className="mt-0.5 text-xs" style={{ color: theme.textFaint }}>
          Vad tycker du om stället?
        </Text>
      </View>

      <View style={[{ borderRadius: 999 }, pillGlowStyle]}>
        <View
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            if (width !== pillSize.width || height !== pillSize.height) {
              setPillSize({ width, height });
            }
          }}
          style={{
            borderRadius: 999,
            overflow: 'hidden',
            backgroundColor: 'transparent',
          }}
        >
          <SlidingVoteFill
            width={pillSize.width}
            height={pillSize.height}
            mode={mode}
            split={split}
          />

          <View
            className="flex-row items-center"
            style={{
              paddingHorizontal: 4,
              paddingVertical: 4,
            }}
          >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Upvote företag"
            accessibilityState={{ selected: upActive, disabled: !hydrated }}
            onPress={() => applyVote('up')}
            hitSlop={8}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'transparent',
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Ionicons
              name={upActive ? 'arrow-up-circle' : 'arrow-up-circle-outline'}
              size={26}
              color={upColor}
            />
          </Pressable>

          <Text
            className="min-w-[28px] text-center text-base font-semibold"
            style={{ color: scoreColor }}
          >
            {displayScore}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Downvote företag"
            accessibilityState={{ selected: downActive, disabled: !hydrated }}
            onPress={() => applyVote('down')}
            hitSlop={8}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'transparent',
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Ionicons
              name={downActive ? 'arrow-down-circle' : 'arrow-down-circle-outline'}
              size={26}
              color={downColor}
            />
          </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
