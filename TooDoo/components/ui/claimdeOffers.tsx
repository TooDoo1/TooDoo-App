import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useState, useCallback } from 'react';
import QRCodeSVG from 'react-native-qrcode-svg';

export type ClaimedOfferItem = {
	id: string;
	title: string;
	businessName?: string;
	imageUri?: string;
	priceText?: string;
	claimedAtText?: string;
	statusText?: string;
	code?: string;
	onOpen?: () => void;
};

type Props = {
	items: ClaimedOfferItem[];
};

export default function ClaimedOffers({ items }: Props) {
	const [selectedItem, setSelectedItem] = useState<ClaimedOfferItem | null>(null);
	const [modalVisible, setModalVisible] = useState(false);

	const handleItemPress = useCallback((item: ClaimedOfferItem) => {
		setSelectedItem(item);
		setModalVisible(true);
	}, []);

	if (items.length === 0) {
		return (
			<View className="mt-6 rounded-2xl bg-[#0a1535] px-4 py-5">
				<Text className="text-center text-white/70">Du har inte claimat några erbjudanden ännu.</Text>
			</View>
		);
	}

	return (
		<>
			<ScrollView className="mt-6" contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
				{items.map((item) => (
					<Pressable
						key={item.id}
						className="rounded-2xl bg-[#0a1535] px-4 py-4"
						onPress={() => handleItemPress(item)}
					>
						<View className="flex-row items-start gap-3">
							<View className="h-28 w-28 overflow-hidden rounded-xl mt-1 bg-[#12214d] items-center justify-center">
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

							<View className="flex-1">
								<Text className="text-lg font-semibold text-white" numberOfLines={2}>
									{item.title}
								</Text>
								{item.businessName ? (
									<Text className="mt-1 text-white/70" numberOfLines={1}>
										{item.businessName}
									</Text>
								) : null}
								<View className="mt-3 flex-row items-center justify-between">
									<Text className="text-white/90">{item.priceText ?? '-'}</Text>
									<Text className="text-xs text-white/60">{item.statusText ?? 'Claimad'}</Text>
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
