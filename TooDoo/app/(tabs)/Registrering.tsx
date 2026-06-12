import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import { apiUrl } from '@/lib/api';
import { COMPANY_DETAIL_PATH } from '@/lib/detail-navigation';
import { RegistrationScreenShell } from '@/components/registration-screen-shell';
import { useThemePreference } from '@/context/theme-preference-context';
import { uiTheme } from '@/lib/ui-theme';

export default function RegistreringScreen() {
	const router = useRouter();
	const { setPendingRegistration, signIn } = useAuth();
	const { mode } = useThemePreference();
	const theme = uiTheme(mode);
	const { accountType, returnTo, returnParams } = useLocalSearchParams<{ accountType?: string; returnTo?: string; returnParams?: string }>();
	const isCompanyRegistration = accountType === 'company';
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [companyName, setCompanyName] = useState('');
    const [isSubmittingRegister, setIsSubmittingRegister] = useState(false);

	const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

	const checkEmailAvailability = async (emailToCheck: string) => {
		// No public "email exists" endpoint; use reset-token behavior:
		// 200 => user exists, 404 => user missing.
		try {
			const res = await fetch(apiUrl('/user/forgot-password/token'), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: emailToCheck }),
			});

			if (res.status === 404) return { available: true as const };
			if (res.ok) return { available: false as const };
			return { available: true as const };
		} catch {
			return { available: true as const };
		}
	};

	const handleBack = () => {
		if (returnTo === 'erbjudanden') {
			let parsedParams: Record<string, string | string[]> = {};
			if (returnParams) {
				try {
					parsedParams = JSON.parse(returnParams) as Record<string, string | string[]>;
				} catch {
					parsedParams = {};
				}
			}

			router.replace({ pathname: COMPANY_DETAIL_PATH, params: parsedParams });
			return;
		}

		if (returnTo === 'minadeals') {
			router.replace('/(tabs)/MinaDeals');
			return;
		}

		if (returnTo === 'loggain') {
			router.replace('/(tabs)/Loggain');
			return;
		}

		if (router.canGoBack()) {
			router.back();
			return;
		}

		router.replace('/(tabs)/Loggain');
	};

	const handleRegister = async () => {
		if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
			Alert.alert('Saknad information', 'Fyll i alla fält för att registrera dig.');
			return;
		}

		if (!isValidEmail(email)) {
			Alert.alert('Ogiltig e-post', 'Skriv in en giltig e-postadress.');
			return;
		}

		if (password.length < 8) {
			Alert.alert('Ogiltigt lösenord', 'Lösenord måste vara minst 8 tecken.');
			return;
		}

		if (password !== confirmPassword) {
			Alert.alert('Lösenord matchar inte', 'Kontrollera lösenordet och försök igen.');
			return;
		}

		if (isCompanyRegistration) {
			setIsSubmittingRegister(true);
			try {
				const registerResponse = await fetch(apiUrl('/user/register/manager'), {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						email: email.trim(),
						password,
					}),
				});

				const registerData = (await registerResponse.json().catch(() => ({}))) as { error?: string };

				if (registerResponse.status !== 201) {
					if (registerResponse.status === 409) {
						Alert.alert('E-post upptagen', registerData.error ?? 'Email already exists');
						return;
					}

					Alert.alert('Fel', registerData.error ?? 'Kunde inte registrera manager-konto just nu.');
					return;
				}

				const loginResponse = await fetch(apiUrl('/user/login/portal'), {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						email: email.trim(),
						password,
					}),
				});

				const loginData = (await loginResponse.json().catch(() => ({}))) as {
					token?: string;
					refreshToken?: string;
					error?: string;
					user?: { role?: string };
				};

				if (loginResponse.status === 200 && loginData.token) {
					await signIn(loginData.token, loginData.refreshToken ?? null, loginData.user?.role ?? null);
					Alert.alert('Konto skapat', 'Manager-kontot skapades och du är nu inloggad.');
					router.replace('/(tabs)/Profile');
					return;
				}

				Alert.alert('Konto skapat', 'Kontot skapades, men automatisk inloggning misslyckades. Logga in manuellt.');
				router.replace('/(tabs)/Loggain');
			} catch {
				Alert.alert('Nätverksfel', 'Kunde inte ansluta till servern.');
			} finally {
				setIsSubmittingRegister(false);
			}

			return;
		}

		setIsSubmittingRegister(true);
		try {
			const availability = await checkEmailAvailability(email.trim());
			if (!availability.available) {
				Alert.alert('E-post upptagen', 'Det finns redan ett konto med den e-postadressen.');
				return;
			}

			setPendingRegistration({
				email: email.trim(),
				password,
				accountType: 'user',
			});

			router.push('/(tabs)/Personality');
		} finally {
			setIsSubmittingRegister(false);
		}

	};

	return (
		<RegistrationScreenShell
			header={
				<>
					<Text className="text-3xl font-semibold" style={{ color: theme.text }}>
						Registrering:
					</Text>
					<Text className="mt-2" style={{ color: theme.textMuted }}>
						Skapa ett konto för att spara och använda dina erbjudanden.
					</Text>
				</>
			}
			footer={
				<>
					<Pressable
						className="rounded-2xl bg-[#ff3b30] px-4 py-3"
						onPress={handleRegister}
						disabled={isSubmittingRegister}
					>
						<Text className="text-center font-medium text-white">Skapa konto</Text>
					</Pressable>
					<Pressable
						className="mt-3 rounded-2xl px-4 py-3"
						onPress={handleBack}
						style={{ backgroundColor: theme.primary, borderWidth: 0 }}
					>
						<Text className="text-center font-medium" style={{ color: '#ffffff' }}>Tillbaka</Text>
					</Pressable>
				</>
			}
		>
			<View className="rounded-2xl px-4 py-5" style={{ backgroundColor: theme.cardBg }}>
				<Text className="text-lg" style={{ color: theme.text }}>Skapa konto:</Text>
				<Text className="text-xs" style={{ color: theme.textMuted }}>
					Säkra dina erbjudanden idag genom att registrera dig!
				</Text>

				<Text className="pt-4 text-xl" style={{ color: theme.text }}>E-post:</Text>
				<TextInput
					value={email}
					onChangeText={setEmail}
					placeholder="Din e-postadress"
					placeholderTextColor={theme.textFaint}
					keyboardType="email-address"
					autoCapitalize="none"
					className="mt-2 rounded-2xl border px-4 py-3"
					style={{
						borderColor: theme.border,
						backgroundColor: theme.cardBgMuted,
						color: theme.text,
						fontSize: 16,
					}}
				/>

				{isCompanyRegistration ? (
					<>
						<Text className="pt-4 text-xl" style={{ color: theme.text }}>Företagsnamn:</Text>
						<TextInput
							value={companyName}
							onChangeText={setCompanyName}
							placeholder="Ange företagsnamn"
							placeholderTextColor={theme.textFaint}
							className="mt-2 rounded-2xl border px-4 py-3"
							style={{
								borderColor: theme.border,
								backgroundColor: theme.cardBgMuted,
								color: theme.text,
								fontSize: 16,
							}}
						/>
					</>
				) : null}

				<Text className="pt-4 text-xl" style={{ color: theme.text }}>Lösenord:</Text>
				<TextInput
					value={password}
					onChangeText={setPassword}
					placeholder="Välj lösenord"
					placeholderTextColor={theme.textFaint}
					secureTextEntry
					className="mt-2 rounded-2xl border px-4 py-3"
					style={{
						borderColor: theme.border,
						backgroundColor: theme.cardBgMuted,
						color: theme.text,
						fontSize: 16,
					}}
				/>

				<Text className="pt-4 text-xl" style={{ color: theme.text }}>Bekräfta lösenord:</Text>
				<TextInput
					value={confirmPassword}
					onChangeText={setConfirmPassword}
					placeholder="Bekräfta lösenord"
					placeholderTextColor={theme.textFaint}
					secureTextEntry
					className="mt-2 rounded-2xl border px-4 py-3"
					style={{
						borderColor: theme.border,
						backgroundColor: theme.cardBgMuted,
						color: theme.text,
						fontSize: 16,
					}}
				/>
			</View>
		</RegistrationScreenShell>
	);
}
