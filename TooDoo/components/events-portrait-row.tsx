import { Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { CardMedia } from '@/components/ui/card-media';
import { EventBadge } from '@/components/ui/event-badge';
import { useThemePreference } from '@/context/theme-preference-context';
import { getFeedEventStartParts, type EventFeedItem } from '@/lib/events-feed';
import { BrandColors } from '@/lib/brand-colors';
import { uiTheme } from '@/lib/ui-theme';

const EVENT_CARD_WIDTH = 220;
const EVENT_CARD_HEIGHT = 200;

export function EventsPortraitRow({
  events,
  onEventPress,
  emptyText,
}: {
  events: EventFeedItem[];
  onEventPress?: (event: EventFeedItem) => void;
  emptyText: string;
}) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const items = events.slice(0, 10);

  if (items.length === 0) {
    return <Text style={{ color: theme.textMuted }}>{emptyText}</Text>;
  }

  return (
    <ScrollView
      horizontal
      removeClippedSubviews
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 2 }}
    >
      <View className="flex-row gap-3 pb-2">
        {items.map((event, idx) => {
          const startDate = getFeedEventStartParts(event);

          return (
            <Pressable
              key={`${event.id}-${idx}`}
              onPress={() => onEventPress?.(event)}
              className="overflow-hidden rounded-2xl"
              style={{
                width: EVENT_CARD_WIDTH,
                height: EVENT_CARD_HEIGHT,
                backgroundColor: theme.cardBg,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <View className="relative h-full w-full">
                {event.image ? (
                  <CardMedia
                    source={event.image}
                    svgFit="fill"
                    priority={idx < 4 ? 'high' : 'normal'}
                    displayWidth={EVENT_CARD_WIDTH}
                  />
                ) : (
                  <View className="h-full w-full" style={{ backgroundColor: theme.cardBg }} />
                )}
                <View className="absolute inset-0 bg-black/20" />
                <EventBadge backgroundColor={theme.eventColor} align="right" />

                {startDate ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: 10,
                      left: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 12,
                      backgroundColor: 'rgba(255,255,255,0.94)',
                      alignItems: 'center',
                      minWidth: 44,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: '700',
                        color: BrandColors.dark.secondary,
                        lineHeight: 18,
                      }}
                    >
                      {startDate.day}
                    </Text>
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '700',
                        color: BrandColors.dark.secondary,
                        lineHeight: 12,
                        letterSpacing: 0.4,
                      }}
                    >
                      {startDate.month}
                    </Text>
                  </View>
                ) : null}

                <LinearGradient
                  colors={['rgba(0,0,0,0.00)', 'rgba(0,0,0,0.85)']}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: '55%',
                    paddingHorizontal: 12,
                    paddingBottom: 12,
                    justifyContent: 'flex-end',
                  }}
                >
                  <Text className="text-base font-semibold text-white" numberOfLines={2}>
                    {event.title}
                  </Text>
                  <Text className="mt-1 text-xs text-white/80" numberOfLines={1}>
                    {event.subtitle}
                  </Text>
                </LinearGradient>
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
