  import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

type Category = 'alla' | 'familj' | 'noje' | 'restauranger' | 'erbjudanden' | 'event' | 'mat' | 'sport';

type CardItem = {
  id: string;
  title: string;
  image: ImageSourcePropType;
  deal?: boolean;
  erbjudandepris?: number;
  Adress: string;
  latitude?: number;
  longitude?: number;
  Telefon?: string;
  Website: string;
  kortbeskrivning: string;
  långbeskrivning: string;
  erbjudande?: string;
  erbjudandeclaimade?: number;
  erbjudandemängd?: number;
  erbjudandelängd?: Date;
};

type SectionItem = {
  id: string;
  category: Exclude<Category, 'alla' | 'erbjudanden'>;
  title: string;
  cards: CardItem[];
};

const sliderImages = [
  'https://picsum.photos/id/1011/800/400',
  'https://picsum.photos/id/1015/800/400',
  'https://picsum.photos/id/1016/800/400',
];

const categories: { label: string; value: Category }[] = [
  { label: 'Alla kategorier', value: 'alla' },
  { label: 'Familj', value: 'familj' },
  { label: 'Nöje', value: 'noje' },
  { label: 'Restauranger', value: 'restauranger' },
  { label: 'Erbjudanden', value: 'erbjudanden' },
  { label: 'Event', value: 'event' },
  { label: 'Mat & Dryck', value: 'mat' },
  { label: 'Sport', value: 'sport' },
];

const deals: CardItem[] = [
  {
    id: 'deal-1',
    title: 'Dunkers kulturhus',
    image: { uri: 'https://picsum.photos/id/1025/300/200' },
    deal: true,
    erbjudandepris: 99,
    erbjudande: '2 för 1 på entrébiljetter',
    erbjudandeclaimade: 72,
    erbjudandemängd: 120,
    erbjudandelängd: new Date('2026-06-30'),
    Adress: 'Södra Vallgatan 18, Helsingborg',
    latitude: 56.0469,
    longitude: 12.6945,
    Telefon: '+46 42-10 44 00',
    Website: 'https://example.com/dunkers-kulturhus',
    kortbeskrivning: 'En fantastisk kulturhus för familjer.',
    långbeskrivning: 'Dunkers kulturhus är en utmärkt plats för familjer att utforska och njuta av kultur och underhållning.'
  },
  {
    id: 'deal-2',
    title: 'Cirkus Arena',
    image: { uri: 'https://picsum.photos/id/1050/300/200' },
    deal: true,
    erbjudandepris: 149,
    erbjudande: '25% rabatt på familjepaket',
    erbjudandeclaimade: 31,
    erbjudandemängd: 80,
    erbjudandelängd: new Date('2026-05-15'),
    Adress: 'Södra Vallgatan 18, Helsingborg',
    latitude: 56.0515,
    longitude: 12.7062,
    Telefon: '+46 42-10 55 20',
    Website: 'https://example.com/cirkus-arena',
    kortbeskrivning: 'Spännande cirkusföreställningar för alla åldrar.',
    långbeskrivning: 'Cirkus Arena erbjuder spännande och underhållande cirkusföreställningar som passar både barn och vuxna.'
  },
];

const sections: SectionItem[] = [
  {
    id: 'familj',
    category: 'familj',
    title: 'Familj',
    cards: [
      {
        id: 'familj-1',
        title: 'Dunkers kulturhus',
        image: { uri: 'https://picsum.photos/id/1025/300/200' },
        deal: true,
        erbjudandepris: 89,
        erbjudande: 'Gratis barnbiljett med vuxen',
        erbjudandeclaimade: 40,
        erbjudandemängd: 60,
        erbjudandelängd: new Date('2026-04-30'),
        Adress: 'Svärdsgatan 3, Helsingborg',
        latitude: 56.0469,
        longitude: 12.6945,
        Telefon: '+46 42-10 44 00',
        Website: 'https://dunkerskulturhus.se/',
        kortbeskrivning: 'En fantastisk kulturhus för familjer.',
        långbeskrivning: 'Dunkers kulturhus är en utmärkt plats för familjer att utforska och njuta av kultur och underhållning.'
      },
      {
        id: 'familj-2',
        title: 'Fredriksdal',
        image: { uri: 'https://picsum.photos/id/1035/300/200' },
        Adress: 'Södra Vallgatan 18, Helsingborg',
        latitude: 56.0712,
        longitude: 12.7149,
        Telefon: '+46 42-10 45 10',
        Website: 'https://example.com/fredriksdal',
        kortbeskrivning: 'En vacker park och friluftsmuseum.',
        långbeskrivning: 'Fredriksdal är en vacker park och friluftsmuseum som erbjuder en mängd aktiviteter och evenemang för hela familjen att njuta av.'
      },
    ],
  },
  {
    id: 'event',
    category: 'event',
    title: 'Event',
    cards: [
      {
        id: 'event-1',
        title: 'Live Show',
        image: { uri: 'https://picsum.photos/id/1040/300/200' },
        Adress: 'Södra Vallgatan 18, Helsingborg',
        latitude: 56.0448,
        longitude: 12.6992,
        Telefon: '+46 42-10 60 30',
        Website: 'https://example.com/live-show',
        kortbeskrivning: 'En spännande live show med musik och dans.',
        långbeskrivning: 'Upplev en spännande live show som kombinerar musik, dans och spektakulära effekter för en oförglömlig kväll.'
      },
      {
        id: 'event-2',
        title: 'Konsert',
        image: { uri: 'https://picsum.photos/id/1045/300/200' },
        Adress: 'Södra Vallgatan 18, Helsingborg',
        latitude: 56.0427,
        longitude: 12.7016,
        Telefon: '+46 42-10 61 40',
        Website: 'https://example.com/konsert',
        kortbeskrivning: 'En fantastisk konsert med lokala och internationella artister.',
        långbeskrivning: 'Njut av en fantastisk konsert där både lokala och internationella artister samlas för att leverera en oförglömlig musikupplevelse.'
      },
      {
        id: 'event-3',
        title: 'Dukers Kulturhus',
        image: require('../../assets/images/testbild.jpg'),
        Adress: 'Södra Vallgatan 18, Helsingborg',
        latitude: 56.0469,
        longitude: 12.6945,
        Telefon: '+46 42-10 44 00',
        Website: 'https://dunkerskulturhus.se/',
        kortbeskrivning: 'En fantastisk kulturhus för familjer.',
        långbeskrivning: 'Dunkers kulturhus är en utmärkt plats för familjer att utforska och njuta av kultur och underhållning.'
      },
    ],
  },
  {
    id: 'noje',
    category: 'noje',
    title: 'Cirkus',
    cards: [
      {
        id: 'noje-1',
        title: 'Cirkus Arena',
        image: { uri: 'https://picsum.photos/id/1050/300/200' },
        Adress: 'Södra Vallgatan 18, Helsingborg',
        latitude: 56.0515,
        longitude: 12.7062,
        Telefon: '+46 42-10 55 20',
        Website: 'https://example.com/cirkus-arena',
        kortbeskrivning: 'Spännande cirkusföreställningar för alla åldrar.',
        långbeskrivning: 'Cirkus Arena erbjuder spännande och underhållande cirkusföreställningar som passar både barn och vuxna.'
      },
      {
        id: 'noje-2',
        title: 'Familjeföreställning',
        image: { uri: 'https://picsum.photos/id/1060/300/200' },
        deal: true,
        erbjudandepris: 0,
        erbjudande: 'Barn går gratis söndagar',
        erbjudandeclaimade: 18,
        erbjudandemängd: 45,
        erbjudandelängd: new Date('2026-05-31'),
        Adress: 'Södra Vallgatan 18, Helsingborg',
        latitude: 56.0498,
        longitude: 12.7094,
        Telefon: '+46 42-10 62 90',
        Website: 'https://example.com/familjeforestallning',
        kortbeskrivning: 'En rolig familjeföreställning med clowner och akrobater.',
        långbeskrivning: 'Upplev en rolig familjeföreställning som kombinerar clowner, akrobater och magi för en underhållande dag för hela familjen.'
      },
    ],
  },
];

export default function HomeScreen() {
  const [sliderIndex, setSliderIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState<Category>('alla');
  const tabBarHeight = useBottomTabBarHeight();
  const scrollRef = useRef<ScrollView>(null);
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      setSliderIndex((prev) => (prev + 1) % sliderImages.length);
    }, 4000);

    return () => clearInterval(timer);
  }, []);

  const filteredSections = useMemo(() => {
    if (activeCategory === 'alla' || activeCategory === 'erbjudanden') {
      return sections;
    }

    return sections.filter((section) => section.category === activeCategory);
  }, [activeCategory]);



  const handleCardPress = (card: CardItem) => {
    const remoteImageUri =
      typeof card.image === 'object' && card.image && 'uri' in card.image && typeof card.image.uri === 'string'
        ? card.image.uri
        : '';

    router.push({
      pathname: '/(tabs)/Erbjudanden',
      params: {
        mapResetNonce: `${Date.now()}-${Math.random()}`,
        id: card.id,
        title: card.title,
        deal: card.deal ? '1' : '0',
        imageUri: remoteImageUri,
        Adress: card.Adress,
        latitude: card.latitude?.toString(),
        longitude: card.longitude?.toString(),
        Telefon: card.Telefon ?? '+46 42-10 00 00',
        Website: card.Website,
        kortbeskrivning: card.kortbeskrivning,
        långbeskrivning: card.långbeskrivning,
        erbjudande: card.erbjudande,
        erbjudandepris: card.erbjudandepris?.toString(),
        erbjudandeclaimade: card.erbjudandeclaimade?.toString(),
        erbjudandemängd: card.erbjudandemängd?.toString(),
        erbjudandelängd: card.erbjudandelängd?.toISOString(),
      },
    });
  };

  return (
    <SafeAreaView edges={['left', 'right']} className="flex-1 bg-[#000b2a]" style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 16 }}>
        <View className="relative h-60 overflow-hidden rounded-b-3xl" style={styles.sliderContainer}>
          {sliderImages.map((imageUri, idx) => (
            <Image
              key={imageUri}
              source={{ uri: imageUri }}
              resizeMode="cover"
              style={[styles.sliderImage, { opacity: idx === sliderIndex ? 1 : 0 }]}
              className="absolute inset-0 h-full w-full"
            />
          ))}
        </View>

        <View className="px-4 pt-4">
          <TextInput
            placeholder="Vad vill du göra idag?"
            placeholderTextColor="#475569"
            className="w-full rounded-full bg-white px-4 py-4 text-black"
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-4 px-4">
          <View className="flex-row gap-2">
            {categories.map((category) => {
              const active = category.value === activeCategory;

              return (
                <Pressable
                  key={category.value}
                  className={`rounded-full px-4 py-2 ${active ? 'bg-[#ff3b30]' : 'bg-[#eef2ff]'}`}
                  onPress={() => setActiveCategory(category.value)}>
                  <Text className={`${active ? 'text-white' : 'text-[#000b2a]'} text-xs font-medium`}>
                    {category.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <View className="px-4 pt-5">
          <Text className="mb-2 text-lg font-semibold text-white">Erbjudanden</Text>
          <CardRow cards={deals} onCardPress={handleCardPress} />
        </View>

        {filteredSections.map((section) => (
          <View key={section.id} className="px-4 pt-5">
            <Text className="mb-2 text-lg font-semibold text-white">{section.title}</Text>
            <CardRow cards={section.cards} onCardPress={handleCardPress} />
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000b2a',
  },
  scroll: {
    flex: 1,
  },
  sliderContainer: {
    height: 240,
    overflow: 'hidden',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  sliderImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
});

function CardRow({ cards, onCardPress }: { cards: CardItem[]; onCardPress?: (card: CardItem) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View className="flex-row gap-3 pb-2">
        {cards.map((card) => (
          <Pressable key={card.id} className="w-40 overflow-hidden rounded-2xl bg-[#000b2a]" onPress={() => onCardPress?.(card)}>
            <View className="relative h-28 w-full">
              <Image source={card.image} resizeMode="cover" className="h-full w-full" />
              {card.deal ? (
                <DealTag />
              ) : null}
            </View>
            <Text className="px-2 py-2 text-sm text-white">{card.title}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function DealTag() {
  const wobble = useRef(new Animated.Value(0)).current;
  const rotate = wobble.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-3deg', '0deg', '3deg'],
  });

  useEffect(() => {
    const wobbleAnimation = Animated.loop(
      Animated.sequence([
        Animated.delay(1500),
        Animated.timing(wobble, { toValue: -1, duration: 110, useNativeDriver: true }),
        Animated.timing(wobble, { toValue: 1, duration: 110, useNativeDriver: true }),
        Animated.timing(wobble, { toValue: -0.6, duration: 100, useNativeDriver: true }),
        Animated.timing(wobble, { toValue: 0.6, duration: 100, useNativeDriver: true }),
        Animated.timing(wobble, { toValue: 0, duration: 100, useNativeDriver: true }),
      ])
    );

    wobbleAnimation.start();

    return () => {
      wobbleAnimation.stop();
      wobble.setValue(0);
    };
  }, [wobble]);

  return (
    <Animated.View
      className="absolute left-2 top-2 rounded-full bg-[#ff3b30] px-2 py-0.5"
      style={{ transform: [{ rotate }] }}
    >
      <Text className="text-[10px] font-medium text-white">Erbjudande</Text>
    </Animated.View>
  );
}
