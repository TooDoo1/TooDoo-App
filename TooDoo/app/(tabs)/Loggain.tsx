import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';

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
							<View className="mt-8 rounded-2xl bg-[#0a1535] px-4 py-4">
								<Text className="text-white">Användar-inloggning</Text>
							</View>
						) : null}

						{selectedType === 'company' ? (
							<View className="mt-8 rounded-2xl bg-[#0a1535] px-4 py-4">
								<Text className="text-white">Företags-inloggning</Text>
							</View>
						) : null}



		</View>
	);
}
