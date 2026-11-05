import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuth } from '@/context/auth-context';
import { useRealtimeSubscription } from '@/hooks/use-realtime-subscription';
import ClaimedOffers, { ConfettiAnimation, type ClaimedOfferItem } from '@/components/ui/claimdeOffers';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { apiUrl, normalizeImageUrl } from '@/lib/api';
import { StarrySkyScreenBackground } from '@/components/ui/starry-background';
import { useThemePreference } from '@/context/theme-preference-context';
import { brandInkRgba } from '@/lib/brand-colors';
import { TAB_ACTIVE_COLORS } from '@/lib/tab-colors';
import { uiTheme } from '@/lib/ui-theme';
import { getRedeemCountdown } from '@/lib/order-claim-window';
import { HOME_PAGE_PAD } from '@/components/home/home-feed';

type ApiOrder = {
	id?: string;
	_id?: string;
	title?: string;
	price?: number;
	orderTimeTo?: string;
	orderTimeFrom?: string;
	validFrom?: string;
	validTo?: string;
	imageSourceType?: string;
	imageUrl?: string;
	businessId?: string | { id?: string; _id?: string; name?: string };
};

type ApiBusiness = {
	id?: string;
	_id?: string;
	name?: string;
};

type ApiClaim = {
	id?: string;
	_id?: string;
	code?: string;
	qrCode?:
		| string
		| {
			id?: string;
			code?: string;
			expiresAt?: string;
			orderId?:
				| string
				| {
					id?: string;
					_id?: string;
					title?: string;
					description?: string;
					price?: number;
					originalPrice?: number;
					orderTimeFrom?: string;
					orderTimeTo?: string;
					validFrom?: string;
					validTo?: string;
					businessId?: string | { id?: string; _id?: string; name?: string };
				};
			order?: {
				id?: string;
				_id?: string;
				title?: string;
				description?: string;
				price?: number;
				originalPrice?: number;
				orderTimeFrom?: string;
				orderTimeTo?: string;
				validFrom?: string;
				validTo?: string;
				businessId?: string | { id?: string; _id?: string; name?: string };
			};
			createdAt?: string;
		};
	orderId?:
		| string
		| {
			id?: string;
			_id?: string;
			title?: string;
			description?: string;
			price?: number;
			originalPrice?: number;
			orderTimeFrom?: string;
			orderTimeTo?: string;
			validFrom?: string;
			validTo?: string;
			businessId?: string | { id?: string; _id?: string; name?: string };
		};
	order?: {
		id?: string;
		_id?: string;
		title?: string;
		description?: string;
		price?: number;
		originalPrice?: number;
		orderTimeFrom?: string;
		orderTimeTo?: string;
		validFrom?: string;
		validTo?: string;
		businessId?: string | { id?: string; _id?: string; name?: string };
	};
	qr?: { code?: string };
	qrCodeId?: { code?: string };
	expiresAt?: string;
	createdAt?: string;
	status?: string;
};

const decodeJwtPayload = (token: string) => {
	try {
		const payload = token.split('.')[1];
		if (!payload) return null;
		const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
		const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
		const json = globalThis.atob ? globalThis.atob(padded) : '';
		return json ? JSON.parse(json) : null;
	} catch {
		return null;
	}
};

export default function MinaDealsScreen() {
	const [isLoadingClaims, setIsLoadingClaims] = useState(true);
	const [claimedOffers, setClaimedOffers] = useState<ClaimedOfferItem[]>([]);
	const [showCelebration, setShowCelebration] = useState(false);
	const [celebrationTitle, setCelebrationTitle] = useState('');
	const prevClaimIdsRef = useRef<Set<string>>(new Set());
	const prevClaimsRef = useRef<ClaimedOfferItem[]>([]);
	const hasLoadedOnce = useRef(false);
	const [scannerOpen, setScannerOpen] = useState(false);
	const [scanned, setScanned] = useState(false);
	const [hasWorkerAccess, setHasWorkerAccess] = useState(false);
	const [manualCode, setManualCode] = useState('');
	const [isValidating, setIsValidating] = useState(false);
	const [claimsRealtimeNonce, setClaimsRealtimeNonce] = useState(0);
	const [cameraPermission, requestCameraPermission] = useCameraPermissions();
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { isLoggedIn, token } = useAuth();
	const { mode } = useThemePreference();
	const theme = uiTheme(mode);
	const visibleOffers = isLoggedIn ? claimedOffers : [];
	const offersAccent = TAB_ACTIVE_COLORS.MinaDeals;

	useRealtimeSubscription(
		() => {
			setClaimsRealtimeNonce((nonce) => nonce + 1);
		},
		{
			enabled: isLoggedIn,
			filter: (event) => event.type === 'order.updated',
		}
	);

	useEffect(() => {
		if (!isLoggedIn || !token) {
			setHasWorkerAccess(false);
			return;
		}

		let cancelled = false;
		(async () => {
			try {
				const res = await fetch(apiUrl('/user/me'), {
					headers: { Authorization: `Bearer ${token}` },
				});
				const user = await res.json().catch(() => ({}));
				if (!cancelled) {
					setHasWorkerAccess(Boolean(user.businessId));
				}
			} catch {
				if (!cancelled) setHasWorkerAccess(false);
			}
		})();

		return () => { cancelled = true; };
	}, [isLoggedIn, token]);

	const handleBarCodeScanned = useCallback(async ({ data }: { data: string }) => {
		if (scanned) return;
		setScanned(true);

		try {
			const res = await fetch(apiUrl('/claim/validate'), {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ qrCode: data }),
			});

			const json = await res.json().catch(() => ({}));

			if (res.ok && json.ok) {
				const orderTitle = json.order?.title ?? 'Erbjudande';
				const userName = json.user?.name ?? json.user?.email ?? '';
				Alert.alert(
					'Godkänd',
					`"${orderTitle}" har lösts in.${userName ? `\nKund: ${userName}` : ''}`,
					[{ text: 'OK', onPress: () => { setScanned(false); setScannerOpen(false); } }],
				);
			} else {
				Alert.alert('Ogiltig', json.reason ?? json.error ?? 'QR-koden kunde inte valideras.', [
					{ text: 'Försök igen', onPress: () => setScanned(false) },
					{ text: 'Stäng', onPress: () => { setScanned(false); setScannerOpen(false); } },
				]);
			}
		} catch {
			Alert.alert('Nätverksfel', 'Kunde inte ansluta till servern.', [
				{ text: 'Försök igen', onPress: () => setScanned(false) },
				{ text: 'Stäng', onPress: () => { setScanned(false); setScannerOpen(false); } },
			]);
		}
	}, [scanned, token]);

	const activeClaimCount = useMemo(() => {
		if (!isLoggedIn) {
			return 0;
		}

		return visibleOffers.filter((item) => {
			const { remainingMs, state } = getRedeemCountdown(undefined, item.expiresAt);
			return state !== 'expired' && remainingMs > 0;
		}).length;
	}, [isLoggedIn, visibleOffers]);

	const loadClaimedOffers = async (cancelledRef: { cancelled: boolean }) => {
		if (!isLoggedIn || !token) {
			setClaimedOffers([]);
			return;
		}

		if (!hasLoadedOnce.current) {
			setIsLoadingClaims(true);
		}
		try {
			const claimsRes = await fetch(apiUrl('/user/me/claims'), {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			});

			const claimsJson = await claimsRes.json().catch(() => ({}));
			const claimsRaw: ApiClaim[] = Array.isArray(claimsJson)
				? claimsJson
				: Array.isArray(claimsJson?.claims)
					? claimsJson.claims
					: Array.isArray(claimsJson?.data)
						? claimsJson.data
						: Array.isArray(claimsJson?.data?.claims)
							? claimsJson.data.claims
							: [];

			if (!claimsRes.ok) {
				throw new Error('Unable to load claims');
			}

			const mapped: ClaimedOfferItem[] = claimsRaw.map((claim, index) => {
				const qrCodeObject = typeof claim.qrCode === 'object' ? claim.qrCode : undefined;
				const embeddedOrder =
					claim.order ??
					(typeof claim.orderId === 'object' ? claim.orderId : undefined) ??
					qrCodeObject?.order ??
					(typeof qrCodeObject?.orderId === 'object' ? qrCodeObject.orderId : undefined);

				const orderId =
					typeof claim.orderId === 'string'
						? claim.orderId
						: embeddedOrder?.id ??
							embeddedOrder?._id ??
							(typeof qrCodeObject?.orderId === 'string' ? qrCodeObject.orderId : undefined);

				const businessName =
					typeof embeddedOrder?.businessId === 'object'
						? embeddedOrder.businessId.name
						: undefined;
				const businessId =
					typeof embeddedOrder?.businessId === 'string'
						? embeddedOrder.businessId
						: embeddedOrder?.businessId?.id ?? embeddedOrder?.businessId?._id;

				const qrExpiryValue = qrCodeObject?.expiresAt ?? claim.expiresAt;
				const redeemCountdown = getRedeemCountdown(undefined, qrExpiryValue);
				const statusRaw = String(claim.status ?? '').toLowerCase();
				const isStatusExpired =
					redeemCountdown.state === 'expired' ||
					statusRaw.includes('expired') ||
					statusRaw.includes('utgånget');

				const claimedAtValue = claim.createdAt ?? qrCodeObject?.createdAt;
				const claimedAt = claimedAtValue ? new Date(claimedAtValue) : undefined;
				const code =
					typeof claim.qrCode === 'string'
						? claim.qrCode
						: qrCodeObject?.code ?? claim.code ?? claim.qr?.code ?? claim.qrCodeId?.code;

				return {
					id: claim.id ?? claim._id ?? qrCodeObject?.id ?? orderId ?? `claim-${index}`,
					title: embeddedOrder?.title ?? 'Erbjudande',
					descriptionText: embeddedOrder?.description,
					businessName,
					imageUri:
						normalizeImageUrl(
							(embeddedOrder as any)?.imageUrl ??
								(embeddedOrder as any)?.imageAsset?.publicUrl ??
								(embeddedOrder as any)?.imageAsset?.url ??
								(embeddedOrder as any)?.image?.publicUrl ??
								(embeddedOrder as any)?.image?.url ??
								(claim as any)?.imageUrl ??
								(claim as any)?.imageAsset?.publicUrl ??
								(claim as any)?.imageAsset?.url ??
								(claim as any)?.image?.publicUrl ??
								(claim as any)?.image?.url
						) || `https://picsum.photos/seed/${encodeURIComponent(orderId ?? `claim-${index}`)}/240/240`,
					priceText: embeddedOrder?.price !== undefined ? `${embeddedOrder.price} kr` : undefined,
					originalPriceText: embeddedOrder?.originalPrice !== undefined ? `${embeddedOrder.originalPrice} kr` : undefined,
					claimedAtText: claimedAt && Number.isFinite(claimedAt.getTime()) ? claimedAt.toLocaleDateString('sv-SE') : undefined,
					expiresAt: qrExpiryValue,
					statusText: isStatusExpired ? 'Utgånget' : claim.status ?? 'Aktiv',
					code,
					onOpen: orderId
						? () => router.push({ pathname: '/company-detail', params: { returnTo: 'minadeals', claimOrderId: orderId, claimBusinessId: businessId ?? '', title: embeddedOrder?.title ?? 'Erbjudande', deal: '1' } })
						: undefined,
				};
			});

			mapped.sort((a, b) => {
				const aTime = a.claimedAtText ? new Date(a.claimedAtText).getTime() : 0;
				const bTime = b.claimedAtText ? new Date(b.claimedAtText).getTime() : 0;
				return bTime - aTime;
			});

			if (!cancelledRef.cancelled) {
				const newIds = new Set(mapped.map((m) => m.id));

				if (hasLoadedOnce.current && prevClaimIdsRef.current.size > 0) {
					for (const prevId of prevClaimIdsRef.current) {
						if (!newIds.has(prevId)) {
							const item = prevClaimsRef.current.find((c) => c.id === prevId);
							setCelebrationTitle(item?.title ?? 'Ditt erbjudande');
							setShowCelebration(true);
							break;
						}
					}
				}

				prevClaimIdsRef.current = newIds;
				prevClaimsRef.current = mapped;
				hasLoadedOnce.current = true;
				setClaimedOffers(mapped);
			}
		} catch {
			if (!cancelledRef.cancelled) {
				setClaimedOffers([]);
			}
		} finally {
			if (!cancelledRef.cancelled) {
				setIsLoadingClaims(false);
			}
		}
	};

	useEffect(() => {
		const cancelledRef = { cancelled: false };
		void loadClaimedOffers(cancelledRef);

		return () => {
			cancelledRef.cancelled = true;
		};
	}, [isLoggedIn, token, router, claimsRealtimeNonce]);

	useFocusEffect(
		useMemo(
			() => () => {
				const cancelledRef = { cancelled: false };
				void loadClaimedOffers(cancelledRef);

				const pollTimer = setInterval(() => {
					if (!cancelledRef.cancelled) {
						void loadClaimedOffers(cancelledRef);
					}
				}, 5000);

				return () => {
					cancelledRef.cancelled = true;
					clearInterval(pollTimer);
				};
			},
			[isLoggedIn, token, router]
		)
	);

	return (
		<View className="flex-1" style={{ backgroundColor: theme.screenBg }}>
			<StarrySkyScreenBackground variant={theme.isDark ? 'dark' : 'light'} />
			<ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 160 }}>
				<View
					style={{
						minHeight: '100%',
						paddingHorizontal: HOME_PAGE_PAD,
						paddingTop: Math.max(insets.top + 20, 72),
					}}
				>
				<View style={styles.hero}>
					<Ionicons name="ticket" size={26} color={offersAccent} />
					<View style={styles.heroCopy}>
						<View style={styles.titleRow}>
							<Text style={[styles.title, { color: theme.text }]}>Erbjudanden</Text>
							{isLoggedIn && activeClaimCount > 0 ? (
								<View
									style={[
										styles.countPill,
										{
											backgroundColor: brandInkRgba(theme.isDark ? 0.16 : 0.06),
											borderColor: theme.border,
										},
									]}
								>
									<Text style={[styles.countText, { color: theme.textMuted }]}>
										{activeClaimCount}
									</Text>
								</View>
							) : null}
						</View>
						<Text style={[styles.subtitle, { color: theme.textMuted }]}>
							{isLoggedIn
								? activeClaimCount > 0
									? 'Dina aktiva deals'
									: 'Claima deals för att se dem här'
								: 'Dina aktiva deals'}
						</Text>
					</View>
				</View>
				{isLoggedIn ? (
					<>
						{isLoadingClaims ? (
							<View className="mt-4 rounded-2xl px-4 py-6" style={{ backgroundColor: theme.cardBg }}>
								<LoadingSpinner label="Uppdaterar dina claimade erbjudanden..." />
							</View>
						) : visibleOffers.length === 0 ? (
							<View style={styles.emptyState}>
								<Ionicons
									name="ticket-outline"
									size={42}
									color={offersAccent}
									style={{ opacity: 0.85 }}
								/>
								<Text style={[styles.emptyTitle, { color: theme.text }]}>
									Inga erbjudanden ännu
								</Text>
								<Text style={[styles.emptyText, { color: theme.textMuted }]}>
									Claima deals ute i appen så dyker de upp här.
								</Text>
								<Pressable
									onPress={() => router.push('/')}
									style={({ pressed }) => [
										styles.ctaSolid,
										{ opacity: pressed ? 0.88 : 1 },
									]}
								>
									<Text style={styles.ctaSolidLabel}>Utforska</Text>
								</Pressable>
							</View>
						) : (
							<View style={{ marginTop: 18 }}>
								<ClaimedOffers items={visibleOffers} scrollEnabled={false} />
							</View>
						)}

						{hasWorkerAccess ? (
							<View className="mt-6 rounded-2xl px-4 py-5" style={{ backgroundColor: theme.cardBg }}>
								<Text className="text-lg font-semibold" style={{ color: theme.text }}>Validera kundernas QR-koder</Text>
								<Text className="mt-1 text-sm" style={{ color: theme.textMuted }}>Skanna eller skriv in kundens QR-kod.</Text>

								{!scannerOpen ? (
									<Pressable
										className="mt-4 rounded-2xl px-4 py-3"
										style={{ backgroundColor: theme.accentGreen }}
										onPress={async () => {
											if (!cameraPermission?.granted) {
												const result = await requestCameraPermission();
												if (!result.granted) {
													Alert.alert('Kamerabehörighet', 'Du behöver ge appen tillgång till kameran för att skanna QR-koder.');
													return;
												}
											}
											setScanned(false);
											setScannerOpen(true);
										}}
									>
										<Text className="text-center font-medium text-white">Öppna skanner</Text>
									</Pressable>
								) : (
									<View className="mt-4">
										<View className="h-72 overflow-hidden rounded-2xl">
											<CameraView
												style={{ flex: 1 }}
												facing="back"
												barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
												onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
											/>
										</View>
										<Pressable
											className="mt-3 rounded-2xl bg-white/10 px-4 py-3"
											onPress={() => { setScannerOpen(false); setScanned(false); }}
										>
											<Text className="text-center font-medium text-white">Stäng skanner</Text>
										</Pressable>
									</View>
								)}

								<View className="mt-4 border-t border-white/10 pt-4">
									<Text className="text-sm" style={{ color: theme.textMuted }}>Eller skriv in koden manuellt:</Text>
									<TextInput
										value={manualCode}
										onChangeText={setManualCode}
										placeholder="T.ex. 7K9D-M2Q8-TX4R"
										placeholderTextColor={theme.textFaint}
										autoCapitalize="characters"
										className="mt-2 rounded-2xl border px-4 py-3"
										style={{ borderColor: theme.border, backgroundColor: theme.cardBgMuted, color: theme.text }}
									/>
									<Pressable
										className="mt-2 rounded-2xl px-4 py-3"
										style={{
											backgroundColor:
												manualCode.trim() && !isValidating
													? theme.accentGreen
													: (theme.isDark ? 'rgba(255, 155, 70, 0.40)' : 'rgba(47, 158, 98, 0.40)'),
										}}
										disabled={!manualCode.trim() || isValidating}
										onPress={async () => {
											const code = manualCode.trim();
											if (!code) return;
											setIsValidating(true);
											try {
												const res = await fetch(apiUrl('/claim/validate'), {
													method: 'POST',
													headers: {
														'Content-Type': 'application/json',
														Authorization: `Bearer ${token}`,
													},
													body: JSON.stringify({ qrCode: code }),
												});
												const json = await res.json().catch(() => ({}));
												if (res.ok && json.ok) {
													const orderTitle = json.order?.title ?? 'Erbjudande';
													const userName = json.user?.name ?? json.user?.email ?? '';
													Alert.alert(
														'Godkänd',
														`"${orderTitle}" har lösts in.${userName ? `\nKund: ${userName}` : ''}`,
													);
													setManualCode('');
												} else {
													Alert.alert('Ogiltig', json.reason ?? json.error ?? 'QR-koden kunde inte valideras.');
												}
											} catch {
												Alert.alert('Nätverksfel', 'Kunde inte ansluta till servern.');
											} finally {
												setIsValidating(false);
											}
										}}
									>
										<Text className="text-center font-medium text-white">
											{isValidating ? 'Validerar...' : 'Bekräfta kod'}
										</Text>
									</Pressable>
								</View>
							</View>
						) : null}
					</>
				) : (
					<View style={styles.emptyState}>
						<Ionicons
							name="ticket-outline"
							size={42}
							color={offersAccent}
							style={{ opacity: 0.85 }}
						/>
						<Text style={[styles.emptyTitle, { color: theme.text }]}>
							Säkra deals du gillar
						</Text>
						<Text style={[styles.emptyText, { color: theme.textMuted }]}>
							Logga in så sparas dina claimade erbjudanden här.
						</Text>
						<Pressable
							onPress={() => router.push('/(tabs)/Loggain')}
							style={({ pressed }) => [
								styles.ctaSolid,
								{ opacity: pressed ? 0.88 : 1 },
							]}
						>
							<Text style={styles.ctaSolidLabel}>Logga in</Text>
						</Pressable>
					</View>
				)}

			<Modal
				visible={showCelebration}
				transparent
				animationType="fade"
				onRequestClose={() => setShowCelebration(false)}
			>
				<View
					className="flex-1 items-center justify-center p-6"
					style={{ backgroundColor: theme.isDark ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.30)' }}
				>
					<ConfettiAnimation onDone={() => {}} />
					<View className="rounded-3xl p-8 max-w-sm w-full items-center" style={{ backgroundColor: theme.cardBg }}>
						<Text style={{ fontSize: 56 }}>🎉</Text>
						<Text className="mt-4 text-2xl font-bold text-center" style={{ color: theme.text }}>Gratulerar!</Text>
						<Text className="mt-2 text-base text-center" style={{ color: theme.textMuted }}>Koden är inlöst</Text>
						{celebrationTitle ? (
							<Text className="mt-1 text-sm text-center" style={{ color: theme.textFaint }}>
								{'\u201C'}
								{celebrationTitle}
								{'\u201D'}
							</Text>
						) : null}
						<Pressable
							className="mt-6 w-full rounded-2xl bg-[#34c759] px-4 py-3"
							onPress={() => setShowCelebration(false)}
						>
							<Text className="text-center font-semibold text-white">Toppen!</Text>
						</Pressable>
					</View>
				</View>
			</Modal>
				</View>
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	hero: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		marginBottom: 8,
	},
	heroCopy: {
		flex: 1,
		minWidth: 0,
	},
	titleRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
	},
	title: {
		fontSize: 28,
		fontWeight: '800',
		letterSpacing: -0.8,
		lineHeight: 32,
	},
	countPill: {
		minWidth: 28,
		height: 24,
		paddingHorizontal: 8,
		borderRadius: 999,
		borderWidth: StyleSheet.hairlineWidth,
		alignItems: 'center',
		justifyContent: 'center',
	},
	countText: {
		fontSize: 12,
		fontWeight: '700',
		letterSpacing: -0.1,
	},
	subtitle: {
		marginTop: 4,
		fontSize: 14,
		fontWeight: '500',
		letterSpacing: -0.1,
		lineHeight: 18,
	},
	emptyState: {
		marginTop: 56,
		alignItems: 'center',
		paddingHorizontal: 18,
		gap: 10,
	},
	emptyTitle: {
		marginTop: 6,
		fontSize: 18,
		fontWeight: '700',
		letterSpacing: -0.35,
		textAlign: 'center',
	},
	emptyText: {
		fontSize: 14,
		fontWeight: '500',
		lineHeight: 20,
		letterSpacing: -0.1,
		textAlign: 'center',
		maxWidth: 280,
	},
	ctaSolid: {
		marginTop: 10,
		alignSelf: 'center',
		borderRadius: 12,
		backgroundColor: '#ff3b30',
		paddingHorizontal: 22,
		paddingVertical: 12,
	},
	ctaSolidLabel: {
		color: '#ffffff',
		fontSize: 15,
		fontWeight: '700',
		letterSpacing: -0.1,
		textAlign: 'center',
	},
});
