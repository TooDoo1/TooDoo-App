import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
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
  image: string;
  deal?: boolean;
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
    image: 'https://picsum.photos/id/1025/300/200',
    deal: true,
  },
  {
    id: 'deal-2',
    title: 'Cirkus Arena',
    image: 'https://picsum.photos/id/1050/300/200',
    deal: true,
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
        image: 'https://picsum.photos/id/1025/300/200',
        deal: true,
      },
      {
        id: 'familj-2',
        title: 'Fredriksdal',
        image: 'https://picsum.photos/id/1035/300/200',
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
        image: 'https://picsum.photos/id/1040/300/200',
      },
      {
        id: 'event-2',
        title: 'Konsert',
        image: 'https://picsum.photos/id/1045/300/200',
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
        image: 'https://picsum.photos/id/1050/300/200',
      },
      {
        id: 'noje-2',
        title: 'Familjeföreställning',
        image: 'https://picsum.photos/id/1060/300/200',
        deal: true,
      },
    ],
  },
];

export default function HomeScreen() {
  const [sliderIndex, setSliderIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState<Category>('alla');
  const [isLoginOpen, setIsLoginOpen] = useState(false);
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

  const socialLogin = (provider: 'Google' | 'Facebook' | 'Apple') => {
    Alert.alert(
      `Fortsätt med ${provider}`,
      `Omdirigerar till ${provider}-inloggning...\n\n(Koppla ihop med ${provider} OAuth för att aktivera)`
    );
  };

  const handleCardPress = () => {
    router.push('/(tabs)/Erbjudanden');
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-[#000b2a]" style={styles.screen}>
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
          <Text className="mb-2 text-lg font-semibold text-white">🔥 Erbjudanden</Text>
          <CardRow cards={deals} onCardPress={handleCardPress} />
        </View>

        {filteredSections.map((section) => (
          <View key={section.id} className="px-4 pt-5">
            <Text className="mb-2 text-lg font-semibold text-white">{section.title}</Text>
            <CardRow cards={section.cards} onCardPress={handleCardPress} />
          </View>
        ))}

        <View className="mt-5 px-4">
          <Pressable onPress={() => setIsLoginOpen(true)} className="rounded-xl bg-[#ff3b30] px-4 py-3">
            <Text className="text-center font-semibold text-white">👤 Logga in</Text>
          </Pressable>
        </View>
      </ScrollView>

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

            <Pressable className="mb-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3" onPress={() => socialLogin('Facebook')}>
              <Text className="text-center font-medium text-white">Fortsätt med Facebook</Text>
            </Pressable>

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

            <Text className="text-center text-xs leading-5 text-white/50">
              Genom att logga in godkänner du våra användarvillkor och integritetspolicy.
            </Text>
          </View>
        </View>
      </Modal>
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
              <Image source={{ uri: card.image }} resizeMode="cover" className="h-full w-full" />
              {card.deal ? (
                <View className="absolute left-2 top-2 rounded-full bg-[#ff3b30] px-2 py-0.5">
                  <Text className="text-[10px] font-medium text-white">Erbjudande</Text>
                </View>
              ) : null}
            </View>
            <Text className="px-2 py-2 text-sm text-white">{card.title}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
