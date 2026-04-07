import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/auth-context';

export default function ProfileScreen() {
	const router = useRouter();
	const { signOut } = useAuth();

	return (
		<ScrollView className="flex-1 bg-[#000b2a]" contentContainerStyle={{ paddingBottom: 48 }}>
			<View className="min-h-full px-6 pt-24">
				<Text className="text-center text-3xl font-semibold text-white">Profil</Text>
				<Text className="mt-4 text-center text-white/70">Du är inloggad.</Text>

				<View className="mt-8 rounded-2xl bg-[#0a1535] px-4 py-5">
					<Pressable
						className="rounded-2xl bg-[#ff3b30] px-4 py-3"
						onPress={() => {
							signOut();
							router.replace('/(tabs)/Loggain');
						}}
					>
						<Text className="text-center font-medium text-white">Logga ut</Text>
					</Pressable>
				</View>
			</View>
		</ScrollView>
	);
}
