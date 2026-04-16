  import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  FlatList,
} from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

const ALL_CATEGORIES_ID = 'all';
const OFFERS_CATEGORY_ID = 'offers';

type CardItem = {
  id: string;
  title: string;
  image: ImageSourcePropType;
  categoryId?: string;
  categoryName?: string;
  deal?: boolean;
  orderIds?: string[];
  erbjudandepris?: number | string[];
  erbjudandeoriginalpris?: number | string[];
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
  categoryId: string;
  title: string;
  cards: CardItem[];
};

type FilterCategory = {
  id: string;
  label: string;
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
  originalPrice?: number;
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

export default function HomeScreen() {
  const [sliderIndex, setSliderIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORIES_ID);
  const [categoryFilters, setCategoryFilters] = useState<FilterCategory[]>([]);
  const [deals, setDeals] = useState<CardItem[]>([]);
  const [featuredBusinesses, setFeaturedBusinesses] = useState<CardItem[]>([]);
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const tabBarHeight = useBottomTabBarHeight();
  const scrollRef = useRef<ScrollView>(null);
  const featuredScrollRef = useRef<any>(null);
  const featuredScrollX = useRef(new Animated.Value(0)).current;
  const isInteracting = useRef(false);
  const lastInteractionTime = useRef(Date.now());
  const currentFeaturedIndex = useRef(0);
  const router = useRouter();
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'https://toodoo-backend-ejml.onrender.com';
  const { width: screenWidth } = Dimensions.get('window');
  // Decreased card width ratio to make side cards visibly occupy more space on screen
  const featuredCardWidth = Math.min(screenWidth * 0.68, 300);
  const featuredCardSpacing = 16;
  const featuredSnapInterval = featuredCardWidth + featuredCardSpacing;
  const featuredSidePadding = Math.max((screenWidth - featuredCardWidth) / 2, 20);

  useEffect(() => {
    const timer = setInterval(() => {
      setSliderIndex((prev) => (prev + 1) % sliderImages.length);
    }, 4000);

    return () => clearInterval(timer);
  }, []);

  const repeatedFeaturedBusinesses = useMemo(() => {
    if (featuredBusinesses.length === 0) return [];
    // Repeat the featured businesses many times to create a seamless infinite loop
    return Array(200).fill(featuredBusinesses).flat();
  }, [featuredBusinesses]);

  // Start perfectly in the middle of our massive array so users can comfortably manual-scroll left or right
  const INITIAL_INDEX = featuredBusinesses.length > 0 ? featuredBusinesses.length * 100 : 0;

  useEffect(() => {
    if (featuredBusinesses.length === 0) {
      return;
    }

    if (currentFeaturedIndex.current === 0 && featuredBusinesses.length > 0) {
      currentFeaturedIndex.current = INITIAL_INDEX;
    }

    const timer = setInterval(() => {
      // Don't auto-scroll if the user is currently touching the screen
      if (isInteracting.current) return;
      // Don't auto-scroll until a few seconds after they let go
      if (Date.now() - lastInteractionTime.current < 4000) return;

      currentFeaturedIndex.current += 1;
      
      const maxLength = repeatedFeaturedBusinesses.length;
      const buffer = 10;
      
      if (currentFeaturedIndex.current >= maxLength - buffer) {
        // Silently snap back to the middle BEFORE we run out of array, seamlessly
        // We match exactly the position mod the true length so it doesn't shift
        currentFeaturedIndex.current = INITIAL_INDEX + (currentFeaturedIndex.current % featuredBusinesses.length);
        if (featuredScrollRef.current?.scrollToOffset) {
          featuredScrollRef.current.scrollToOffset({ 
            offset: currentFeaturedIndex.current * featuredSnapInterval, 
            animated: false 
          });
        }
        return;
      }

      const nextOffset = currentFeaturedIndex.current * featuredSnapInterval;
      
      // Use scrollToOffset to support FlatList
      if (featuredScrollRef.current?.scrollToOffset) {
        featuredScrollRef.current.scrollToOffset({ offset: nextOffset, animated: true });
      }
    }, 3500);

    return () => clearInterval(timer);
  }, [featuredBusinesses.length, featuredSnapInterval, INITIAL_INDEX, repeatedFeaturedBusinesses.length]);

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

        const apiCategoryFilters: FilterCategory[] = categoriesRaw
          .map((category, index) => {
            const id = category.id ?? category._id ?? `category-${index}`;
            const name = category.name?.trim();
            if (!name) {
              return null;
            }

            return {
              id,
              label: name,
            };
          })
          .filter((item): item is FilterCategory => Boolean(item));

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
          const orderIds = visibleOrders.map((order, orderIndex) => order.id ?? order._id ?? `${businessId}-order-${orderIndex}`);
          const offerPrices = visibleOrders.map((order) => String(order.price ?? 0));
          const offerOriginalPrices = visibleOrders.map((order) => order.originalPrice !== undefined ? String(order.originalPrice) : '');
          const offerClaimed = visibleOrders.map((order) => String(order.claimedCount ?? 0));
          const offerAmount = visibleOrders.map((order) => String(order.maxRedemptions ?? 0));
          const offerEnd = visibleOrders.map((order) => order.orderTimeTo ?? order.validTo ?? '');

          return {
            id: businessId,
            title: business.name ?? 'Okänd verksamhet',
            image: { uri: `https://picsum.photos/seed/${encodeURIComponent(businessId)}/300/200` },
            categoryId:
              business.categoryId,
            categoryName: business.categoryName ?? (business.categoryId ? categoryNameById.get(business.categoryId) : undefined),
            deal: visibleOrders.length > 0,
            orderIds,
            erbjudandepris: offerPrices,
            erbjudandeoriginalpris: offerOriginalPrices,
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
        const shuffledBusinesses = [...cards].sort(() => Math.random() - 0.5);
        const featuredList = shuffledBusinesses.slice(0, 5);

        const nextSections: SectionItem[] = apiCategoryFilters.map((category) => ({
          id: category.id,
          categoryId: category.id,
          title: category.label,
          cards: cards.filter((card) => card.categoryId === category.id),
        }));

        const filteredSections = nextSections.filter((section) => section.cards.length > 0);

        if (!cancelled) {
          setCategoryFilters(apiCategoryFilters);
          setDeals(dealsList);
          setFeaturedBusinesses(featuredList);
          currentFeaturedIndex.current = featuredList.length > 0 ? featuredList.length * 100 : 0;
          setSections(filteredSections);
        }
      } catch {
        if (!cancelled) {
          setCategoryFilters([]);
          setDeals([]);
          setFeaturedBusinesses([]);
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
    if (activeCategory === ALL_CATEGORIES_ID) {
      return sections;
    }

    if (activeCategory === OFFERS_CATEGORY_ID) {
      return [];
    }

    return sections.filter((section) => section.categoryId === activeCategory);
  }, [activeCategory, sections]);

  const filteredDeals = useMemo(() => {
    if (activeCategory === ALL_CATEGORIES_ID || activeCategory === OFFERS_CATEGORY_ID) {
      return deals;
    }

    return deals.filter((card) => card.categoryId === activeCategory);
  }, [activeCategory, deals]);

  const categoryOptions = useMemo<FilterCategory[]>(
    () => [
      { id: ALL_CATEGORIES_ID, label: 'Alla kategorier' },
      { id: OFFERS_CATEGORY_ID, label: 'Erbjudanden' },
      ...categoryFilters,
    ],
    [categoryFilters]
  );

  useEffect(() => {
    if (!categoryOptions.some((category) => category.id === activeCategory)) {
      setActiveCategory(ALL_CATEGORIES_ID);
    }
  }, [activeCategory, categoryOptions]);

  const featuredBusiness = featuredBusinesses.length > 0
    ? featuredBusinesses[currentFeaturedIndex.current % featuredBusinesses.length]
    : undefined;



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
        claimBusinessId: card.id,
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
        orderIds: encodeListParam(card.orderIds),
        erbjudandepris: encodeListParam(card.erbjudandepris),
        erbjudandeoriginalpris: encodeListParam(card.erbjudandeoriginalpris),
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
            {categoryOptions.map((category, index) => {
              const active = category.id === activeCategory;

              return (
                <Pressable
                  key={`${category.id}-${index}`}
                  className={`rounded-full px-4 py-2 ${active ? 'bg-[#ff3b30]' : 'bg-[#eef2ff]'}`}
                  onPress={() => setActiveCategory(category.id)}>
                  <Text className={`${active ? 'text-white' : 'text-[#000b2a]'} text-xs font-medium`}>
                    {category.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {featuredBusinesses.length > 0 ? (
          <View className="px-4 pt-5">
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-lg font-semibold text-white">Utvalda företag</Text>
              
            </View>

            <Animated.FlatList
              ref={featuredScrollRef}
              data={repeatedFeaturedBusinesses}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={featuredSnapInterval}
              snapToAlignment="center"
              decelerationRate="fast"
              contentContainerStyle={{ paddingHorizontal: featuredSidePadding }}
              onScrollBeginDrag={() => {
                isInteracting.current = true;
                lastInteractionTime.current = Date.now();
              }}
              onScrollEndDrag={(event) => {
                isInteracting.current = false;
                lastInteractionTime.current = Date.now();
                let index = Math.round(event.nativeEvent.contentOffset.x / featuredSnapInterval);
                const listLength = repeatedFeaturedBusinesses.length;
                const buffer = 10;

                // Same logic as onMomentumScrollEnd for when they let go without throwing (slow drag)
                if (index >= listLength - buffer || index <= buffer) {
                  const exactMiddleIndex = INITIAL_INDEX + (index % featuredBusinesses.length);
                  index = exactMiddleIndex;
                  featuredScrollRef.current?.scrollToOffset({
                    offset: index * featuredSnapInterval,
                    animated: false
                  });
                }
                currentFeaturedIndex.current = index;
              }}
              onMomentumScrollEnd={(event) => {
                isInteracting.current = false;
                lastInteractionTime.current = Date.now();
                let index = Math.round(event.nativeEvent.contentOffset.x / featuredSnapInterval);
                const listLength = repeatedFeaturedBusinesses.length;
                const buffer = 10;
                
                // If they've scrolled near the end of the fake array, silently snap them back smoothly
                if (index >= listLength - buffer || index <= buffer) {
                  // Find the exact duplicate offset in the true middle block
                  const exactMiddleIndex = INITIAL_INDEX + (index % featuredBusinesses.length);
                  index = exactMiddleIndex;
                  featuredScrollRef.current?.scrollToOffset({
                    offset: index * featuredSnapInterval,
                    animated: false
                  });
                }
                currentFeaturedIndex.current = index;
              }}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { x: featuredScrollX } } }],
                { useNativeDriver: true }
              )}
              scrollEventThrottle={16}
              keyExtractor={(item, index) => `${item.id}-${index}`}
              getItemLayout={(data, index) => ({
                length: featuredSnapInterval,
                offset: featuredSnapInterval * index,
                index,
              })}
              initialScrollIndex={INITIAL_INDEX}
              initialNumToRender={3}
              maxToRenderPerBatch={3}
              windowSize={5}
              renderItem={({ item: business, index }) => {
                const inputRange = [
                  (index - 2) * featuredSnapInterval,
                  (index - 1) * featuredSnapInterval,
                  index * featuredSnapInterval,
                  (index + 1) * featuredSnapInterval,
                  (index + 2) * featuredSnapInterval,
                ];

                // Make them relatively bigger (scale to 0.95 instead of 0.92/0.85) so they are more prominent
                const scale = featuredScrollX.interpolate({
                  inputRange,
                  outputRange: [0.88, 0.96, 1, 0.96, 0.88],
                  extrapolate: 'clamp',
                });

                const translateY = featuredScrollX.interpolate({
                  inputRange,
                  outputRange: [15, 5, 0, 5, 15],
                  extrapolate: 'clamp',
                });

                // Reduce the intensity of the angle slightly so we see more flat contents of the image
                const rotateY = featuredScrollX.interpolate({
                  inputRange,
                  outputRange: ['30deg', '10deg', '0deg', '-10deg', '-30deg'],
                  extrapolate: 'clamp',
                });

                // Push the side cards OUTWARDS rather than inwards to spread the circle out
                const translateX = featuredScrollX.interpolate({
                  inputRange,
                  outputRange: [-10, -5, 0, 5, 10],
                  extrapolate: 'clamp',
                });

                const opacity = featuredScrollX.interpolate({
                  inputRange,
                  outputRange: [0.5, 0.9, 1, 0.9, 0.5],
                  extrapolate: 'clamp',
                });

                return (
                  <Pressable
                    className="mr-4"
                    style={{ width: featuredCardWidth, height: 248, justifyContent: 'center' }}
                    onPress={() => handleCardPress(business)}
                  >
                    <Animated.View
                      className="relative overflow-hidden rounded-3xl w-full h-full bg-[#0a1535]"
                      style={{
                        transform: [
                          { scale },
                          { translateX },
                          { translateY },
                          { perspective: 900 },
                          { rotateY },
                        ],
                        opacity,
                      }}
                    >
                      <Image
                        source={business.image}
                        resizeMode="cover"
                        className="h-full w-full"
                      />
                      <View className="absolute inset-0 bg-black/25" />
                      <View className="absolute bottom-0 left-0 right-0 p-4">
                        <View className="rounded-2xl bg-black/55 px-4 py-4">
                          <Text className="text-2xl font-semibold text-white" numberOfLines={1}>
                            {business.title}
                          </Text>
                          <Text className="mt-1 text-sm text-white/80" numberOfLines={2}>
                            {business.kortbeskrivning || 'Upptäck detta företag och deras erbjudanden.'}
                          </Text>
                        </View>
                      </View>
                    </Animated.View>
                  </Pressable>
                );
              }}
            />
          </View>
        ) : null}

        <View className="px-4 pt-5">
          <Text className="mb-2 text-lg font-semibold text-white">Erbjudanden</Text>
          {activeCategory !== OFFERS_CATEGORY_ID && isLoadingData ? (
            <Text className="text-white/70">Laddar...</Text>
          ) : (
            <CardRow cards={filteredDeals} onCardPress={handleCardPress} />
          )}
        </View>

        {filteredSections.map((section, index) => (
          <View key={`${section.id}-${index}`} className="px-4 pt-5">
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
        {cards.map((card, index) => (
          <Pressable key={`${card.id}-${index}`} className="w-40 overflow-hidden rounded-2xl bg-[#000b2a]" onPress={() => onCardPress?.(card)}>
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
