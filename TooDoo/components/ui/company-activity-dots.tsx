import { View } from 'react-native';

import { brandInkRgba } from '@/lib/brand-colors';

/** Orange dot for companies with an active erbjudande. */
export const OFFER_ACTIVITY_COLOR = '#ff9500';

/** Same as the Nära dig / distance pill background. */
const RING_COLOR = brandInkRgba(0.75);

const ACTIVE_DOT_SIZE = 7;
const OUTER_DOT_SIZE = 11;

/** Horizontal padding on the Nära dig / distance pill (`px-2`). */
const BADGE_TEXT_INSET = 8;

function ActivityDot({ active, color }: { active: boolean; color: string }) {
  if (!active) {
    return (
      <View
        style={{
          width: OUTER_DOT_SIZE,
          height: OUTER_DOT_SIZE,
          borderRadius: OUTER_DOT_SIZE / 2,
          backgroundColor: RING_COLOR,
        }}
      />
    );
  }

  const inset = (OUTER_DOT_SIZE - ACTIVE_DOT_SIZE) / 2;

  return (
    <View
      style={{
        width: OUTER_DOT_SIZE,
        height: OUTER_DOT_SIZE,
        borderRadius: OUTER_DOT_SIZE / 2,
        backgroundColor: RING_COLOR,
        position: 'relative',
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: inset,
          left: inset,
          width: ACTIVE_DOT_SIZE,
          height: ACTIVE_DOT_SIZE,
          borderRadius: ACTIVE_DOT_SIZE / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export function CompanyActivityDots({
  hasEvent,
  hasOffer,
  eventColor,
  offerColor = OFFER_ACTIVITY_COLOR,
}: {
  hasEvent: boolean;
  hasOffer: boolean;
  eventColor: string;
  offerColor?: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 4,
        paddingLeft: BADGE_TEXT_INSET,
        alignSelf: 'flex-start',
      }}
    >
      <ActivityDot active={hasEvent} color={eventColor} />
      <ActivityDot active={hasOffer} color={offerColor} />
    </View>
  );
}
