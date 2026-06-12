import { useEffect, useMemo, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import { uiTheme } from '@/lib/ui-theme';

type Theme = ReturnType<typeof uiTheme>;

const ITEM_HEIGHT = 40;
const WHEEL_VISIBLE_HEIGHT = 190;

export const BIRTH_MONTH_NAMES = [
  'januari',
  'februari',
  'mars',
  'april',
  'maj',
  'juni',
  'juli',
  'augusti',
  'september',
  'oktober',
  'november',
  'december',
] as const;

export function formatBirthDateDisplay(date: Date) {
  const day = date.getDate();
  const month = BIRTH_MONTH_NAMES[date.getMonth()] ?? '';
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

function clampBirthDate(date: Date, maximumDate: Date) {
  return date.getTime() > maximumDate.getTime() ? maximumDate : date;
}

function buildYearOptions(maximumDate: Date) {
  const minYear = 1920;
  const maxYear = maximumDate.getFullYear();
  return Array.from({ length: maxYear - minYear + 1 }, (_, index) => String(maxYear - index));
}

function buildMonthOptions(year: number, maximumDate: Date) {
  const maxMonth = year === maximumDate.getFullYear() ? maximumDate.getMonth() : 11;
  return BIRTH_MONTH_NAMES.slice(0, maxMonth + 1);
}

function getDaysInMonth(year: number, month: number, maximumDate: Date) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  if (year === maximumDate.getFullYear() && month === maximumDate.getMonth()) {
    return Math.min(daysInMonth, maximumDate.getDate());
  }
  return daysInMonth;
}

function buildDayOptions(year: number, month: number, maximumDate: Date) {
  const maxDay = getDaysInMonth(year, month, maximumDate);
  return Array.from({ length: maxDay }, (_, index) => String(index + 1));
}

function normalizeBirthParts(
  year: number,
  month: number,
  day: number,
  maximumDate: Date
): { year: number; month: number; day: number } {
  const years = buildYearOptions(maximumDate);
  const safeYear = years.includes(String(year)) ? year : Number(years[0] ?? year);

  const months = buildMonthOptions(safeYear, maximumDate);
  const monthLabel = BIRTH_MONTH_NAMES[month];
  const monthIndexInList = months.indexOf(monthLabel);
  const safeMonth =
    monthIndexInList >= 0
      ? month
      : MONTH_NAMES_INDEX(months[months.length - 1] ?? 'januari');

  const maxDay = getDaysInMonth(safeYear, safeMonth, maximumDate);
  const safeDay = Math.min(Math.max(day, 1), maxDay);

  return { year: safeYear, month: safeMonth, day: safeDay };
}

function MONTH_NAMES_INDEX(name: string) {
  const index = BIRTH_MONTH_NAMES.indexOf(name as (typeof BIRTH_MONTH_NAMES)[number]);
  return index >= 0 ? index : 0;
}

function partsToDate(parts: { year: number; month: number; day: number }, maximumDate: Date) {
  return clampBirthDate(new Date(parts.year, parts.month, parts.day), maximumDate);
}

type WheelColumnProps = {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  theme: Theme;
  style?: ViewStyle;
  columnKey?: string;
};

function WheelColumn({ items, selectedIndex, onSelect, theme, style, columnKey }: WheelColumnProps) {
  const scrollRef = useRef<ScrollView>(null);
  const isUserScrollingRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  const boundedSelectedIndex = Math.max(0, Math.min(selectedIndex, Math.max(items.length - 1, 0)));
  const [centerIndex, setCenterIndex] = useState(boundedSelectedIndex);

  onSelectRef.current = onSelect;

  useEffect(() => {
    if (isUserScrollingRef.current) return;
    const nextIndex = Math.max(0, Math.min(selectedIndex, items.length - 1));
    setCenterIndex(nextIndex);
    scrollRef.current?.scrollTo({ y: nextIndex * ITEM_HEIGHT, animated: false });
  }, [selectedIndex, items.length, columnKey]);

  const indexFromOffset = (offsetY: number) =>
    Math.max(0, Math.min(Math.round(offsetY / ITEM_HEIGHT), items.length - 1));

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    isUserScrollingRef.current = true;
    setCenterIndex(indexFromOffset(event.nativeEvent.contentOffset.y));
  };

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    isUserScrollingRef.current = false;
    const nextIndex = indexFromOffset(event.nativeEvent.contentOffset.y);
    scrollRef.current?.scrollTo({ y: nextIndex * ITEM_HEIGHT, animated: true });
    setCenterIndex(nextIndex);
    onSelectRef.current(nextIndex);
  };

  const handleScrollBegin = () => {
    isUserScrollingRef.current = true;
  };

  if (items.length === 0) {
    return <View style={[{ flex: 1, height: WHEEL_VISIBLE_HEIGHT }, style]} />;
  }

  const padding = (WHEEL_VISIBLE_HEIGHT - ITEM_HEIGHT) / 2;

  return (
    <ScrollView
      ref={scrollRef}
      {...(Platform.OS === 'web' ? ({ className: 'wheel-picker-column' } as object) : {})}
      style={[{ flex: 1, height: WHEEL_VISIBLE_HEIGHT }, style]}
      contentContainerStyle={{ paddingVertical: padding }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_HEIGHT}
      snapToAlignment="center"
      decelerationRate="fast"
      scrollEventThrottle={16}
      nestedScrollEnabled
      onScrollBeginDrag={handleScrollBegin}
      onMouseDown={Platform.OS === 'web' ? handleScrollBegin : undefined}
      onWheel={Platform.OS === 'web' ? handleScrollBegin : undefined}
      onScroll={handleScroll}
      onMomentumScrollEnd={handleScrollEnd}
      onScrollEndDrag={handleScrollEnd}
    >
      {items.map((label, index) => {
        const isCentered = index === centerIndex;
        return (
          <View
            key={`${columnKey ?? 'wheel'}-${label}-${index}`}
            {...(Platform.OS === 'web' ? ({ className: 'wheel-picker-item' } as object) : {})}
            style={{
              height: ITEM_HEIGHT,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 4,
            }}
          >
            <Text
              numberOfLines={1}
              {...(Platform.OS === 'web' && isCentered ? ({ className: 'wheel-picker-item-active' } as object) : {})}
              style={{
                color: isCentered ? '#ffffff' : theme.textFaint,
                fontSize: isCentered ? 20 : 17,
                fontWeight: isCentered ? '600' : '400',
                opacity: isCentered ? 1 : 0.4,
              }}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

type WebBirthDateWheelPickerProps = {
  value: Date;
  maximumDate: Date;
  onChange: (date: Date) => void;
  theme: Theme;
};

export function WebBirthDateWheelPicker({
  value,
  maximumDate,
  onChange,
  theme,
}: WebBirthDateWheelPickerProps) {
  const parts = useMemo(
    () => normalizeBirthParts(value.getFullYear(), value.getMonth(), value.getDate(), maximumDate),
    [value, maximumDate]
  );

  const years = useMemo(() => buildYearOptions(maximumDate), [maximumDate]);
  const months = useMemo(
    () => buildMonthOptions(parts.year, maximumDate),
    [parts.year, maximumDate]
  );
  const days = useMemo(
    () => buildDayOptions(parts.year, parts.month, maximumDate),
    [parts.year, parts.month, maximumDate]
  );

  useEffect(() => {
    const normalizedDate = partsToDate(parts, maximumDate);
    if (
      normalizedDate.getFullYear() !== value.getFullYear() ||
      normalizedDate.getMonth() !== value.getMonth() ||
      normalizedDate.getDate() !== value.getDate()
    ) {
      onChange(normalizedDate);
    }
  }, [parts, value, maximumDate, onChange]);

  const yearIndex = Math.max(0, years.indexOf(String(parts.year)));
  const monthIndex = Math.max(0, months.indexOf(BIRTH_MONTH_NAMES[parts.month]));
  const dayIndex = Math.max(0, Math.min(parts.day - 1, days.length - 1));

  const update = (nextYear: number, nextMonth: number, nextDay: number) => {
    const normalized = normalizeBirthParts(nextYear, nextMonth, nextDay, maximumDate);
    onChange(partsToDate(normalized, maximumDate));
  };

  if (Platform.OS !== 'web') return null;

  return (
    <View style={{ height: WHEEL_VISIBLE_HEIGHT, position: 'relative' }}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 8,
          right: 8,
          top: (WHEEL_VISIBLE_HEIGHT - ITEM_HEIGHT) / 2,
          height: ITEM_HEIGHT,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          zIndex: 1,
        }}
      />
      <View style={{ flexDirection: 'row', height: WHEEL_VISIBLE_HEIGHT }}>
        <WheelColumn
          key={`days-${parts.year}-${parts.month}`}
          columnKey={`days-${parts.year}-${parts.month}`}
          items={days}
          selectedIndex={dayIndex}
          onSelect={(index) => update(parts.year, parts.month, index + 1)}
          theme={theme}
        />
        <WheelColumn
          key={`months-${parts.year}`}
          columnKey={`months-${parts.year}`}
          items={[...months]}
          selectedIndex={monthIndex}
          onSelect={(index) => {
            const nextMonth = MONTH_NAMES_INDEX(months[index] ?? months[0]);
            update(parts.year, nextMonth, parts.day);
          }}
          theme={theme}
          style={{ flex: 1.35 }}
        />
        <WheelColumn
          items={years}
          selectedIndex={yearIndex}
          onSelect={(index) => update(Number(years[index]), parts.month, parts.day)}
          theme={theme}
        />
      </View>
    </View>
  );
}
