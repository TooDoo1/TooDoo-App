import { Ionicons } from '@expo/vector-icons';
import { Platform, View } from 'react-native';

/** Warm deal accent for companies with an active erbjudande. */
export const OFFER_ACTIVITY_COLOR = '#ff8a3d';

/** Blue accent for companies with an active event (matches theme.eventColor). */
export const EVENT_ACTIVITY_COLOR = '#478beb';

/** Horizontal padding on the Nära dig / distance pill (`px-2`). */
const BADGE_TEXT_INSET = 8;

const pillShadow =
	Platform.OS === 'web'
		? ({ boxShadow: '0 4px 12px rgba(0,0,0,0.28)' } as const)
		: Platform.OS === 'ios'
			? {
					shadowColor: '#000',
					shadowOpacity: 0.28,
					shadowRadius: 6,
					shadowOffset: { width: 0, height: 2 },
				}
			: { elevation: 3 };

function ActivityIconPill({
	icon,
	color,
	label,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	color: string;
	label: string;
}) {
	return (
		<View
			accessibilityRole="image"
			accessibilityLabel={label}
			style={[
				{
					width: 26,
					height: 26,
					borderRadius: 13,
					alignItems: 'center',
					justifyContent: 'center',
					backgroundColor: color,
				},
				pillShadow,
			]}
		>
			<Ionicons name={icon} size={13} color="#ffffff" />
		</View>
	);
}

/**
 * Compact activity markers on company cards:
 * calendar for events, pricetag for erbjudanden — only when active.
 */
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
	if (!hasEvent && !hasOffer) return null;

	return (
		<View
			style={{
				flexDirection: 'row',
				alignItems: 'center',
				gap: 6,
				marginTop: 4,
				paddingLeft: BADGE_TEXT_INSET,
				alignSelf: 'flex-start',
			}}
		>
			{hasEvent ? (
				<ActivityIconPill
					icon="calendar"
					color={eventColor || EVENT_ACTIVITY_COLOR}
					label="Har evenemang"
				/>
			) : null}
			{hasOffer ? (
				<ActivityIconPill
					icon="pricetag"
					color={offerColor}
					label="Har erbjudande"
				/>
			) : null}
		</View>
	);
}
