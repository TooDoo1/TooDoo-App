import { Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { CardMedia } from '@/components/ui/card-media';
import { EventBadge } from '@/components/ui/event-badge';
import { useThemePreference } from '@/context/theme-preference-context';
import { type BusinessEventItem } from '@/lib/business-events';
import { uiTheme } from '@/lib/ui-theme';

const NEAR_YOU_CARD_WIDTH = 168;

export function EventsPortraitRow({
  events,
  onEventPress,
  emptyText,
}: {
  events: BusinessEventItem[];
  onEventPress?: (event: BusinessEventItem) => void;
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
        {items.map((event, idx) => (
          <Pressable
            key={`${event.id}-${idx}`}
            onPress={() => onEventPress?.(event)}
            className="overflow-hidden rounded-2xl"
            style={{
              width: NEAR_YOU_CARD_WIDTH,
              backgroundColor: theme.cardBg,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <View className="relative h-32 w-full">
              {event.image ? (
                <CardMedia source={event.image} svgFit="fill" priority={idx < 4 ? 'high' : 'normal'} />
              ) : (
                <View className="h-full w-full" style={{ backgroundColor: theme.cardBg }} />
              )}
              <View className="absolute inset-0 bg-black/20" />
              <EventBadge backgroundColor={theme.eventColor} />
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
                  paddingHorizontal: 10,
                  paddingBottom: 10,
                  justifyContent: 'flex-end',
                }}
              >
                <Text className="text-sm font-semibold text-white" numberOfLines={1}>
                  {event.title}
                </Text>
                <Text className="mt-0.5 text-[11px] text-white/80" numberOfLines={1}>
                  {event.businessName}
                </Text>
              </LinearGradient>
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
