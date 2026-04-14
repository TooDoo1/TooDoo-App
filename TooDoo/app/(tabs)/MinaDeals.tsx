import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import ClaimedOffers, { type ClaimedOfferItem } from '@/components/ui/claimdeOffers';

type ApiOrder = {
	id?: string;
	_id?: string;
	title?: string;
	price?: number;
	orderTimeTo?: string;
	orderTimeFrom?: string;
	validTo?: string;
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
	orderId?: string | { id?: string; _id?: string; title?: string; price?: number; orderTimeTo?: string; validTo?: string; businessId?: string | { id?: string; _id?: string; name?: string } };
	order?: { id?: string; _id?: string; title?: string; price?: number; orderTimeTo?: string; validTo?: string; businessId?: string | { id?: string; _id?: string; name?: string } };
	createdAt?: string;
	status?: string;
};

const mockClaimedOffers: ClaimedOfferItem[] = [
	{
		id: 'mock-claim-1',
		title: '2 för 1 på entrébiljetter',
		businessName: 'Dunkers kulturhus',
		imageUri: 'https://picsum.photos/seed/dunkers-claim/240/240',
		priceText: '99 kr',
		claimedAtText: '2026-04-10',
		statusText: 'Aktiv',
		code: 'DUN42A',
	},
	{
		id: 'mock-claim-2',
		title: 'Familjepaket 25% rabatt',
		businessName: 'Cirkus Arena',
		imageUri: 'https://picsum.photos/seed/cirkus-claim/240/240',
		priceText: '149 kr',
		claimedAtText: '2026-04-08',
		statusText: 'Aktiv',
		code: 'CIR89B',
	},
	{
		id: 'mock-claim-3',
		title: 'Gratis barnbiljett med vuxen',
		businessName: 'Fredriksdal',
		imageUri: 'https://picsum.photos/seed/fredriksdal-claim/240/240',
		priceText: '0 kr',
		claimedAtText: '2026-03-28',
		statusText: 'Utgånget',
		code: 'FRD12C',
	},
];

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
	const [isLoadingClaims, setIsLoadingClaims] = useState(false);
	const [claimedOffers, setClaimedOffers] = useState<ClaimedOfferItem[]>([]);
	const router = useRouter();
	const { isLoggedIn, token } = useAuth();
	const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'https://toodoo-backend-ejml.onrender.com';
	const visibleOffers = isLoggedIn && claimedOffers.length > 0 ? claimedOffers : mockClaimedOffers;

	const activeClaimCount = useMemo(() => {
		return visibleOffers.filter((item) => {
			if (!item.statusText) return true;
			if (item.statusText.toLowerCase().includes('utgånget')) return false;
			return true;
		}).length;
	}, [visibleOffers]);

	useEffect(() => {
		let cancelled = false;

		const loadClaimedOffers = async () => {
			if (!isLoggedIn || !token) {
				setClaimedOffers([]);
				return;
			}

			setIsLoadingClaims(true);
			try {
				const payload = decodeJwtPayload(token) as { email?: string; sub?: string } | null;
				const userEmail = payload?.email ?? payload?.sub;

				if (!userEmail) {
					if (!cancelled) setClaimedOffers([]);
					return;
				}

				const [userRes, ordersRes, businessesRes] = await Promise.all([
					fetch(`${apiBaseUrl}/user/${encodeURIComponent(userEmail)}`),
					fetch(`${apiBaseUrl}/orders`),
					fetch(`${apiBaseUrl}/business?status=APPROVED`),
				]);

				const userJson = await userRes.json().catch(() => ({}));
				const ordersJson = await ordersRes.json().catch(() => []);
				const businessesJson = await businessesRes.json().catch(() => []);

				const userPayload = userJson?.user ?? userJson?.data ?? userJson;

				const claimsRaw: ApiClaim[] = Array.isArray(userPayload?.claims)
					? userPayload.claims
					: Array.isArray(userPayload?.claimedOffers)
						? userPayload.claimedOffers
						: Array.isArray(userPayload?.claimedOrders)
							? userPayload.claimedOrders
							: [];

				const ordersRaw: ApiOrder[] = Array.isArray(ordersJson)
					? ordersJson
					: Array.isArray(ordersJson?.orders)
						? ordersJson.orders
						: Array.isArray(ordersJson?.data)
							? ordersJson.data
							: [];

				const businessesRaw: ApiBusiness[] = Array.isArray(businessesJson)
					? businessesJson
					: Array.isArray(businessesJson?.businesses)
						? businessesJson.businesses
						: Array.isArray(businessesJson?.data)
							? businessesJson.data
							: [];

				const orderById = new Map<string, ApiOrder>();
				ordersRaw.forEach((order) => {
					const id = order.id ?? order._id;
					if (id) orderById.set(id, order);
				});

				const businessById = new Map<string, ApiBusiness>();
				businessesRaw.forEach((business) => {
					const id = business.id ?? business._id;
					if (id) businessById.set(id, business);
				});

				const mapped: ClaimedOfferItem[] = claimsRaw.map((claim, index) => {
					const embeddedOrder = claim.order ?? (typeof claim.orderId === 'object' ? claim.orderId : undefined);
					const orderId =
						typeof claim.orderId === 'string'
							? claim.orderId
							: embeddedOrder?.id ?? embeddedOrder?._id;

					const resolvedOrder: ApiOrder | undefined = ((orderId ? orderById.get(orderId) : undefined) ?? embeddedOrder) as ApiOrder | undefined;
					const businessId =
						typeof resolvedOrder?.businessId === 'string'
							? resolvedOrder.businessId
							: resolvedOrder?.businessId?.id ?? resolvedOrder?.businessId?._id;

					const businessName =
						typeof resolvedOrder?.businessId === 'object'
							? resolvedOrder?.businessId?.name
							: businessId
								? businessById.get(businessId)?.name
								: undefined;

					const expiryValue = resolvedOrder?.orderTimeTo ?? resolvedOrder?.validTo;
					const expiryMs = expiryValue ? new Date(expiryValue).getTime() : NaN;
					const isExpired = Number.isFinite(expiryMs) ? expiryMs < Date.now() : false;

					const claimedAt = claim.createdAt ? new Date(claim.createdAt) : undefined;

					// Generate a code from orderId (use first 6 chars uppercase)
					const code = orderId ? orderId.substring(0, 6).toUpperCase() : `CODE${index}`;

					return {
						id: claim.id ?? claim._id ?? orderId ?? `claim-${index}`,
						title: resolvedOrder?.title ?? 'Erbjudande',
						businessName,
						imageUri: `https://picsum.photos/seed/${encodeURIComponent(orderId ?? `claim-${index}`)}/240/240`,
						priceText: resolvedOrder?.price !== undefined ? `${resolvedOrder.price} kr` : undefined,
						claimedAtText: claimedAt && Number.isFinite(claimedAt.getTime()) ? claimedAt.toLocaleDateString('sv-SE') : undefined,
						statusText: isExpired ? 'Utgånget' : claim.status ?? 'Aktiv',
						code,
						onOpen: orderId
							? () => router.push({ pathname: '/(tabs)/Erbjudanden', params: { id: businessId ?? '', title: businessName ?? 'Erbjudande' } })
							: undefined,
					};
				});

				if (!cancelled) {
					setClaimedOffers(mapped);
				}
			} catch {
				if (!cancelled) {
					setClaimedOffers([]);
				}
			} finally {
				if (!cancelled) {
					setIsLoadingClaims(false);
				}
			}
		};

		loadClaimedOffers();

		return () => {
			cancelled = true;
		};
	}, [isLoggedIn, token, apiBaseUrl, router]);

	const socialLogin = (provider: 'Google' | 'Facebook' | 'Apple') => {
		Alert.alert(
			`Fortsätt med ${provider}`,
			`Omdirigerar till ${provider}-inloggning...\n\n(Koppla ihop med ${provider} OAuth för att aktivera)`
		);
	};

	return (
		<ScrollView className="flex-1 bg-[#000b2a]" contentContainerStyle={{ paddingBottom: 48 }}>
			<View className="px-6 pt-24 min-h-full">
			<Text className="text-3xl text-center font-semibold text-white">Mina Erbjudanden</Text>
			{/* <Text className="mt-2 text-center text-white/70">Här visas dina sparade deals.</Text> */}
			<Text className="mt-2 pt-4 text-xl text-center text-white/70">{activeClaimCount} aktiva erbjudanden</Text>
			<ClaimedOffers items={visibleOffers} />

			{isLoggedIn ? (
				isLoadingClaims ? (
					<View className="mt-4 rounded-2xl bg-[#0a1535] px-4 py-4">
						<Text className="text-center text-white/80">Uppdaterar dina claimade erbjudanden...</Text>
					</View>
				) : null
			) : (
				<View className="mt-8 px-4">
					<Pressable onPress={() => setIsLoginOpen(true)} className="rounded-xl bg-[#ff3b30] px-4 py-3">
						<Text className="text-center font-semibold text-white">Logga in för att säkra erbjudanden!</Text>
					</Pressable>
				</View>
			)}

			<Modal visible={isLoginOpen} transparent animationType="slide" onRequestClose={() => setIsLoginOpen(false)}>
				<View className="flex-1 justify-end bg-black/70">
					<Pressable className="flex-1" onPress={() => setIsLoginOpen(false)} />
					<View className="rounded-t-3xl bg-[#0a1535] px-6 pb-9 pt-6">
						<View className="mb-4 h-1 w-10 self-center rounded-full bg-white/30" />
						<Text className="text-2xl font-semibold text-white">Välkommen!</Text>
						<Text className="mb-5 mt-1 text-sm text-white/50">Logga in för att se dina deals och favoriter</Text>

						<Pressable className="mb-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3" onPress={() => socialLogin('Google')}>
							<Text className="text-center font-medium text-white">Fortsätt med Google</Text>
						</Pressable>

						{/* <Pressable className="mb-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3" onPress={() => socialLogin('Facebook')}>
							<Text className="text-center font-medium text-white">Fortsätt med Facebook</Text>
						</Pressable> */}

						<Pressable className="mb-4 rounded-2xl border border-white/20 bg-white/10 px-4 py-3" onPress={() => socialLogin('Apple')}>
							<Text className="text-center font-medium text-white">Fortsätt med Apple</Text>
						</Pressable>

						<TextInput
							placeholder="Din e-postadress"
							placeholderTextColor="rgba(255,255,255,0.45)"
							keyboardType="email-address"
							className="mb-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white"
						/>

						<Pressable className="mb-4 rounded-2xl bg-[#ff3b30] px-4 py-3" onPress={() => Alert.alert('E-post', 'Fortsätt med e-post')}>
							<Text className="text-center font-medium text-white">Fortsätt med e-post</Text>
						</Pressable>

						<View className="mb-4 flex-row justify-center">
							<Text className="text-white/70 text-md">Har du inget konto? </Text>
							<Pressable
								onPress={() => {
									setIsLoginOpen(false);
									router.push({ pathname: '/(tabs)/Registrering', params: { accountType: 'user', returnTo: 'minadeals' } });
								}}
							>
								<Text className="text-blue-400 text-md font-medium underline">Registrera dig här!</Text>
							</Pressable>
						</View>

						<Text className="text-center text-xs leading-5 text-white/50">
							Genom att logga in godkänner du våra användarvillkor och integritetspolicy.
						</Text>
					</View>
				</View>
			</Modal>
			</View>
		</ScrollView>
	);
}
