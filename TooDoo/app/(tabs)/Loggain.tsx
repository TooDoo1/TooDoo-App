import { useState } from 'react';
import { View, Text,TextInput, Pressable, Alert } from 'react-native';

export default function MinaDealsScreen() {
	const [selectedType, setSelectedType] = useState<'user' | 'company' | null>('user');

	const handleUserPress = () => {
		setSelectedType('user');
	};

	const handleCompanyPress = () => {
		setSelectedType('company');
	};

	const selectedGlowStyle = {
		shadowColor: '#007AFF',
		shadowOffset: { width: 0, height: 0 },
		shadowOpacity: 0.8,
		shadowRadius: 20,
	};

	const [isLoginOpen, setIsLoginOpen] = useState(false);
	
		const socialLogin = (provider: 'Google' | 'Facebook' | 'Apple') => {
			Alert.alert(
				`Fortsätt med ${provider}`,
				`Omdirigerar till ${provider}-inloggning...\n\n(Koppla ihop med ${provider} OAuth för att aktivera)`
			);
		};

	return (
		<View className="flex-1 bg-[#000b2a] px-6 pt-12">
			<Text className=" pt-10 text-3xl font-semibold text-white">In loggning:</Text>

            <View className="mt-8 rounded-2xl bg-[#0a1535] px-6 flex-row gap-3 items-center justify-center">
                <Pressable 
					className={`mb-3 mt-3 rounded-2xl w-1/2 py-3`}
					onPress={handleUserPress}
				>
	                	<Text
						className={`text-center font-medium px-6 ${selectedType === 'user' ? 'text-[#007AFF] ' : 'text-white'}`}
						style={selectedType === 'user' ? selectedGlowStyle : undefined}
					>
						Användare
					</Text>
                </Pressable>
                <View className="h-12 w-px bg-[#3e5592]" />
                <Pressable 
					className={`mb-3 mt-3 rounded-2xl py-3 w-1/2`}
					onPress={handleCompanyPress}
				>
	                	<Text
						className={`text-center font-medium px-6 ${selectedType === 'company' ? 'text-[#007AFF]' : 'text-white'}`}
						style={selectedType === 'company' ? selectedGlowStyle : undefined}
					>
						Företag
					</Text>
                </Pressable>
                
            </View>

						{selectedType === 'user' ? (
							<View>
							<View className="mt-8 rounded-2xl bg-[#0a1535] px-4 py-4">
								<Text className="text-white text-xl">Användar inloggning:</Text>
								<Text className="text-white/70 text-xs">Säkra dina erbjudanden idag genom att logga in!</Text>
								<Text className="pt-4 text-xl text-white">E-post:</Text>
								<TextInput
															placeholder="Din e-postadress"
															placeholderTextColor="rgba(255,255,255,0.45)"
															keyboardType="email-address"
															className="mt-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white"
														/>
								<Text className="pt-4 text-xl text-white">Lösenord:</Text>
								<TextInput
															placeholder="lösenord"
															placeholderTextColor="rgba(255,255,255,0.45)"
															secureTextEntry
															className="mt-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white"
														/>
								<Pressable className="mt-6 rounded-2xl bg-[#ff3b30] px-4 py-3" onPress={() => Alert.alert('Logga in', 'Fortsätt med e-post')}>
									<Text className="text-center font-medium text-white">Logga in</Text>
								</Pressable>
							</View>

							<View className="mt-2 px-4 rounded-2xl bg-[#0a1535] py-4">
							<Pressable className="mb-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3" onPress={() => socialLogin('Google')}>
							  <Text className="text-center font-medium text-white">Fortsätt med Google</Text>
						    </Pressable>

							<Pressable className="mt-2 mb-4 rounded-2xl border border-white/20 bg-white/10 px-4 py-3" onPress={() => socialLogin('Apple')}>
							  <Text className="text-center font-medium text-white">Fortsätt med Apple</Text>
						    </Pressable>

							</View>

							<View className="mt-4 flex-row justify-center">
								<Text className="text-white/70 text-md">Har du inget konto? </Text>
								<Pressable onPress={() => Alert.alert('Registrera', 'Navigerar till registrering...')}>
									<Text className="text-blue-400 text-md font-medium underline">Registrera dig här!</Text>
								</Pressable>
							</View>

							</View>
							) : null}

						{selectedType === 'company' ? (
							<View>
							<View className="mt-8 rounded-2xl bg-[#0a1535] px-4 py-4">
								<Text className="text-white text-xl">Företags inloggning:</Text>
								<Text className="text-white/70 text-xs">Skapa erbjudanden idag genom att logga in!</Text>
								<Text className="pt-4 text-xl text-white">E-post:</Text>
								<TextInput
															placeholder="Din e-postadress"
															placeholderTextColor="rgba(255,255,255,0.45)"
															keyboardType="email-address"
															className="mt-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white"
														/>
								<Text className="pt-4 text-xl text-white">Lösenord:</Text>
								<TextInput
															placeholder="lösenord"
															placeholderTextColor="rgba(255,255,255,0.45)"
															secureTextEntry
															className="mt-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white"
														/>
								<Pressable className="mt-6 rounded-2xl bg-[#ff3b30] px-4 py-3" onPress={() => Alert.alert('Logga in', 'Fortsätt med e-post')}>
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

							<View className="mt-4 flex-row justify-center">
								<Text className="text-white/70 text-md">Har ditt företag inget konto? </Text>
								<Pressable onPress={() => Alert.alert('Registrera', 'Navigerar till registrering...')}>
									<Text className="text-blue-400 text-md font-medium underline">Registrera dig här!</Text>
								</Pressable>
							</View>

							</View>
						) : null}



		</View>
	);
}
