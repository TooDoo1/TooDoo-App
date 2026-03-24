import { View, Text } from 'react-native';

export default function MinaDealsScreen() {
    return (
        <View className="flex-1 items-center justify-center bg-[#000b2a] px-6">
            <Text className="text-2xl font-semibold text-white">Erbjudanden</Text>
            <Text className="mt-2 text-center text-white/70">Här visas aktuella erbjudanden.</Text>
        </View>
    );
}