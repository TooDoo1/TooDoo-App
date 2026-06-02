import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuth } from '@/context/auth-context';
import ClaimedOffers, { ConfettiAnimation, type ClaimedOfferItem } from '@/components/ui/claimdeOffers';
import { apiUrl, normalizeImageUrl } from '@/lib/api';
import { StarrySkyScreenBackground } from '@/components/ui/starry-background';
import { useThemePreference } from '@/context/theme-preference-context';
import { uiTheme } from '@/lib/ui-theme';

type ApiOrder = {
	id?: string;
	_id?: string;
	title?: string;
	price?: number;
	orderTimeTo?: string;
	orderTimeFrom?: string;
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
					orderTimeTo?: string;
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
				orderTimeTo?: string;
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
			orderTimeTo?: string;
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
		orderTimeTo?: string;
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
	const [isLoginOpen, setIsLoginOpen] = useState(false);
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
	const [cameraPermission, requestCameraPermission] = useCameraPermissions();
	const router = useRouter();
	const { isLoggedIn, token } = useAuth();
	const { mode } = useThemePreference();
	const theme = uiTheme(mode);
	const visibleOffers = isLoggedIn ? claimedOffers : [];

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
			if (!item.statusText) return true;
			if (item.statusText.toLowerCase().includes('utgånget')) return false;
			return true;
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
				const qrExpiryMs = qrExpiryValue ? new Date(qrExpiryValue).getTime() : NaN;
				const isQrExpired = Number.isFinite(qrExpiryMs) ? qrExpiryMs < Date.now() : false;
				const statusRaw = String(claim.status ?? '').toLowerCase();
				const isStatusExpired = statusRaw.includes('expired') || statusRaw.includes('utgånget');

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
					statusText: isQrExpired || isStatusExpired ? 'Utgånget' : claim.status ?? 'Aktiv',
					code,
					onOpen: orderId
						? () => router.push({ pathname: '/(tabs)/Erbjudanden', params: { claimOrderId: orderId, claimBusinessId: businessId ?? '', title: embeddedOrder?.title ?? 'Erbjudande' } })
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
	}, [isLoggedIn, token, router]);

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

	const socialLogin = (provider: 'Google' | 'Facebook' | 'Apple') => {
		Alert.alert(
			`Fortsätt med ${provider}`,
			`Omdirigerar till ${provider}-inloggning...\n\n(Koppla ihop med ${provider} OAuth för att aktivera)`
		);
	};

	return (
		<View className="flex-1" style={{ backgroundColor: theme.screenBg }}>
			<StarrySkyScreenBackground variant={theme.isDark ? 'dark' : 'light'} />
			<ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 160 }}>
				<View className="px-6 pt-24 min-h-full">
				<Text className="text-3xl text-center font-semibold" style={{ color: theme.text }}>Mina Erbjudanden</Text>
				{/* <Text className="mt-2 text-center text-white/70">Här visas dina sparade deals.</Text> */}
				{isLoggedIn ? (
					<>
						<Text className="mt-2 pt-4 text-xl text-center" style={{ color: theme.textMuted }}>
							{activeClaimCount} aktiva erbjudanden
						</Text>
						{isLoadingClaims ? (
							<View className="mt-4 rounded-2xl px-4 py-4" style={{ backgroundColor: theme.cardBg }}>
								<Text className="text-center" style={{ color: theme.textMuted }}>Uppdaterar dina claimade erbjudanden...</Text>
							</View>
						) : (
							<ClaimedOffers items={visibleOffers} scrollEnabled={false} />
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
													: (theme.isDark ? 'rgba(255, 155, 70, 0.40)' : 'rgba(186, 219, 194, 0.40)'),
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
					<View className="mt-8 px-4">
						<Text className="mb-4 text-center" style={{ color: theme.textMuted }}>Logga in för att se dina claimade erbjudanden.</Text>
						<Pressable onPress={() => setIsLoginOpen(true)} className="rounded-xl bg-[#ff3b30] px-4 py-3">
							<Text className="text-center font-semibold text-white">Logga in för att säkra erbjudanden!</Text>
						</Pressable>
					</View>
				)}

			<Modal visible={isLoginOpen} transparent animationType="slide" onRequestClose={() => setIsLoginOpen(false)}>
				<View
					className="flex-1 justify-end"
					style={{ backgroundColor: theme.isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.25)' }}
				>
					<Pressable className="flex-1" onPress={() => setIsLoginOpen(false)} />
					<View className="rounded-t-3xl px-6 pb-9 pt-6" style={{ backgroundColor: theme.cardBg }}>
						<View className="mb-4 h-1 w-10 self-center rounded-full bg-white/30" />
						<Text className="text-2xl font-semibold" style={{ color: theme.text }}>Välkommen!</Text>
						<Text className="mb-5 mt-1 text-sm" style={{ color: theme.textFaint }}>Logga in för att se dina deals och favoriter</Text>

						<Pressable className="mb-2 rounded-2xl border px-4 py-3" style={{ borderColor: theme.border, backgroundColor: theme.cardBgMuted }} onPress={() => socialLogin('Google')}>
							<Text className="text-center font-medium" style={{ color: theme.text }}>Fortsätt med Google</Text>
						</Pressable>

						{/* <Pressable className="mb-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3" onPress={() => socialLogin('Facebook')}>
							<Text className="text-center font-medium text-white">Fortsätt med Facebook</Text>
						</Pressable> */}

						<Pressable className="mb-4 rounded-2xl border px-4 py-3" style={{ borderColor: theme.border, backgroundColor: theme.cardBgMuted }} onPress={() => socialLogin('Apple')}>
							<Text className="text-center font-medium" style={{ color: theme.text }}>Fortsätt med Apple</Text>
						</Pressable>

						<TextInput
							placeholder="Din e-postadress"
							placeholderTextColor={theme.textFaint}
							keyboardType="email-address"
							className="mb-2 rounded-2xl border px-4 py-3"
							style={{ borderColor: theme.border, backgroundColor: theme.cardBgMuted, color: theme.text }}
						/>

						<Pressable className="mb-4 rounded-2xl bg-[#ff3b30] px-4 py-3" onPress={() => Alert.alert('E-post', 'Fortsätt med e-post')}>
							<Text className="text-center font-medium text-white">Fortsätt med e-post</Text>
						</Pressable>

						<View className="mb-4 flex-row justify-center">
							<Text className="text-md" style={{ color: theme.textMuted }}>Har du inget konto? </Text>
							<Pressable
								onPress={() => {
									setIsLoginOpen(false);
									router.push({ pathname: '/(tabs)/Registrering', params: { accountType: 'user', returnTo: 'minadeals' } });
								}}
							>
								<Text className="text-blue-400 text-md font-medium underline">Registrera dig här!</Text>
							</Pressable>
						</View>

						<Text className="text-center text-xs leading-5" style={{ color: theme.textFaint }}>
							Genom att logga in godkänner du våra användarvillkor och integritetspolicy.
						</Text>
					</View>
				</View>
			</Modal>

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
