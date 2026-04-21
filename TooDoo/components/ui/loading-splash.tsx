import { useEffect } from 'react';
import { Dimensions, Image, StyleSheet, Text, View } from 'react-native';
import Animated, {
	cancelAnimation,
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withRepeat,
	withSequence,
	withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

const logoSrc = require('../../assets/images/TooDoo.jpg');
const { height: SCREEN_H } = Dimensions.get('window');

const LOGO_SIZE = 180;
const LAMP_OFF_OPACITY = 0;

const STRING_GAP_ABOVE_LOGO = 110;
const STRING_LENGTH = Math.max(SCREEN_H / 2 - LOGO_SIZE / 2 - STRING_GAP_ABOVE_LOGO, 120);
const STRING_WIDTH = 2;
const BEAD_SIZE = 14;
const PULL_DISTANCE = 48;

const STRING_DROP_MS = 320;
const PULL_WAIT_MS = 160;
const PULL_DOWN_MS = 130;
const PULL_UP_MS = 180;
const FLICKER_START_MS = 0;

type FlickerStep = { to: number; duration: number; easing?: (v: number) => number };

const FLICKER_SEQUENCE: FlickerStep[] = [
	{ to: 0.25, duration: 32, easing: Easing.in(Easing.quad) },
	{ to: 0.0, duration: 28, easing: Easing.out(Easing.quad) },
	{ to: 0.0, duration: 85 },
	{ to: 0.6, duration: 24, easing: Easing.in(Easing.cubic) },
	{ to: 0.04, duration: 28, easing: Easing.out(Easing.cubic) },
	{ to: 0.04, duration: 70 },
	{ to: 0.8, duration: 22, easing: Easing.in(Easing.cubic) },
	{ to: 0.1, duration: 26, easing: Easing.out(Easing.cubic) },
	{ to: 0.45, duration: 40 },
	{ to: 0.18, duration: 38 },
	{ to: 0.7, duration: 42 },
	{ to: 0.3, duration: 38 },
	{ to: 0.95, duration: 50 },
	{ to: 0.55, duration: 40 },
	{ to: 1.1, duration: 110, easing: Easing.out(Easing.cubic) },
	{ to: 0.92, duration: 80, easing: Easing.inOut(Easing.quad) },
	{ to: 1.0, duration: 130, easing: Easing.out(Easing.quad) },
];

const FLUTTER_SEQUENCE: FlickerStep[] = [
	{ to: 0.97, duration: 110, easing: Easing.inOut(Easing.sin) },
	{ to: 1.0, duration: 130, easing: Easing.inOut(Easing.sin) },
	{ to: 0.985, duration: 180, easing: Easing.inOut(Easing.sin) },
	{ to: 1.0, duration: 220, easing: Easing.inOut(Easing.sin) },
	{ to: 0.94, duration: 60, easing: Easing.in(Easing.quad) },
	{ to: 1.0, duration: 80, easing: Easing.out(Easing.quad) },
	{ to: 0.99, duration: 260, easing: Easing.inOut(Easing.sin) },
	{ to: 1.0, duration: 320, easing: Easing.inOut(Easing.sin) },
];

type SparkleSpec = {
	x: number;
	y: number;
	size: number;
	delay: number;
};

const SPARKLES: SparkleSpec[] = [
	{ x: -105, y: -115, size: 14, delay: 0 },
	{ x: 110, y: -100, size: 17, delay: 90 },
	{ x: -128, y: 55, size: 12, delay: 170 },
	{ x: 122, y: 40, size: 14, delay: 50 },
	{ x: -82, y: 125, size: 15, delay: 230 },
	{ x: 92, y: 130, size: 16, delay: 140 },
	{ x: 18, y: -135, size: 12, delay: 30 },
	{ x: -28, y: 150, size: 14, delay: 200 },
];

const buildSparklePath = (size: number) => {
	const outer = size / 2;
	const inner = size / 7;
	return `M 0,-${outer} L ${inner},-${inner} L ${outer},0 L ${inner},${inner} L 0,${outer} L -${inner},${inner} L -${outer},0 L -${inner},-${inner} Z`;
};

function Sparkle({ x, y, size, delay }: SparkleSpec) {
	const opacity = useSharedValue(0);
	const scale = useSharedValue(0);
	const rotate = useSharedValue(0);

	useEffect(() => {
		const fullDelay = FLICKER_START_MS + delay;

		opacity.value = withDelay(
			fullDelay,
			withSequence(
				withTiming(1, { duration: 120 }),
				withTiming(0.3, { duration: 80 }),
				withTiming(1, { duration: 70 }),
				withRepeat(
					withSequence(
						withTiming(0.4, { duration: 380 }),
						withTiming(1, { duration: 380 })
					),
					3,
					true
				),
				withTiming(0, { duration: 300 })
			)
		);
		scale.value = withDelay(
			fullDelay,
			withSequence(
				withTiming(1.25, { duration: 180, easing: Easing.out(Easing.cubic) }),
				withTiming(0.9, { duration: 160 }),
				withTiming(1, { duration: 1200 }),
				withTiming(0, { duration: 320 })
			)
		);
		rotate.value = withDelay(fullDelay, withTiming(60, { duration: 1800 }));
	}, [delay, opacity, scale, rotate]);

	const style = useAnimatedStyle(() => ({
		opacity: opacity.value,
		transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
	}));

	return (
		<Animated.View
			pointerEvents="none"
			style={[
				{
					position: 'absolute',
					left: '50%',
					top: '50%',
					marginLeft: x - size / 2,
					marginTop: y - size / 2,
					width: size,
					height: size,
				},
				style,
			]}
		>
			<Svg width={size} height={size} viewBox={`-${size / 2} -${size / 2} ${size} ${size}`}>
				<Path d={buildSparklePath(size)} fill="#fff8cc" />
			</Svg>
		</Animated.View>
	);
}

export const SPLASH_EXIT_DURATION_MS = 380;

export default function LoadingSplash({ isExiting = false }: { isExiting?: boolean }) {
	const lampLevel = useSharedValue(0);
	const stringProgress = useSharedValue(0);
	const pullProgress = useSharedValue(0);
	const exitProgress = useSharedValue(0);

	useEffect(() => {
		stringProgress.value = withTiming(1, {
			duration: STRING_DROP_MS,
			easing: Easing.out(Easing.cubic),
		});

		pullProgress.value = withDelay(
			STRING_DROP_MS + PULL_WAIT_MS,
			withSequence(
				withTiming(1, { duration: PULL_DOWN_MS, easing: Easing.in(Easing.quad) }),
				withTiming(0, { duration: PULL_UP_MS, easing: Easing.out(Easing.quad) })
			)
		);

		const struggleTimings = FLICKER_SEQUENCE.map((step) =>
			withTiming(step.to, {
				duration: step.duration,
				easing: step.easing ?? Easing.linear,
			})
		);

		const flutterTimings = FLUTTER_SEQUENCE.map((step) =>
			withTiming(step.to, {
				duration: step.duration,
				easing: step.easing ?? Easing.inOut(Easing.sin),
			})
		);

		lampLevel.value = withDelay(
			FLICKER_START_MS,
			withSequence(
				...struggleTimings,
				withRepeat(withSequence(...flutterTimings), -1, false)
			)
		);
	}, [lampLevel, stringProgress, pullProgress]);

	useEffect(() => {
		if (!isExiting) {
			return;
		}

		cancelAnimation(lampLevel);
		exitProgress.value = withTiming(1, {
			duration: SPLASH_EXIT_DURATION_MS,
			easing: Easing.out(Easing.quad),
		});
	}, [isExiting, exitProgress, lampLevel]);

	const stringStyle = useAnimatedStyle(() => ({
		height: STRING_LENGTH * stringProgress.value + PULL_DISTANCE * pullProgress.value,
		opacity: stringProgress.value,
	}));

	const beadStyle = useAnimatedStyle(() => ({
		opacity: stringProgress.value,
		transform: [{ scale: 0.85 + 0.15 * stringProgress.value }],
	}));

	const logoStyle = useAnimatedStyle(() => ({
		opacity: LAMP_OFF_OPACITY + lampLevel.value * (1 - LAMP_OFF_OPACITY),
	}));

	const wordmarkGlowStyle = useAnimatedStyle(() => ({
		textShadowRadius: 6 + lampLevel.value * 14,
		textShadowColor: `rgba(255, 236, 150, ${0.25 + lampLevel.value * 0.55})`,
	}));

	const containerStyle = useAnimatedStyle(() => ({
		opacity: 1 - exitProgress.value,
	}));

	return (
		<Animated.View style={[styles.container, containerStyle]}>
			<View style={styles.pullChain} pointerEvents="none">
				<Animated.View style={[styles.string, stringStyle]} />
				<Animated.View style={[styles.bead, beadStyle]} />
			</View>

			{SPARKLES.map((spec, idx) => (
				<Sparkle key={`sparkle-${idx}`} {...spec} />
			))}

			<Animated.View style={[styles.logoColumn, logoStyle]}>
				<View style={styles.logoClip}>
					<Image
						source={logoSrc}
						style={styles.logoImage}
						resizeMode="cover"
						fadeDuration={0}
					/>
				</View>
				<Animated.Text style={[styles.wordmark, wordmarkGlowStyle]}>
					TooDoo
				</Animated.Text>
			</Animated.View>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#000b2a',
		justifyContent: 'center',
		alignItems: 'center',
	},
	pullChain: {
		position: 'absolute',
		top: 0,
		left: '72%',
		marginLeft: -BEAD_SIZE / 2,
		width: BEAD_SIZE,
		alignItems: 'center',
	},
	string: {
		width: STRING_WIDTH,
		backgroundColor: '#e8e2c7',
		borderRadius: STRING_WIDTH / 2,
	},
	bead: {
		width: BEAD_SIZE,
		height: BEAD_SIZE,
		borderRadius: BEAD_SIZE / 2,
		backgroundColor: '#f5ecbd',
		marginTop: -1,
	},
	logoClip: {
		width: LOGO_SIZE,
		height: LOGO_SIZE,
		borderRadius: 36,
		overflow: 'hidden',
	},
	logoImage: {
		width: LOGO_SIZE,
		height: LOGO_SIZE,
	},
	logoColumn: {
		alignItems: 'center',
	},
	wordmark: {
		marginTop: 18,
		color: '#fff8cc',
		fontSize: 36,
		fontWeight: '700',
		letterSpacing: 2,
		textShadowColor: 'rgba(255, 236, 150, 0.6)',
		textShadowOffset: { width: 0, height: 0 },
		textShadowRadius: 12,
	},
});
