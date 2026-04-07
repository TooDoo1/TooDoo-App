import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function RegistreringScreen() {
	const router = useRouter();
	const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'https://toodoo-backend-ejml.onrender.com';
	const { accountType } = useLocalSearchParams<{ accountType?: string }>();
	const isCompanyRegistration = accountType === 'company';
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [companyName, setCompanyName] = useState('');
	const [isSubmittingRegister, setIsSubmittingRegister] = useState(false);

	const handleRegister = async () => {
		if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
			Alert.alert('Saknad information', 'Fyll i alla fält för att registrera dig.');
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

		if (isCompanyRegistration && !companyName.trim()) {
			Alert.alert('Saknad information', 'Fyll i företagsnamn för att registrera ett företagskonto.');
			return;
		}

		setIsSubmittingRegister(true);
		try {
			const response = await fetch(`${apiBaseUrl}/user/register`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					email: email.trim(),
					password,
					name: isCompanyRegistration ? companyName.trim() : undefined,
				}),
			});

			const data = (await response.json().catch(() => ({}))) as { error?: string };

			if (response.status === 201) {
				Alert.alert('Konto skapat', 'Din registrering lyckades.');
				router.push('/(tabs)/Personality');
				return;
			}

			if (response.status === 409) {
				Alert.alert('E-post upptagen', data.error ?? 'Email already exists');
				return;
			}

			Alert.alert('Fel', data.error ?? 'Kunde inte registrera just nu.');
		} catch {
			Alert.alert('Nätverksfel', 'Kunde inte ansluta till servern.');
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

					<Pressable className="mt-3 rounded-2xl bg-[#061A47] px-4 py-3" onPress={() => router.push('/(tabs)/Loggain')}>
						<Text className="text-center font-medium text-[#007AFF]">Tillbaka</Text>
					</Pressable>
				</View>
			</View>
		</ScrollView>
	);
}
