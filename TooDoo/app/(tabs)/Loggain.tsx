import { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, Pressable, Alert, Animated, ScrollView, Easing, type StyleProp, type TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import { apiUrl } from '@/lib/api';
import { useThemePreference } from '@/context/theme-preference-context';
import { uiTheme } from '@/lib/ui-theme';

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

export default function MinaDealsScreen() {
	const router = useRouter();
	const { signIn } = useAuth();
	const { mode } = useThemePreference();
	const theme = uiTheme(mode);
	const boxShadowStyle = {
		shadowColor: theme.isDark ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.25)',
		shadowOffset: { width: 0, height: theme.isDark ? 10 : 6 },
		shadowOpacity: theme.isDark ? 0.35 : 0.14,
		shadowRadius: theme.isDark ? 18 : 12,
		elevation: theme.isDark ? 12 : 7,
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

	const selectedGlowStyleUser = {
		shadowColor: theme.accentGreen,
		shadowOffset: { width: 0, height: 0 },
		shadowOpacity: 0.8,
		shadowRadius: 20,
	};

	const selectedGlowStyleCompany = {
		shadowColor: theme.primary,
		shadowOffset: { width: 0, height: 0 },
		shadowOpacity: 0.8,
		shadowRadius: 20,
	};

	const [isLoginOpen, setIsLoginOpen] = useState(false);

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

			const data = (await response.json().catch(() => ({}))) as { token?: string; error?: string };

			if (response.status === 200 && data.token) {
				signIn(data.token);
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

	return (
		<ScrollView className="flex-1" style={{ backgroundColor: theme.screenBg }} contentContainerStyle={{ paddingBottom: 48 }}>
			<View className="px-6 pt-12">
			<Text className=" pt-10 text-3xl font-semibold" style={{ color: theme.text }}>In loggning:</Text>

            <View
				className="mt-8 rounded-2xl px-6 flex-row gap-3 items-center justify-center"
				style={[{ backgroundColor: theme.cardBg }, boxShadowStyle]}
			>
                <Pressable 
					className={`mb-3 mt-3 rounded-2xl w-1/2 py-3`}
					disabled={isTypeAnimating}
					onPress={handleUserPress}
				>
					<View className="items-center">
						<BounceText
							text="Användare"
							className="text-center font-medium"
							textStyle={
								selectedType === 'user'
									? [selectedGlowStyleUser, { color: theme.accentGreen }]
									: { color: theme.textMuted }
							}
							trigger={userBounceTrigger}
						/>
					</View>
                </Pressable>
                <View className="h-12 w-px bg-[#3e5592]" />
                <Pressable 
					className={`mb-3 mt-3 rounded-2xl py-3 w-1/2`}
					disabled={isTypeAnimating}
					onPress={handleCompanyPress}
				>
					<View className="items-center">
						<BounceText
							text="Företag"
							className="text-center font-medium"
							textStyle={
								selectedType === 'company'
									? [selectedGlowStyleCompany, { color: theme.primary }]
									: { color: theme.textMuted }
							}
							trigger={companyBounceTrigger}
						/>
					</View>
                </Pressable>
                
            </View>

						{displayedType === 'user' ? (
							<View>
							<View className="mt-8 rounded-2xl px-4 py-4" style={[{ backgroundColor: theme.cardBg }, boxShadowStyle]}>
								<Text className="text-xl" style={{ color: theme.text }}>Användar inloggning:</Text>
								<Text className="text-xs" style={{ color: theme.textMuted }}>Säkra dina erbjudanden idag genom att logga in!</Text>
								<Text className="pt-4 text-xl" style={{ color: theme.text }}>E-post:</Text>
								<TextInput
																value={userEmail}
																onChangeText={setUserEmail}
															placeholder="Din e-postadress"
															placeholderTextColor={theme.textFaint}
															keyboardType="email-address"
																autoCapitalize="none"
															className="mt-2 rounded-2xl border px-4 py-3"
															style={{ borderColor: theme.border, backgroundColor: theme.cardBgMuted, color: theme.text }}
														/>
								<Text className="pt-4 text-xl" style={{ color: theme.text }}>Lösenord:</Text>
								<TextInput
																value={userPassword}
																onChangeText={setUserPassword}
															placeholder="lösenord"
															placeholderTextColor={theme.textFaint}
															secureTextEntry
															className="mt-2 rounded-2xl border px-4 py-3"
															style={{ borderColor: theme.border, backgroundColor: theme.cardBgMuted, color: theme.text }}
														/>
								<Pressable className="mt-6 rounded-2xl bg-[#ff3b30] px-4 py-3" onPress={() => handleLogin('user')} disabled={isSubmittingLogin}>
									<Text className="text-center font-medium text-white">Logga in</Text>
								</Pressable>
							</View>

							</View>
							) : null}

						{displayedType === 'company' ? (
							<View>
							<View className="mt-8 rounded-2xl px-4 py-4" style={[{ backgroundColor: theme.cardBg }, boxShadowStyle]}>
								<Text className="text-xl" style={{ color: theme.text }}>Företags inloggning:</Text>
								<Text className="text-xs" style={{ color: theme.textMuted }}>Skapa erbjudanden idag genom att logga in!</Text>
								<Text className="pt-4 text-xl" style={{ color: theme.text }}>E-post:</Text>
								<TextInput
																value={companyEmail}
																onChangeText={setCompanyEmail}
															placeholder="Din e-postadress"
															placeholderTextColor={theme.textFaint}
															keyboardType="email-address"
																autoCapitalize="none"
															className="mt-2 rounded-2xl border px-4 py-3"
															style={{ borderColor: theme.border, backgroundColor: theme.cardBgMuted, color: theme.text }}
														/>
								<Text className="pt-4 text-xl" style={{ color: theme.text }}>Lösenord:</Text>
								<TextInput
																value={companyPassword}
																onChangeText={setCompanyPassword}
															placeholder="lösenord"
															placeholderTextColor={theme.textFaint}
															secureTextEntry
															className="mt-2 rounded-2xl border px-4 py-3"
															style={{ borderColor: theme.border, backgroundColor: theme.cardBgMuted, color: theme.text }}
														/>
								<Pressable className="mt-6 rounded-2xl bg-[#ff3b30] px-4 py-3" onPress={() => handleLogin('company')} disabled={isSubmittingLogin}>
									<Text className="text-center font-medium text-white">Logga in</Text>
								</Pressable>
							</View>

							{/* <View className="mt-2 px-4 rounded-2xl bg-[#0a1535] py-4">
							<Pressable className="mb-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3" onPress={() => socialLogin('Google')}>
							  <Text className="text-center font-medium text-white">Fortsätt med Google</Text>
						    </Pressable>

							<Pressable className="mt-2 mb-4 rounded-2xl border border-white/20 bg-white/10 px-4 py-3" onPress={() => socialLogin('Apple')}>
							  <Text className="text-center font-medium text-white">Fortsätt med Apple</Text>
						    </Pressable>

							</View> */}

							{/* <View className="mt-4 flex-row justify-center">
								<Text className="text-white/70 text-md">Har ditt företag inget konto? </Text>
								<Pressable
									onPress={() => router.push({ pathname: '/(tabs)/Registrering', params: { accountType: 'company', returnTo: 'loggain' } })}
								>
									<Text className="text-blue-400 text-md font-medium underline">Registrera dig här!</Text>
								</Pressable>
							</View> */}

							</View>
						) : null}

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
									<View className="px-4 rounded-2xl py-4" style={[{ backgroundColor: theme.cardBg }, boxShadowStyle]}>
										<Pressable
											className="mb-2 rounded-2xl border px-4 py-3"
											style={{ borderColor: theme.border, backgroundColor: theme.cardBgMuted }}
											onPress={() => socialLogin('Google')}
										>
											<Text className="text-center font-medium" style={{ color: theme.text }}>Fortsätt med Google</Text>
										</Pressable>

										<Pressable
											className="mt-2 rounded-2xl border px-4 py-3"
											style={{ borderColor: theme.border, backgroundColor: theme.cardBgMuted }}
											onPress={() => socialLogin('Apple')}
										>
											<Text className="text-center font-medium" style={{ color: theme.text }}>Fortsätt med Apple</Text>
										</Pressable>
									</View>

									<View className="mt-4 flex-row justify-center">
										<Text className="text-md" style={{ color: theme.textMuted }}>Har du inget konto? </Text>
										<Pressable
											onPress={() =>
												router.push({
													pathname: '/(tabs)/Registrering',
													params: { accountType: 'user', returnTo: 'loggain' },
												})
											}
										>
											<Text className="text-blue-400 text-md font-medium underline">Registrera dig här!</Text>
										</Pressable>
									</View>
								</View>
							</Animated.View>
						) : null}



			</View>

			
	   </ScrollView>
	);
}
