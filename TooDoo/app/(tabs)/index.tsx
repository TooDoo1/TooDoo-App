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
  erbjudandepris?: number | string[];
  Adress: string;
  latitude?: number;
  longitude?: number;
  Telefon?: string;
  Website: string;
  kortbeskrivning: string;
  långbeskrivning: string;
  erbjudande?: string | string[];
  erbjudandeclaimade?: number | string[];
  erbjudandemängd?: number | string[];
  erbjudandelängd?: string | string[];
};

type SectionItem = {
  id: string;
  category: Exclude<Category, 'alla' | 'erbjudanden'>;
  title: string;
  cards: CardItem[];
};

type ApiCategory = { id?: string; _id?: string; name?: string };
type ApiBusiness = {
  id?: string;
  _id?: string;
  name?: string;
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  address?: string;
  city?: string;
  categoryId?: string;
  categoryName?: string;
  status?: string;
  latitude?: number;
  longitude?: number;
};
type ApiOrder = {
  id?: string;
  _id?: string;
  title?: string;
  price?: number;
  maxRedemptions?: number;
  claimedCount?: number;
  orderTimeFrom?: string;
  orderTimeTo?: string;
  validTo?: string;
  businessId?: string | { id?: string; _id?: string };
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

const mapCategoryNameToKey = (name?: string): Exclude<Category, 'alla' | 'erbjudanden'> => {
  const value = (name ?? '').toLowerCase();
  if (value.includes('familj')) return 'familj';
  if (value.includes('nöje') || value.includes('noje')) return 'noje';
  if (value.includes('restaurang')) return 'restauranger';
  if (value.includes('mat')) return 'mat';
  if (value.includes('sport')) return 'sport';
  return 'event';
};

export default function HomeScreen() {
  const [sliderIndex, setSliderIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState<Category>('alla');
  const [deals, setDeals] = useState<CardItem[]>([]);
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const tabBarHeight = useBottomTabBarHeight();
  const scrollRef = useRef<ScrollView>(null);
  const router = useRouter();
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'https://toodoo-backend-ejml.onrender.com';

  useEffect(() => {
    const timer = setInterval(() => {
      setSliderIndex((prev) => (prev + 1) % sliderImages.length);
    }, 4000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadHomeData = async () => {
      setIsLoadingData(true);
      try {
        const [categoryRes, businessRes, ordersRes] = await Promise.all([
          fetch(`${apiBaseUrl}/category`),
          fetch(`${apiBaseUrl}/business?status=APPROVED`),
          fetch(`${apiBaseUrl}/orders`),
        ]);

        const categoryJson = await categoryRes.json().catch(() => []);
        const businessJson = await businessRes.json().catch(() => []);
        const ordersJson = await ordersRes.json().catch(() => []);

        const categoriesRaw: ApiCategory[] = Array.isArray(categoryJson)
          ? categoryJson
          : Array.isArray(categoryJson?.categories)
            ? categoryJson.categories
            : Array.isArray(categoryJson?.data)
              ? categoryJson.data
              : [];

        const businessesRaw: ApiBusiness[] = Array.isArray(businessJson)
          ? businessJson
          : Array.isArray(businessJson?.businesses)
            ? businessJson.businesses
            : Array.isArray(businessJson?.data)
              ? businessJson.data
              : [];

        const ordersRaw: ApiOrder[] = Array.isArray(ordersJson)
          ? ordersJson
          : Array.isArray(ordersJson?.orders)
            ? ordersJson.orders
            : Array.isArray(ordersJson?.data)
              ? ordersJson.data
              : [];

        const categoryNameById = new Map<string, string>();
        categoriesRaw.forEach((category) => {
          const id = category.id ?? category._id;
          if (id && category.name) {
            categoryNameById.set(id, category.name);
          }
        });

        const ordersByBusinessId = new Map<string, ApiOrder[]>();
        ordersRaw.forEach((order) => {
          const businessId =
            typeof order.businessId === 'string'
              ? order.businessId
              : order.businessId?.id ?? order.businessId?._id;

          if (!businessId) {
            return;
          }

          if (!ordersByBusinessId.has(businessId)) {
            ordersByBusinessId.set(businessId, []);
          }
          ordersByBusinessId.get(businessId)?.push(order);
        });

        const nowMs = Date.now();

        const approvedBusinesses = businessesRaw.filter(
          (business) => (business.status ?? 'APPROVED').toUpperCase() === 'APPROVED'
        );

        const cards: CardItem[] = approvedBusinesses.map((business, index) => {
          const businessId = business.id ?? business._id ?? `business-${index}`;
          const businessOrders = ordersByBusinessId.get(businessId) ?? [];
          const visibleOrders = businessOrders.filter((order) => {
            if (!order.orderTimeFrom) {
              return true;
            }

            const fromMs = new Date(order.orderTimeFrom).getTime();
            return Number.isFinite(fromMs) && fromMs <= nowMs;
          });

          const offers = visibleOrders.map((order) => order.title ?? 'Erbjudande');
          const offerPrices = visibleOrders.map((order) => String(order.price ?? 0));
          const offerClaimed = visibleOrders.map((order) => String(order.claimedCount ?? 0));
          const offerAmount = visibleOrders.map((order) => String(order.maxRedemptions ?? 0));
          const offerEnd = visibleOrders.map((order) => order.orderTimeTo ?? order.validTo ?? '');

          return {
            id: businessId,
            title: business.name ?? 'Okänd verksamhet',
            image: { uri: `https://picsum.photos/seed/${encodeURIComponent(businessId)}/300/200` },
            deal: visibleOrders.length > 0,
            erbjudandepris: offerPrices,
            Adress: [business.address, business.city].filter(Boolean).join(', ') || 'Adress saknas',
            latitude: business.latitude,
            longitude: business.longitude,
            Telefon: business.contactPhone ?? undefined,
            Website: business.website ?? '',
            kortbeskrivning: business.description ?? '',
            långbeskrivning: business.description ?? '',
            erbjudande: offers,
            erbjudandeclaimade: offerClaimed,
            erbjudandemängd: offerAmount,
            erbjudandelängd: offerEnd,
          };
        });

        const dealsList = cards.filter((card) => card.deal);

        const sectionBuckets: Record<Exclude<Category, 'alla' | 'erbjudanden'>, CardItem[]> = {
          familj: [],
          noje: [],
          restauranger: [],
          event: [],
          mat: [],
          sport: [],
        };

        cards.forEach((card, index) => {
          const business = approvedBusinesses[index];
          const categoryName = business?.categoryName ?? (business?.categoryId ? categoryNameById.get(business.categoryId) : undefined);
          const key = mapCategoryNameToKey(categoryName);
          sectionBuckets[key].push(card);
        });

        const nextSections: SectionItem[] = [
          { id: 'familj', category: 'familj', title: 'Familj', cards: sectionBuckets.familj },
          { id: 'noje', category: 'noje', title: 'Nöje', cards: sectionBuckets.noje },
          { id: 'restauranger', category: 'restauranger', title: 'Restauranger', cards: sectionBuckets.restauranger },
          { id: 'event', category: 'event', title: 'Event', cards: sectionBuckets.event },
          { id: 'mat', category: 'mat', title: 'Mat & Dryck', cards: sectionBuckets.mat },
          { id: 'sport', category: 'sport', title: 'Sport', cards: sectionBuckets.sport },
        ].filter((section) => section.cards.length > 0);

        if (!cancelled) {
          setDeals(dealsList);
          setSections(nextSections);
        }
      } catch {
        if (!cancelled) {
          setDeals([]);
          setSections([]);
          Alert.alert('Fel', 'Kunde inte ladda startsidan just nu.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingData(false);
        }
      }
    };

    loadHomeData();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  const filteredSections = useMemo(() => {
    if (activeCategory === 'alla' || activeCategory === 'erbjudanden') {
      return sections;
    }

    return sections.filter((section) => section.category === activeCategory);
  }, [activeCategory, sections]);



  const handleCardPress = (card: CardItem) => {
    const encodeListParam = (value: string | string[] | number | number[] | Date | Date[] | undefined) => {
      if (value === undefined || value === null) {
        return undefined;
      }

      if (Array.isArray(value)) {
        return JSON.stringify(
          value.map((item) => (item instanceof Date ? item.toISOString() : String(item)))
        );
      }

      return value instanceof Date ? value.toISOString() : String(value);
    };

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
        erbjudande: encodeListParam(card.erbjudande),
        erbjudandepris: encodeListParam(card.erbjudandepris),
        erbjudandeclaimade: encodeListParam(card.erbjudandeclaimade),
        erbjudandemängd: encodeListParam(card.erbjudandemängd),
        erbjudandelängd: encodeListParam(card.erbjudandelängd),
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
          {isLoadingData ? (
            <Text className="text-white/70">Laddar...</Text>
          ) : (
            <CardRow cards={deals} onCardPress={handleCardPress} />
          )}
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
