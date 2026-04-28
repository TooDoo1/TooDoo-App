import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import { apiUrl } from '@/lib/api';

export default function RegistreringScreen() {
	const router = useRouter();
	const { setPendingRegistration, signIn } = useAuth();
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

			router.replace({ pathname: '/(tabs)/Erbjudanden', params: parsedParams });
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

				const loginData = (await loginResponse.json().catch(() => ({}))) as { token?: string; error?: string };

				if (loginResponse.status === 200 && loginData.token) {
					signIn(loginData.token);
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
		<ScrollView className="flex-1 bg-[#000b2a]" contentContainerStyle={{ paddingBottom: 48 }}>
			<View className="px-6 pt-12">
				<Text className="pt-10 text-3xl font-semibold text-white">Registrering:</Text>
				<Text className="mt-2 text-white/70">Skapa ett konto för att spara och använda dina erbjudanden.</Text>

				<View className="mt-8 rounded-2xl bg-[#0a1535] px-4 py-5">
					<Text className="text-lg text-white">Skapa konto:</Text>
                    <Text className="text-white/70 text-xs">Säkra dina erbjudanden idag genom att registrera dig!</Text>

					<Text className="pt-4 text-xl text-white">E-post:</Text>
					<TextInput
						value={email}
						onChangeText={setEmail}
						placeholder="Din e-postadress"
						placeholderTextColor="rgba(255,255,255,0.45)"
						keyboardType="email-address"
						autoCapitalize="none"
						className="mt-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white"
					/>

					{isCompanyRegistration ? (
						<>
							<Text className="pt-4 text-xl text-white">Företagsnamn:</Text>
							<TextInput
								value={companyName}
								onChangeText={setCompanyName}
								placeholder="Ange företagsnamn"
								placeholderTextColor="rgba(255,255,255,0.45)"
								className="mt-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white"
							/>
						</>
					) : null}

					<Text className="pt-4 text-xl text-white">Lösenord:</Text>
					<TextInput
						value={password}
						onChangeText={setPassword}
						placeholder="Välj lösenord"
						placeholderTextColor="rgba(255,255,255,0.45)"
						secureTextEntry
						className="mt-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white"
					/>

					<Text className="pt-4 text-xl text-white">Bekräfta lösenord:</Text>
					<TextInput
						value={confirmPassword}
						onChangeText={setConfirmPassword}
						placeholder="Bekräfta lösenord"
						placeholderTextColor="rgba(255,255,255,0.45)"
						secureTextEntry
						className="mt-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white"
					/>

					<Pressable className="mt-6 rounded-2xl bg-[#ff3b30] px-4 py-3" onPress={handleRegister} disabled={isSubmittingRegister}>
						<Text className="text-center font-medium text-white">Skapa konto</Text>
					</Pressable>

					<Pressable
						className="mt-3 rounded-2xl bg-[#061A47] px-4 py-3"
						onPress={handleBack}
					>
						<Text className="text-center font-medium text-[#007AFF]">Tillbaka</Text>
					</Pressable>
				</View>
			</View>
		</ScrollView>
	);
}
