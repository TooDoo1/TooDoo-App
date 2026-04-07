import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/auth-context';

export default function MinaDealsScreen() {
	const [isLoginOpen, setIsLoginOpen] = useState(false);
	const router = useRouter();
	const { isLoggedIn } = useAuth();

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
			<Text className="mt-2 pt-4 text-xl text-center text-white/70">0 av 3 aktiva erbjudanden</Text>

			{isLoggedIn ? (
				<View className="mt-8 rounded-2xl bg-[#0a1535] px-4 py-4">
					<Text className="text-center text-white">Du är inloggad. Nu kan du claima erbjudanden.</Text>
				</View>
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
