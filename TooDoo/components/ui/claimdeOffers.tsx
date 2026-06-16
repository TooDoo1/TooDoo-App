import { Animated, Dimensions, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useState, useCallback, useEffect, useRef } from 'react';
import QRCodeSVG from 'react-native-qrcode-svg';
import { useThemePreference } from '@/context/theme-preference-context';
import { uiTheme } from '@/lib/ui-theme';
import { CardMedia } from '@/components/ui/card-media';
import { IMAGE_DISPLAY_WIDTH } from '@/lib/image-url';
import { getRedeemCountdown } from '@/lib/order-claim-window';

export type ClaimedOfferItem = {
	id: string;
	title: string;
	descriptionText?: string;
	businessName?: string;
	imageUri?: string;
	priceText?: string;
	originalPriceText?: string;
	claimedAtText?: string;
	statusText?: string;
	expiresAt?: string;
	code?: string;
	onOpen?: () => void;
};

type Props = {
	items: ClaimedOfferItem[];
	/**
	 * When this component is rendered inside another scroll container,
	 * we can disable its own scroll so the parent handles gestures.
	 */
	scrollEnabled?: boolean;
};

const CONFETTI_COUNT = 40;
// Global accent remap:
// - "blue" -> star pink
// - "orange/yellow" -> star green
const CONFETTI_COLORS = ['#ff3b30', '#EBBBD0', '#BADBC2', '#BADBC2', '#af52de', '#BADBC2', '#BADBC2'];
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export function ConfettiAnimation({ onDone }: { onDone: () => void }) {
	const pieces = useRef(
		Array.from({ length: CONFETTI_COUNT }, () => ({
			x: Math.random() * SCREEN_WIDTH,
			delay: Math.random() * 600,
			duration: 2000 + Math.random() * 1500,
			size: 6 + Math.random() * 8,
			color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
			drift: (Math.random() - 0.5) * 120,
			spin: Math.random() * 720,
			anim: new Animated.Value(0),
		}))
	).current;

	useEffect(() => {
		const animations = pieces.map((p) =>
			Animated.sequence([
				Animated.delay(p.delay),
				Animated.timing(p.anim, {
					toValue: 1,
					duration: p.duration,
					useNativeDriver: true,
				}),
			])
		);

		Animated.parallel(animations).start(() => onDone());
	}, []);

	return (
		<View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
			{pieces.map((p, i) => {
				const translateY = p.anim.interpolate({
					inputRange: [0, 1],
					outputRange: [-20, SCREEN_HEIGHT + 20],
				});
				const translateX = p.anim.interpolate({
					inputRange: [0, 0.5, 1],
					outputRange: [0, p.drift, p.drift * 0.6],
				});
				const rotate = p.anim.interpolate({
					inputRange: [0, 1],
					outputRange: ['0deg', `${p.spin}deg`],
				});
				const opacity = p.anim.interpolate({
					inputRange: [0, 0.1, 0.8, 1],
					outputRange: [0, 1, 1, 0],
				});

				return (
					<Animated.View
						key={i}
						style={{
							position: 'absolute',
							left: p.x,
							top: 0,
							width: p.size,
							height: p.size * 1.4,
							borderRadius: 2,
							backgroundColor: p.color,
							transform: [{ translateY }, { translateX }, { rotate }],
							opacity,
						}}
					/>
				);
			})}
		</View>
	);
}

export default function ClaimedOffers({ items, scrollEnabled = true }: Props) {
	const { mode } = useThemePreference();
	const theme = uiTheme(mode);
	const [selectedItem, setSelectedItem] = useState<ClaimedOfferItem | null>(null);
	const [modalVisible, setModalVisible] = useState(false);
	const [nowMs, setNowMs] = useState(Date.now());

	const handleItemPress = useCallback((item: ClaimedOfferItem) => {
		setSelectedItem(item);
		setModalVisible(true);
	}, []);

	useEffect(() => {
		const timer = setInterval(() => {
			setNowMs(Date.now());
		}, 1000);

		return () => clearInterval(timer);
	}, []);

	const formatRemaining = (milliseconds: number) => {
		const totalSeconds = Math.max(Math.floor(milliseconds / 1000), 0);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		return [hours, minutes, seconds].map((value) => value.toString().padStart(2, '0')).join(':');
	};

	const getItemCountdown = (item: ClaimedOfferItem) =>
		getRedeemCountdown(undefined, item.expiresAt, nowMs);

	const renderCountdownBadge = (item: ClaimedOfferItem) => {
		if (!item.expiresAt) return null;

		const { remainingMs, state } = getItemCountdown(item);
		if (state === 'expired' || remainingMs <= 0) return null;

		return (
			<View
				className="mb-1 rounded-full border px-2 py-1"
				style={{
					backgroundColor: theme.isDark ? 'rgba(0,0,0,0.7)' : 'rgba(10,21,53,0.06)',
					borderColor: theme.isDark ? 'rgba(255,255,255,0.20)' : theme.border,
				}}
			>
				<Text className="text-[10px] font-medium" style={{ color: theme.text }}>
					{formatRemaining(remainingMs)}
				</Text>
			</View>
		);
	};

	const getShortDescription = (value?: string) => {
		if (!value) return undefined;
		const firstLine = value
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find((line) => line.length > 0);
		return firstLine;
	};

	const activeItems = items.filter((item) => {
		if (!item.expiresAt) return true;
		const { remainingMs, state } = getItemCountdown(item);
		return state !== 'expired' && remainingMs > 0;
	});

	if (activeItems.length === 0) {
		return (
			<View className="mt-6 rounded-2xl px-4 py-5" style={{ backgroundColor: theme.cardBg }}>
				<Text className="text-center" style={{ color: theme.textMuted }}>
					Du har inga aktiva erbjudanden just nu.
				</Text>
			</View>
		);
	}

	return (
		<>
			{scrollEnabled ? (
				<ScrollView className="mt-6" contentContainerStyle={{ paddingBottom: 24 }}>
					{activeItems.map((item, idx) => (
						<Pressable
							key={item.id}
							className="rounded-2xl px-4 py-4"
							style={{
								backgroundColor: theme.cardBg,
								marginBottom: idx === activeItems.length - 1 ? 0 : 12,
							}}
							onPress={() => handleItemPress(item)}
						>
							<View className="flex-row items-start gap-3">
								<View
									className="relative h-28 w-28 overflow-hidden rounded-xl mt-1 items-center justify-center"
									style={{ backgroundColor: theme.cardBgMuted }}
								>
									{item.code ? (
										<View className="h-full w-full items-center justify-center bg-white p-1">
											<QRCodeSVG
												value={item.code}
												size={100}
												color="#000000"
												backgroundColor="#ffffff"
											/>
										</View>
									) : (
										<CardMedia
											source={{ uri: item.imageUri ?? `https://picsum.photos/seed/${encodeURIComponent(item.id)}/240/240` }}
											rasterResizeMode="cover"
											svgFit="contain"
											priority="low"
											displayWidth={IMAGE_DISPLAY_WIDTH.thumb}
										/>
									)}
								</View>

								<View className="flex-1 min-w-0">
									<View className="flex-row items-start justify-between gap-3">
										<View className="flex-1 min-w-0">
											{getShortDescription(item.descriptionText) ? (
												<Text className="text-lg font-semibold" style={{ color: theme.text }} numberOfLines={2}>
													{getShortDescription(item.descriptionText)}
												</Text>
											) : null}
											<Text className="mt-1" style={{ color: theme.textMuted }} numberOfLines={1}>
												{item.title}
											</Text>
										</View>
										<View className="w-24 items-end">
											{renderCountdownBadge(item)}
											<Text className="text-xs text-right" style={{ color: theme.textFaint }}>
												{item.statusText ?? 'Claimad'}
											</Text>
										</View>
									</View>
									<View className="mt-3 flex-row items-center gap-2">
										<Text style={{ color: theme.text }}>{item.priceText ?? '-'}</Text>
										{item.originalPriceText ? (
											<Text style={{ color: '#6c9ef5' }} className="line-through">
												{item.originalPriceText}
											</Text>
										) : null}
									</View>
									{item.claimedAtText ? (
										<Text className="mt-2 text-xs" style={{ color: theme.textFaint }}>
											Claimad: {item.claimedAtText}
										</Text>
									) : null}
								</View>
							</View>
						</Pressable>
					))}
				</ScrollView>
			) : (
				<View className="mt-6" style={{ paddingBottom: 24 }}>
					{activeItems.map((item, idx) => (
						<Pressable
							key={item.id}
							className="rounded-2xl px-4 py-4"
							style={{
								backgroundColor: theme.cardBg,
								marginBottom: idx === activeItems.length - 1 ? 0 : 12,
							}}
							onPress={() => handleItemPress(item)}
						>
							<View className="flex-row items-start gap-3">
								<View
									className="relative h-28 w-28 overflow-hidden rounded-xl mt-1 items-center justify-center"
									style={{ backgroundColor: theme.cardBgMuted }}
								>
									{item.code ? (
										<View className="h-full w-full items-center justify-center bg-white p-1">
											<QRCodeSVG
												value={item.code}
												size={100}
												color="#000000"
												backgroundColor="#ffffff"
											/>
										</View>
									) : (
										<CardMedia
											source={{ uri: item.imageUri ?? `https://picsum.photos/seed/${encodeURIComponent(item.id)}/240/240` }}
											rasterResizeMode="cover"
											svgFit="contain"
											priority="low"
											displayWidth={IMAGE_DISPLAY_WIDTH.thumb}
										/>
									)}
								</View>

								<View className="flex-1 min-w-0">
									<View className="flex-row items-start justify-between gap-3">
										<View className="flex-1 min-w-0">
											{getShortDescription(item.descriptionText) ? (
												<Text className="text-lg font-semibold" style={{ color: theme.text }} numberOfLines={2}>
													{getShortDescription(item.descriptionText)}
												</Text>
											) : null}
											<Text className="mt-1" style={{ color: theme.textMuted }} numberOfLines={1}>
												{item.title}
											</Text>
										</View>
										<View className="w-24 items-end">
											{renderCountdownBadge(item)}
											<Text className="text-xs text-right" style={{ color: theme.textFaint }}>
												{item.statusText ?? 'Claimad'}
											</Text>
										</View>
									</View>
									<View className="mt-3 flex-row items-center gap-2">
										<Text style={{ color: theme.text }}>{item.priceText ?? '-'}</Text>
										{item.originalPriceText ? (
											<Text style={{ color: '#6c9ef5' }} className="line-through">
												{item.originalPriceText}
											</Text>
										) : null}
									</View>
									{item.claimedAtText ? (
										<Text className="mt-2 text-xs" style={{ color: theme.textFaint }}>
											Claimad: {item.claimedAtText}
										</Text>
									) : null}
								</View>
							</View>
						</Pressable>
					))}
				</View>
			)}

			<Modal
				visible={modalVisible}
				transparent
				animationType="fade"
				onRequestClose={() => setModalVisible(false)}
			>
				<View
					className="flex-1 items-center justify-center p-4"
					style={{ backgroundColor: theme.isDark ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.35)' }}
				>
					<View className="rounded-2xl p-6 max-w-sm w-full" style={{ backgroundColor: theme.cardBg }}>
						<ScrollView showsVerticalScrollIndicator={false}>
							{selectedItem && (
								<>
									<View
										className="w-full aspect-square overflow-hidden rounded-xl mb-6"
										style={{ backgroundColor: theme.cardBgMuted }}
									>
										{selectedItem.code ? (
											<View className="h-full w-full items-center justify-center bg-white p-3">
												<QRCodeSVG
													value={selectedItem.code}
													size={240}
													color="#000000"
													backgroundColor="#ffffff"
												/>
											</View>
										) : (
											<CardMedia
												source={{
													uri:
														selectedItem.imageUri ??
														`https://picsum.photos/seed/${encodeURIComponent(selectedItem.id)}/240/240`,
												}}
												rasterResizeMode="cover"
												svgFit="contain"
												priority="high"
												displayWidth={IMAGE_DISPLAY_WIDTH.cardWide}
												lazy={false}
											/>
										)}
									</View>

									<Text className="text-xl font-semibold mb-4" style={{ color: theme.text }}>
										{selectedItem.title}
									</Text>

									{selectedItem.code ? (
										<View className="rounded-lg p-4 mb-6" style={{ backgroundColor: theme.cardBgMuted }}>
											<Text className="text-xs mb-2" style={{ color: theme.textMuted }}>
												Kod:
											</Text>
											<Text className="text-2xl font-bold tracking-widest mb-4" style={{ color: theme.text }}>
												{selectedItem.code}
											</Text>
										</View>
									) : null}

									<Pressable
										className="bg-[#ff3b30] rounded-lg py-3 mt-4"
										onPress={() => setModalVisible(false)}
									>
										<Text className="text-white text-center font-semibold">Stäng</Text>
									</Pressable>
								</>
							)}
						</ScrollView>
					</View>
				</View>
			</Modal>
		</>
	);
}
