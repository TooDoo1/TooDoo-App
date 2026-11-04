import { useEffect, useState, useRef } from 'react';
import {
	View,
	Text,
	TextInput,
	Pressable,
	Alert,
	Animated,
	ScrollView,
	Easing,
	Platform,
	StyleSheet,
	type StyleProp,
	type TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/auth-context';
import { apiUrl } from '@/lib/api';
import { COMPANY_DETAIL_PATH } from '@/lib/detail-navigation';
import { PasswordInput } from '@/components/ui/password-input';
import { useThemePreference } from '@/context/theme-preference-context';
import { brandInkRgba } from '@/lib/brand-colors';
import { TAB_ACTIVE_COLORS } from '@/lib/tab-colors';
import { uiTheme } from '@/lib/ui-theme';
import { getFloatingTabBarScrollPadding } from '@/components/floating-tab-bar';
import { HOME_PAGE_PAD } from '@/components/home/home-feed';

const USER_EXTRAS_MAX_HEIGHT = 280;
const USER_EXTRAS_TUCK_PX = 12;
const USER_EXTRAS_GAP_PX = 8;

type BounceTextProps = {
	text: string;
	className?: string;
	textStyle?: StyleProp<TextStyle>;
	trigger: number;
};

function BounceText({ text, className, textStyle, trigger }: BounceTextProps) {
	const letters = text.split('');
	const bounceValues = useRef(letters.map(() => new Animated.Value(0))).current;

	useEffect(() => {
		if (trigger === 0) {
			return;
		}

		bounceValues.forEach((value) => value.setValue(0));

		const bounceOneLetter = Animated.stagger(
			80,
			bounceValues.map((value) =>
				Animated.sequence([
					Animated.timing(value, { toValue: -10, duration: 140, useNativeDriver: true }),
					Animated.timing(value, { toValue: 0, duration: 140, useNativeDriver: true }),
				])
			)
		);

		bounceOneLetter.start();
	}, [bounceValues, trigger]);

	return (
		<View style={{ flexDirection: 'row' }}>
			{letters.map((char, i) => (
				<Animated.Text
					key={`${char}-${i}`}
					className={className}
					style={[{ transform: [{ translateY: bounceValues[i] }] }, textStyle]}
				>
					{char === ' ' ? '\u00A0' : char}
				</Animated.Text>
			))}
		</View>
	);
}

export default function LoggainScreen() {
	const router = useRouter();
	const { returnTo, returnParams } = useLocalSearchParams<{
		returnTo?: string;
		returnParams?: string;
	}>();
	const { signIn } = useAuth();
	const { mode } = useThemePreference();
	const theme = uiTheme(mode);
	const insets = useSafeAreaInsets();
	const scrollBottomPadding = getFloatingTabBarScrollPadding(insets.bottom, undefined, 24);
	const fieldStyle = {
		borderColor: theme.border,
		backgroundColor: brandInkRgba(theme.isDark ? 0.1 : 0.04),
		color: theme.text,
	};
	const [selectedType, setSelectedType] = useState<'user' | 'company'>('user');
	// During transitions we keep the previous form mounted so the drawer can animate
	// before swapping to the other login card.
	const [displayedType, setDisplayedType] = useState<'user' | 'company'>('user');
	const [isTypeAnimating, setIsTypeAnimating] = useState(false);
	const [showUserExtrasDrawer, setShowUserExtrasDrawer] = useState(true);
	const [userBounceTrigger, setUserBounceTrigger] = useState(0);
	const [companyBounceTrigger, setCompanyBounceTrigger] = useState(0);
	const [userEmail, setUserEmail] = useState('');
	const [userPassword, setUserPassword] = useState('');
	const [companyEmail, setCompanyEmail] = useState('');
	const [companyPassword, setCompanyPassword] = useState('');
	const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);
	const userExtrasAnim = useRef(new Animated.Value(1)).current;

	const handleUserPress = () => {
		if (isTypeAnimating) return;
		if (selectedType === 'user') {
			setUserBounceTrigger((prev) => prev + 1);
			return;
		}

		setIsTypeAnimating(true);
		setSelectedType('user');
		setDisplayedType('user');
		setShowUserExtrasDrawer(true);
		setUserBounceTrigger((prev) => prev + 1);
		userExtrasAnim.setValue(0);
		Animated.timing(userExtrasAnim, {
			toValue: 1,
			duration: 520,
			useNativeDriver: false,
			easing: Easing.out(Easing.cubic),
		}).start(() => setIsTypeAnimating(false));
	};

	const handleCompanyPress = () => {
		if (isTypeAnimating) return;
		if (selectedType === 'company') {
			setCompanyBounceTrigger((prev) => prev + 1);
			return;
		}

		// Switch immediately, while collapsing the drawer at same time.
		setIsTypeAnimating(true);
		setSelectedType('company');
		setDisplayedType('company');
		setCompanyBounceTrigger((prev) => prev + 1);

		// Keep the drawer mounted while it collapses.
		setShowUserExtrasDrawer(true);
		Animated.timing(userExtrasAnim, {
			toValue: 0,
			duration: 420,
			useNativeDriver: false,
			easing: Easing.inOut(Easing.cubic),
		}).start(() => {
			setShowUserExtrasDrawer(false);
			setIsTypeAnimating(false);
		});
	};

	const handleLogin = async (accountType: 'user' | 'company') => {
		const email = (accountType === 'user' ? userEmail : companyEmail).trim();
		const password = accountType === 'user' ? userPassword : companyPassword;

		if (!email || !password) {
			Alert.alert('Saknad information', 'Fyll i e-post och lösenord.');
			return;
		}

		if (password.length < 8) {
			Alert.alert('Ogiltigt lösenord', 'Lösenord måste vara minst 8 tecken.');
			return;
		}

		setIsSubmittingLogin(true);
		try {
			const endpoint = accountType === 'company' ? '/user/login/portal' : '/user/login';
			const response = await fetch(apiUrl(endpoint), {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ email, password }),
			});

			const data = (await response.json().catch(() => ({}))) as {
				token?: string;
				refreshToken?: string;
				error?: string;
				user?: { role?: string };
			};

			if (response.status === 200 && data.token) {
				await signIn(data.token, data.refreshToken ?? null, data.user?.role ?? null);

				const returnToValue = Array.isArray(returnTo) ? returnTo[0] : returnTo;
				if (accountType === 'user' && returnToValue === 'company-detail') {
					const paramsRaw = Array.isArray(returnParams) ? returnParams[0] : returnParams;
					if (router.canGoBack()) {
						router.back();
						return;
					}
					if (paramsRaw) {
						try {
							const parsedParams = JSON.parse(paramsRaw) as Record<string, string>;
							router.replace({ pathname: COMPANY_DETAIL_PATH, params: parsedParams });
							return;
						} catch {
							// Fall through to default post-login navigation.
						}
					}
				}

				Alert.alert('Inloggad', 'Inloggning lyckades.');
				router.push('/(tabs)/MinaDeals');
				return;
			}

			if (response.status === 401) {
				Alert.alert('Fel inloggning', data.error ?? 'Invalid credentials');
				return;
			}

			Alert.alert('Fel', data.error ?? 'Kunde inte logga in just nu.');
		} catch {
			Alert.alert('Nätverksfel', 'Kunde inte ansluta till servern.');
		} finally {
			setIsSubmittingLogin(false);
		}
	};
	
		const socialLogin = (provider: 'Google' | 'Facebook' | 'Apple') => {
			Alert.alert(
				`Fortsätt med ${provider}`,
				`Omdirigerar till ${provider}-inloggning...\n\n(Koppla ihop med ${provider} OAuth för att aktivera)`
			);
		};

	const renderLoginForm = (accountType: 'user' | 'company') => {
		const isUser = accountType === 'user';
		const email = isUser ? userEmail : companyEmail;
		const setEmail = isUser ? setUserEmail : setCompanyEmail;
		const password = isUser ? userPassword : companyPassword;
		const setPassword = isUser ? setUserPassword : setCompanyPassword;

		return (
			<View style={styles.formBlock}>
				<Text style={[styles.formTitle, { color: theme.text }]}>
					{isUser ? 'Användare' : 'Företag'}
				</Text>
				<Text style={[styles.formSubtitle, { color: theme.textMuted }]}>
					{isUser
						? 'Spara favoriter och erbjudanden på ditt konto.'
						: 'Hantera ditt företags erbjudanden.'}
				</Text>

				<Text style={[styles.fieldLabel, { color: theme.textMuted }]}>E-post</Text>
				<TextInput
					value={email}
					onChangeText={setEmail}
					placeholder="Din e-postadress"
					placeholderTextColor={theme.textFaint}
					keyboardType="email-address"
					autoCapitalize="none"
					autoCorrect={false}
					style={[styles.field, fieldStyle]}
				/>

				<Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Lösenord</Text>
				<PasswordInput
					value={password}
					onChangeText={setPassword}
					placeholder="Minst 8 tecken"
					placeholderTextColor={theme.textFaint}
					wrapperClassName=""
					wrapperStyle={[styles.field, styles.passwordField, fieldStyle]}
					style={{ color: theme.text, fontSize: 15 }}
					toggleColor={theme.textMuted}
				/>

				<Pressable
					style={styles.forgotHit}
					onPress={() =>
						router.push({
							pathname: '/glomt-losenord',
							params: email.trim() ? { email: email.trim() } : undefined,
						})
					}
				>
					<Text style={[styles.forgotLabel, { color: theme.link }]}>Glömt lösenord?</Text>
				</Pressable>

				<Pressable
					onPress={() => handleLogin(accountType)}
					disabled={isSubmittingLogin}
					style={({ pressed }) => [
						styles.ctaSolid,
						{ opacity: isSubmittingLogin || pressed ? 0.88 : 1 },
					]}
				>
					<Text style={styles.ctaSolidLabel}>
						{isSubmittingLogin ? 'Loggar in…' : 'Logga in'}
					</Text>
				</Pressable>
			</View>
		);
	};

	return (
		<ScrollView
			className="flex-1"
			style={{ backgroundColor: theme.screenBg }}
			contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
			keyboardShouldPersistTaps="handled"
		>
			<View
				style={{
					paddingHorizontal: HOME_PAGE_PAD,
					paddingTop: Math.max(insets.top + 20, 72),
				}}
			>
				<View style={styles.hero}>
					<Ionicons name="person" size={26} color={TAB_ACTIVE_COLORS.Profile} />
					<View style={styles.heroCopy}>
						<Text style={[styles.title, { color: theme.text }]}>Logga in</Text>
						<Text style={[styles.subtitle, { color: theme.textMuted }]}>
							Välj kontotyp och fortsätt
						</Text>
					</View>
				</View>

				<View
					style={[
						styles.segmentTrack,
						{ backgroundColor: brandInkRgba(theme.isDark ? 0.1 : 0.04) },
					]}
				>
					{(
						[
							{
								id: 'user' as const,
								label: 'Användare',
								onPress: handleUserPress,
								trigger: userBounceTrigger,
								accent: theme.accentGreen,
							},
							{
								id: 'company' as const,
								label: 'Företag',
								onPress: handleCompanyPress,
								trigger: companyBounceTrigger,
								accent: theme.primary,
							},
						] as const
					).map((tab, index) => {
						const active = selectedType === tab.id;
						return (
							<View key={tab.id} style={styles.segmentSlot}>
								{index > 0 ? (
									<View
										style={[
											styles.segmentDivider,
											{ backgroundColor: theme.border },
										]}
									/>
								) : null}
								<Pressable
									disabled={isTypeAnimating}
									onPress={tab.onPress}
									style={[
										styles.segmentItem,
										active
											? { backgroundColor: `${tab.accent}22` }
											: null,
									]}
								>
									<BounceText
										text={tab.label}
										textStyle={{
											color: active ? tab.accent : theme.textMuted,
											fontWeight: active ? '700' : '600',
											fontSize: 14,
											letterSpacing: -0.2,
										}}
										trigger={tab.trigger}
									/>
								</Pressable>
							</View>
						);
					})}
				</View>

				{displayedType === 'user' ? renderLoginForm('user') : null}
				{displayedType === 'company' ? renderLoginForm('company') : null}

				{showUserExtrasDrawer ? (
					<Animated.View
						style={{
							height: userExtrasAnim.interpolate({
								inputRange: [0, 1],
								outputRange: [0, USER_EXTRAS_MAX_HEIGHT],
							}),
							overflow: 'hidden',
							marginTop: -USER_EXTRAS_TUCK_PX,
							transform: [
								{
									translateY: userExtrasAnim.interpolate({
										inputRange: [0, 1],
										outputRange: [-14, 0],
									}),
								},
							],
							opacity: userExtrasAnim.interpolate({
								inputRange: [0, 1],
								outputRange: [0, 1],
							}),
						}}
					>
						<View style={{ paddingTop: USER_EXTRAS_TUCK_PX + USER_EXTRAS_GAP_PX }}>
							<View style={styles.dividerRow}>
								<View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
								<Text style={[styles.dividerText, { color: theme.textFaint }]}>eller</Text>
								<View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
							</View>

							<Pressable
								style={[
									styles.socialBtn,
									{
										borderColor: theme.border,
										backgroundColor: brandInkRgba(theme.isDark ? 0.08 : 0.04),
									},
								]}
								onPress={() => socialLogin('Google')}
							>
								<Ionicons name="logo-google" size={18} color={theme.text} />
								<Text style={[styles.socialLabel, { color: theme.text }]}>
									Fortsätt med Google
								</Text>
							</Pressable>

							<Pressable
								style={[
									styles.socialBtn,
									{
										borderColor: theme.border,
										backgroundColor: brandInkRgba(theme.isDark ? 0.08 : 0.04),
										marginTop: 10,
									},
								]}
								onPress={() => socialLogin('Apple')}
							>
								<Ionicons name="logo-apple" size={18} color={theme.text} />
								<Text style={[styles.socialLabel, { color: theme.text }]}>
									Fortsätt med Apple
								</Text>
							</Pressable>

							<View style={styles.registerRow}>
								<Text style={{ color: theme.textMuted, fontSize: 14 }}>Har du inget konto? </Text>
								<Pressable
									onPress={() =>
										router.push({
											pathname: '/(tabs)/Registrering',
											params: { accountType: 'user', returnTo: 'loggain' },
										})
									}
								>
									<Text style={{ color: theme.link, fontSize: 14, fontWeight: '700' }}>
										Registrera dig
									</Text>
								</Pressable>
							</View>
						</View>
					</Animated.View>
				) : null}
			</View>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	hero: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		marginBottom: 18,
	},
	heroCopy: {
		flex: 1,
		minWidth: 0,
	},
	title: {
		fontSize: 28,
		fontWeight: '800',
		letterSpacing: -0.8,
		lineHeight: 32,
	},
	subtitle: {
		marginTop: 4,
		fontSize: 14,
		fontWeight: '500',
		letterSpacing: -0.1,
		lineHeight: 18,
	},
	segmentTrack: {
		flexDirection: 'row',
		alignItems: 'stretch',
		padding: 4,
		borderRadius: 12,
	},
	segmentSlot: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
	},
	segmentDivider: {
		width: StyleSheet.hairlineWidth,
		alignSelf: 'stretch',
		marginVertical: 8,
		marginHorizontal: 6,
	},
	segmentItem: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: 10,
		borderRadius: 9,
	},
	formBlock: {
		marginTop: 22,
	},
	formTitle: {
		fontSize: 18,
		fontWeight: '700',
		letterSpacing: -0.3,
	},
	formSubtitle: {
		marginTop: 4,
		fontSize: 13,
		fontWeight: '500',
		lineHeight: 18,
		marginBottom: 18,
	},
	fieldLabel: {
		marginTop: 12,
		marginBottom: 6,
		fontSize: 12,
		fontWeight: '700',
		letterSpacing: 0.2,
		textTransform: 'uppercase',
	},
	field: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 12,
		paddingHorizontal: 14,
		paddingVertical: Platform.OS === 'web' ? 12 : 11,
		fontSize: 15,
		fontWeight: '500',
	},
	passwordField: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: Platform.OS === 'web' ? 10 : 8,
	},
	forgotHit: {
		alignSelf: 'flex-end',
		marginTop: 10,
		paddingVertical: 4,
	},
	forgotLabel: {
		fontSize: 13,
		fontWeight: '600',
	},
	ctaSolid: {
		marginTop: 18,
		alignSelf: 'center',
		borderRadius: 12,
		backgroundColor: '#ff3b30',
		paddingHorizontal: 28,
		paddingVertical: 12,
		minWidth: 160,
	},
	ctaSolidLabel: {
		color: '#ffffff',
		fontSize: 15,
		fontWeight: '700',
		letterSpacing: -0.1,
		textAlign: 'center',
	},
	dividerRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		marginBottom: 14,
	},
	dividerLine: {
		flex: 1,
		height: StyleSheet.hairlineWidth,
	},
	dividerText: {
		fontSize: 12,
		fontWeight: '600',
		letterSpacing: 0.3,
		textTransform: 'uppercase',
	},
	socialBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 10,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 12,
		paddingVertical: 12,
		paddingHorizontal: 14,
	},
	socialLabel: {
		fontSize: 14,
		fontWeight: '600',
		letterSpacing: -0.1,
	},
	registerRow: {
		marginTop: 18,
		flexDirection: 'row',
		justifyContent: 'center',
		alignItems: 'center',
		flexWrap: 'wrap',
	},
});
