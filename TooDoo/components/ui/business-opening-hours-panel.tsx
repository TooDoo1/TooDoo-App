import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import {
  getOpeningHoursWeekRows,
  getTodayOpeningHoursText,
  isBusinessOpenNow,
  normalizeBusinessOpeningHours,
} from '@/lib/business-opening-hours';
import { uiTheme } from '@/lib/ui-theme';

const DROPDOWN_OPEN_MS = 400;
const DROPDOWN_CLOSE_MS = 420;
const DROPDOWN_OPEN_EASING = Easing.bezier(0.22, 1, 0.36, 1);
const DROPDOWN_CLOSE_EASING = Easing.bezier(0.4, 0, 0.2, 1);

function OpeningHoursWeekList({
  weekRows,
  theme,
}: {
  weekRows: ReturnType<typeof getOpeningHoursWeekRows>;
  theme: ReturnType<typeof uiTheme>;
}) {
  return (
    <>
      {weekRows.map((row) => (
        <View key={row.key} className="flex-row items-center justify-between py-2">
          <Text
            className="text-sm"
            style={{
              color: row.isToday ? theme.text : theme.textMuted,
              fontWeight: row.isToday ? '600' : '400',
            }}
          >
            {row.label}
          </Text>
          <Text
            className="text-sm"
            style={{
              color: row.isToday ? theme.text : theme.textMuted,
              fontWeight: row.isToday ? '600' : '400',
            }}
          >
            {row.hoursText}
          </Text>
        </View>
      ))}
    </>
  );
}

export function BusinessOpeningHoursPanel({
  openingHours,
  mode,
}: {
  openingHours: unknown;
  mode: 'light' | 'dark';
}) {
  const theme = uiTheme(mode);
  const [expanded, setExpanded] = useState(false);
  const [isDropdownMounted, setIsDropdownMounted] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const dropdownProgress = useSharedValue(0);
  const headerHeightSv = useSharedValue(56);
  const dropdownHeightSv = useSharedValue(0);

  const hours = useMemo(() => normalizeBusinessOpeningHours(openingHours), [openingHours]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (expanded) {
      setIsDropdownMounted(true);
      dropdownProgress.value = withTiming(1, {
        duration: DROPDOWN_OPEN_MS,
        easing: DROPDOWN_OPEN_EASING,
      });
      return;
    }

    if (!isDropdownMounted) {
      return;
    }

    dropdownProgress.value = withTiming(
      0,
      {
        duration: DROPDOWN_CLOSE_MS,
        easing: DROPDOWN_CLOSE_EASING,
      },
      (finished) => {
        if (finished) {
          runOnJS(setIsDropdownMounted)(false);
        }
      }
    );
  }, [dropdownProgress, expanded, isDropdownMounted]);

  const dropdownClipAnimatedStyle = useAnimatedStyle(() => {
    const progress = dropdownProgress.value;
    const dropdownHeight = dropdownHeightSv.value;

    return {
      top: headerHeightSv.value,
      height: interpolate(progress, [0, 1], [0, dropdownHeight]),
    };
  });

  const dropdownAnimatedStyle = useAnimatedStyle(() => {
    const progress = dropdownProgress.value;
    const dropdownHeight = dropdownHeightSv.value;

    return {
      opacity: interpolate(progress, [0, 0.12, 1], [0, 1, 1], 'clamp'),
      transform: [
        {
          translateY: interpolate(progress, [0, 1], [-dropdownHeight, 0]),
        },
      ],
    };
  });

  const dropdownSpacerAnimatedStyle = useAnimatedStyle(() => {
    const progress = dropdownProgress.value;
    const dropdownHeight = dropdownHeightSv.value;

    return {
      height: interpolate(progress, [0, 1], [0, dropdownHeight]),
    };
  });

  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const isOpen = useMemo(() => isBusinessOpenNow(hours, now), [hours, now]);
  const todayHoursText = useMemo(() => getTodayOpeningHoursText(hours, now), [hours, now]);
  const weekRows = useMemo(() => getOpeningHoursWeekRows(hours, now), [hours, now]);

  if (!hours) {
    return null;
  }

  const statusColor = isOpen ? '#34c759' : theme.textMuted;
  const statusLabel = isOpen ? 'Öppet' : 'Stängt';

  return (
    <View
      style={{
        marginHorizontal: 24,
        marginTop: 8,
        marginBottom: 8,
        overflow: 'hidden',
        borderRadius: 16,
        backgroundColor: theme.cardBg,
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          opacity: 0,
          zIndex: -1,
          pointerEvents: 'none',
        }}
        onLayout={(event) => {
          const measuredHeight = event.nativeEvent.layout.height;
          if (measuredHeight > 0) {
            dropdownHeightSv.value = measuredHeight;
          }
        }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View
          style={{
            paddingHorizontal: 16,
            paddingBottom: 12,
            borderTopWidth: 1,
            borderTopColor: theme.border,
          }}
        >
          <OpeningHoursWeekList weekRows={weekRows} theme={theme} />
        </View>
      </View>

      <View style={{ position: 'relative' }}>
        {isDropdownMounted ? (
          <Reanimated.View
            pointerEvents={expanded ? 'auto' : 'none'}
            style={[
              dropdownClipAnimatedStyle,
              {
                position: 'absolute',
                left: 0,
                right: 0,
                zIndex: 1,
                overflow: 'hidden',
              },
            ]}
          >
            <Reanimated.View
              style={[
                dropdownAnimatedStyle,
                {
                  backgroundColor: theme.cardBg,
                  borderTopWidth: 1,
                  borderTopColor: theme.border,
                  paddingHorizontal: 16,
                  paddingBottom: 12,
                },
              ]}
            >
              <OpeningHoursWeekList weekRows={weekRows} theme={theme} />
            </Reanimated.View>
          </Reanimated.View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={expanded ? 'Dölj öppettider' : 'Visa öppettider'}
          onPress={() => setExpanded((value) => !value)}
          className="flex-row items-center px-4 py-3"
          style={{ zIndex: 2, backgroundColor: theme.cardBg }}
          onLayout={(event) => {
            const measuredHeight = event.nativeEvent.layout.height;
            if (measuredHeight > 0) {
              headerHeightSv.value = measuredHeight;
            }
          }}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: statusColor,
              marginRight: 10,
            }}
          />
          <View className="flex-1">
            <Text className="text-base font-semibold" style={{ color: theme.text }}>
              {statusLabel}
            </Text>
            <Text className="mt-0.5 text-sm" style={{ color: theme.textMuted }}>
              {todayHoursText ? `Idag ${todayHoursText}` : 'Inga öppettider idag'}
            </Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={theme.textMuted}
          />
        </Pressable>
      </View>

      <Reanimated.View style={dropdownSpacerAnimatedStyle} />
    </View>
  );
}
