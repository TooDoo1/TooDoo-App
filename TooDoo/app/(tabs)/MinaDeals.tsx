import { View, Text } from 'react-native';

export default function MinaDealsScreen() {
	return (
		<View className="bg-[#000b2a] px-6 pt-24 h-full">
			<Text className="text-3xl text-center font-semibold text-white">Mina Deals</Text>
			{/* <Text className="mt-2 text-center text-white/70">Här visas dina sparade deals.</Text> */}
            <Text className="mt-2 pt-4 text-xl text-center text-white/70">0 av 3 aktiva</Text>
		</View>
	);
}
