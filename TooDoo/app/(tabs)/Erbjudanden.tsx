import { useLocalSearchParams } from 'expo-router';
import { Image, ImageSourcePropType, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const localImagesById: Record<string, ImageSourcePropType> = {
    'event-3': require('../../assets/images/testbild.jpg'),
};

export default function ErbjudandenScreen() {
    const { id, title, deal, imageUri } = useLocalSearchParams<{
        id?: string;
        title?: string;
        deal?: string;
        imageUri?: string;
    }>();

    const imageSource = imageUri ? { uri: imageUri } : id ? localImagesById[id] : undefined;

    return (
        <View className="flex-1 bg-[#000b2a]">
            {imageSource ? (
                <View className="relative h-1/3 w-full overflow-hidden rounded-xl">
                    <Image source={imageSource} className="h-full w-full" />
                    <LinearGradient
                        colors={['rgba(0, 11, 42, 0)', '#000b2a']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            height: 96,
                        }}
                    />
                </View>
            ) : null}
            <Text className="text-3xl font-semibold text-white px-6 mt-4">Erbjudanden</Text>
            

            {title ? (
                <View className=" mt-6 overflow-hidden rounded-2xl bg-[#0a1535] p-4 mx-6">
                    <Text className=" text-2xl font-semibold text-white">{title}</Text>
                    <Text className="mt-2 text-white/70">{deal === '1' ? 'Denna aktivitet har ett erbjudande.' : 'Ingen aktiv rabatt just nu.'}</Text>
                    {id ? <Text className="mt-1 text-xs text-white/50">ID: {id}</Text> : null}
                </View>
            ) : (
                <Text className="mt-4 text-white/70">Välj ett kort från startsidan för att se detaljer här.</Text>
            )}
        </View>
    );
}