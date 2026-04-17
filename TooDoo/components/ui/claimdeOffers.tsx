import { Animated, Dimensions, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useState, useCallback, useEffect, useRef } from 'react';
import QRCodeSVG from 'react-native-qrcode-svg';

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
};

const CONFETTI_COUNT = 40;
const CONFETTI_COLORS = ['#ff3b30', '#007AFF', '#34c759', '#ffcc00', '#af52de', '#ff9500', '#00c7be'];
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

export default function ClaimedOffers({ items }: Props) {
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
		const expiresAtMs = new Date(item.expiresAt).getTime();
		if (!Number.isFinite(expiresAtMs)) return true;
		return expiresAtMs > nowMs;
	});

	if (activeItems.length === 0) {
		return (
			<View className="mt-6 rounded-2xl bg-[#0a1535] px-4 py-5">
				<Text className="text-center text-white/70">Du har inga aktiva erbjudanden just nu.</Text>
			</View>
		);
	}

	return (
		<>
			<ScrollView className="mt-6" contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
				{activeItems.map((item) => (
					<Pressable
						key={item.id}
						className="rounded-2xl bg-[#0a1535] px-4 py-4"
						onPress={() => handleItemPress(item)}
					>
						<View className="flex-row items-start gap-3">
							<View className="relative h-28 w-28 overflow-hidden rounded-xl mt-1 bg-[#12214d] items-center justify-center">
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
									<Image
										source={{ uri: item.imageUri ?? `https://picsum.photos/seed/${encodeURIComponent(item.id)}/240/240` }}
										className="h-full w-full"
										resizeMode="cover"
									/>
								)}
							</View>

							<View className="flex-1 min-w-0">
								<View className="flex-row items-start justify-between gap-3">
									<View className="flex-1 min-w-0">
										{getShortDescription(item.descriptionText) ? (
												<Text className="text-lg font-semibold text-white" numberOfLines={2}>
												{getShortDescription(item.descriptionText)}
											</Text>
										) : null}
											<Text className="mt-1 text-white/70" numberOfLines={1}>
												{item.title}
											</Text>
									</View>
									<View className="w-24 items-end">
										{item.expiresAt ? (
											(() => {
												const expiresAtMs = new Date(item.expiresAt as string).getTime();
												if (!Number.isFinite(expiresAtMs)) return null;
												const remainingMs = expiresAtMs - nowMs;
												return (
													<View className="mb-1 rounded-full border border-white/20 bg-black/70 px-2 py-1">
														<Text className="text-[10px] font-medium text-white">{formatRemaining(remainingMs)}</Text>
													</View>
												);
											})()
										) : null}
										<Text className="text-xs text-white/60 text-right">{item.statusText ?? 'Claimad'}</Text>
									</View>
								</View>
								<View className="mt-3 flex-row items-center gap-2">
									<Text className="text-white/90">{item.priceText ?? '-'}</Text>
									{item.originalPriceText ? (
										<Text className="text-blue-300 line-through">{item.originalPriceText}</Text>
									) : null}
								</View>
								{item.claimedAtText ? (
									<Text className="mt-2 text-xs text-white/50">Claimad: {item.claimedAtText}</Text>
								) : null}
							</View>
						</View>
					</Pressable>
				))}
			</ScrollView>

			<Modal
				visible={modalVisible}
				transparent
				animationType="fade"
				onRequestClose={() => setModalVisible(false)}
			>
				<View className="flex-1 bg-black/80 items-center justify-center p-4">
					<View className="bg-[#0a1535] rounded-2xl p-6 max-w-sm w-full max-h-[90%]">
						<ScrollView showsVerticalScrollIndicator={false}>
							{selectedItem && (
								<>
									<View className="w-full aspect-square overflow-hidden rounded-xl bg-[#12214d] mb-6">
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
											<Image
												source={{
													uri:
														selectedItem.imageUri ??
														`https://picsum.photos/seed/${encodeURIComponent(selectedItem.id)}/240/240`,
												}}
												className="h-full w-full"
												resizeMode="cover"
											/>
										)}
									</View>

									<Text className="text-xl font-semibold text-white mb-4">{selectedItem.title}</Text>

									{selectedItem.code ? (
										<View className="bg-[#12214d] rounded-lg p-4 mb-6">
											<Text className="text-white/60 text-xs mb-2">Kod:</Text>
											<Text className="text-white text-2xl font-bold tracking-widest mb-4">
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
