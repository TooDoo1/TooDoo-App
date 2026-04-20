import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useAppReady } from '@/context/app-ready-context';

const ALL_CATEGORIES_ID = 'all';
const OFFERS_CATEGORY_ID = 'offers';
const FEATURED_REPEAT_COUNT = 600;

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
  const [activeFeaturedDot, setActiveFeaturedDot] = useState(0);
  const activeFeaturedDotRef = useRef(0);
  const isInteracting = useRef(false);
  const lastInteractionTime = useRef(Date.now());
  const currentFeaturedIndex = useRef(0);
  const router = useRouter();
  const { markDataReady } = useAppReady();
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'https://toodoo-backend-ejml.onrender.com';
  const { width: screenWidth } = Dimensions.get('window');
  // Decreased card width ratio to make side cards visibly occupy more space on screen
  const featuredCardWidth = Math.min(screenWidth * 0.68, 300);
  const featuredCardSpacing = 8;
  const featuredSnapInterval = featuredCardWidth + featuredCardSpacing;
  const featuredSidePadding = Math.max((screenWidth - featuredSnapInterval) / 2, 0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSliderIndex((prev) => (prev + 1) % sliderImages.length);
    }, 4000);

    return () => clearInterval(timer);
  }, []);

  const repeatedFeaturedBusinesses = useMemo(() => {
    if (featuredBusinesses.length === 0) return [];
    // Repeat the featured businesses many times to create a seamless infinite loop
    return Array(FEATURED_REPEAT_COUNT).fill(featuredBusinesses).flat();
  }, [featuredBusinesses]);

  // Start perfectly in the middle of our massive array so users can comfortably manual-scroll left or right
  const INITIAL_INDEX =
    featuredBusinesses.length > 0 ? featuredBusinesses.length * Math.floor(FEATURED_REPEAT_COUNT / 2) : 0;

  const FEATURED_RECENTER_BUFFER = 10;

  const recenterFeaturedIndexIfNeeded = useCallback(
    (
      rawIndex: number,
      opts?: {
        animated?: boolean;
        applyScroll?: boolean;
      }
    ) => {
      const animated = opts?.animated ?? false;
      const applyScroll = opts?.applyScroll ?? true;
    const featuredCount = featuredBusinesses.length;
    if (featuredCount === 0) {
      return { index: rawIndex, didRecenter: false };
    }

    const listLength = repeatedFeaturedBusinesses.length;
    if (listLength === 0) {
      return { index: rawIndex, didRecenter: false };
    }

    const nearEnd = rawIndex >= listLength - FEATURED_RECENTER_BUFFER;
    const nearStart = rawIndex <= FEATURED_RECENTER_BUFFER;

    if (!nearEnd && !nearStart) {
      return { index: rawIndex, didRecenter: false };
    }

    // Snap to the equivalent position in the middle block for a seamless wrap.
    const wrappedIndex =
      INITIAL_INDEX + ((rawIndex % featuredCount) + featuredCount) % featuredCount;

    if (wrappedIndex !== rawIndex) {
      if (applyScroll) {
        featuredScrollRef.current?.scrollToOffset?.({
          offset: wrappedIndex * featuredSnapInterval,
          animated,
        });
      }

      return { index: wrappedIndex, didRecenter: true };
    }

    return { index: rawIndex, didRecenter: false };
    },
    [
      featuredBusinesses.length,
      INITIAL_INDEX,
      featuredSnapInterval,
      featuredSidePadding,
      repeatedFeaturedBusinesses.length,
    ]
  );

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

      const { index: wrappedIndex, didRecenter } = recenterFeaturedIndexIfNeeded(currentFeaturedIndex.current);
      currentFeaturedIndex.current = wrappedIndex;

      if (didRecenter) return;

      const nextOffset = currentFeaturedIndex.current * featuredSnapInterval;
      
      // Use scrollToOffset to support FlatList
      if (featuredScrollRef.current?.scrollToOffset) {
        featuredScrollRef.current.scrollToOffset({ offset: nextOffset, animated: true });
      }
    }, 3500);

    return () => clearInterval(timer);
  }, [featuredBusinesses.length, featuredSnapInterval, INITIAL_INDEX, repeatedFeaturedBusinesses.length, recenterFeaturedIndexIfNeeded]);

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
          currentFeaturedIndex.current =
            featuredList.length > 0 ? featuredList.length * Math.floor(FEATURED_REPEAT_COUNT / 2) : 0;
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
          markDataReady();
        }
      }
    };

    loadHomeData();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, markDataReady]);

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

  const isSectionEnlarged = useCallback((sectionTitle: string) => {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
    const name = sectionTitle.toLowerCase();

    if (name.includes('food') || name.includes('mat') || name.includes('restaurang')) {
      return hour >= 11 && hour < 13;
    }
    if (name.includes('entertainment') || name.includes('underhållning') || name.includes('family') || name.includes('familj')) {
      return day === 5 || day === 6; // Friday or Saturday
    }
    if (name.includes('sport') || name.includes('träning') || name.includes('fitness')) {
      return hour >= 15;
    }
    if (name.includes('shop') || name.includes('shopping') || name.includes('butik')) {
      return (day === 0 || day === 6) && hour >= 11 && hour < 16; // Sat/Sun 11-16
    }
    return false;
  }, []);

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
          <View className="pt-5">
            <View className="mb-2 px-4 flex-row items-center justify-between">
              <Text className="text-lg font-semibold text-white">Utvalda företag</Text>
              
            </View>

            <Animated.FlatList
              ref={featuredScrollRef}
              data={repeatedFeaturedBusinesses}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={featuredSnapInterval}
              snapToAlignment="start"
              decelerationRate="fast"
              contentContainerStyle={{ paddingHorizontal: featuredSidePadding }}
              onScrollBeginDrag={() => {
                isInteracting.current = true;
                lastInteractionTime.current = Date.now();
              }}
              onScrollEndDrag={(event) => {
                isInteracting.current = false;
                lastInteractionTime.current = Date.now();

                const rawIndex = Math.round(
                  event.nativeEvent.contentOffset.x / featuredSnapInterval
                );
                const { index: snappedIndex, didRecenter } = recenterFeaturedIndexIfNeeded(rawIndex, {
                  animated: false,
                  applyScroll: false,
                });

                // If we're close to the wrap boundary, FlatList hasn't been re-centered yet.
                // Keep the animation aligned with what is actually on-screen.
                currentFeaturedIndex.current = didRecenter ? rawIndex : snappedIndex;
              }}
              onMomentumScrollEnd={(event) => {
                const currentOffsetX = event.nativeEvent.contentOffset.x;
                const rawIndex = Math.round(currentOffsetX / featuredSnapInterval);
                // Let FlatList handle snap. Only do wrap-recenter when we hit near edges.
                const { index: snappedIndex } = recenterFeaturedIndexIfNeeded(rawIndex, {
                  animated: false,
                  applyScroll: true,
                });
                currentFeaturedIndex.current = snappedIndex;
              }}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { x: featuredScrollX } } }],
                {
                  useNativeDriver: true,
                  listener: (event: any) => {
                    const offsetX = event.nativeEvent.contentOffset.x;
                    const count = featuredBusinesses.length;
                    if (count === 0) return;
                    const rawIndex = Math.round(offsetX / featuredSnapInterval);
                    const dotIndex = ((rawIndex % count) + count) % count;
                    if (dotIndex !== activeFeaturedDotRef.current) {
                      activeFeaturedDotRef.current = dotIndex;
                      setActiveFeaturedDot(dotIndex);
                    }
                  },
                }
              )}
              scrollEventThrottle={16}
              keyExtractor={(item, index) => `${item.id}-${index}`}
              getItemLayout={(data, index) => ({
                length: featuredSnapInterval,
                offset: featuredSidePadding + featuredSnapInterval * index,
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

                const scale = featuredScrollX.interpolate({
                  inputRange,
                  outputRange: [0.8, 0.88, 1, 0.88, 0.8],
                  extrapolate: 'clamp',
                });

                const opacity = featuredScrollX.interpolate({
                  inputRange,
                  outputRange: [0.35, 0.55, 1, 0.55, 0.35],
                  extrapolate: 'clamp',
                });

                return (
                  <Pressable
                    style={{
                      width: featuredCardWidth,
                      height: 248,
                      justifyContent: 'center',
                      marginHorizontal: featuredCardSpacing / 2,
                    }}
                    onPress={() => handleCardPress(business)}
                  >
                    <Animated.View
                      style={{
                        width: '100%',
                        height: '100%',
                        transform: [{ scale }],
                        opacity,
                      }}
                    >
                      <View
                        className="relative w-full h-full bg-[#0a1535]"
                        style={styles.featuredCardClip}
                      >
                        <Image
                          source={business.image}
                          resizeMode="cover"
                          fadeDuration={0}
                          style={styles.featuredCardImage}
                        />
                        <View className="absolute inset-0 bg-black/25" />
                        {business.deal ? (
                          <View className="absolute left-3 top-3 rounded-full bg-[#ff3b30] px-3 py-1">
                            <Text className="text-sm font-semibold text-white">Erbjudande</Text>
                          </View>
                        ) : null}
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
                      </View>
                    </Animated.View>
                  </Pressable>
                );
              }}
            />

            <View style={styles.dotsRow}>
              {featuredBusinesses.map((_, dotIdx) => (
                <View
                  key={dotIdx}
                  style={[
                    styles.dot,
                    dotIdx === activeFeaturedDot && styles.dotActive,
                  ]}
                />
              ))}
            </View>
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

        {activeCategory !== ALL_CATEGORIES_ID && activeCategory !== OFFERS_CATEGORY_ID && filteredSections.length > 0 ? (
          <View className="px-4 pt-5">
            <Text className="mb-2 text-lg font-semibold text-white">{filteredSections[0].title}</Text>
            <CardGrid cards={filteredSections[0].cards} onCardPress={handleCardPress} />
          </View>
        ) : (
          filteredSections.map((section, index) => (
            <View key={`${section.id}-${index}`} className="px-4 pt-5">
              <Text className="mb-2 text-lg font-semibold text-white">{section.title}</Text>
              <CardRow cards={section.cards} onCardPress={handleCardPress} enlarged={isSectionEnlarged(section.title)} />
            </View>
          ))
        )}
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
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotActive: {
    backgroundColor: '#ff3b30',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  featuredCardClip: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  featuredCardImage: {
    width: '100%',
    height: '100%',
  },
});

function CardRow({ cards, onCardPress, enlarged }: { cards: CardItem[]; onCardPress?: (card: CardItem) => void; enlarged?: boolean }) {
  if (enlarged) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-3 pb-2">
          {cards.map((card, index) => (
            <Pressable key={`${card.id}-${index}`} className="w-64 overflow-hidden rounded-2xl bg-[#0a1535]" onPress={() => onCardPress?.(card)}>
              <View className="relative h-44 w-full">
                <Image source={card.image} resizeMode="cover" className="h-full w-full" />
                <View className="absolute inset-0 bg-black/20" />
                {card.deal ? <DealTag /> : null}
                <View className="absolute bottom-0 left-0 right-0 p-3">
                  <View className="rounded-xl bg-black/50 px-3 py-2">
                    <Text className="text-lg font-semibold text-white" numberOfLines={1}>{card.title}</Text>
                    <Text className="mt-0.5 text-xs text-white/80" numberOfLines={2}>
                      {card.kortbeskrivning || 'Upptäck detta företag och deras erbjudanden.'}
                    </Text>
                  </View>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    );
  }

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

function CardGrid({ cards, onCardPress }: { cards: CardItem[]; onCardPress?: (card: CardItem) => void }) {
  const elements: React.ReactNode[] = [];
  let i = 0;
  let smallCount = 0;

  while (i < cards.length) {
    if (smallCount > 0 && smallCount % 8 === 0) {
      const card = cards[i];
      elements.push(
        <Pressable
          key={`${card.id}-${i}-large`}
          className="mb-3 w-full overflow-hidden rounded-2xl bg-[#0a1535]"
          onPress={() => onCardPress?.(card)}
        >
          <View className="relative h-52 w-full">
            <Image source={card.image} resizeMode="cover" className="h-full w-full" />
            <View className="absolute inset-0 bg-black/20" />
            {card.deal ? <DealTag /> : null}
            <View className="absolute bottom-0 left-0 right-0 p-3">
              <View className="rounded-xl bg-black/50 px-3 py-2">
                <Text className="text-lg font-semibold text-white" numberOfLines={1}>
                  {card.title}
                </Text>
                <Text className="mt-0.5 text-xs text-white/80" numberOfLines={2}>
                  {card.kortbeskrivning || 'Upptäck detta företag och deras erbjudanden.'}
                </Text>
              </View>
            </View>
          </View>
        </Pressable>
      );
      i += 1;
      smallCount = 0;
      continue;
    }

    const left = cards[i];
    const right = i + 1 < cards.length ? cards[i + 1] : null;

    elements.push(
      <View key={`row-${i}`} className="mb-3 flex-row gap-3">
        <Pressable
          className="flex-1 overflow-hidden rounded-2xl bg-[#0a1535]"
          onPress={() => onCardPress?.(left)}
        >
          <View className="relative h-28 w-full">
            <Image source={left.image} resizeMode="cover" className="h-full w-full" />
            {left.deal ? <DealTag /> : null}
          </View>
          <Text className="px-2 py-2 text-sm text-white" numberOfLines={1}>{left.title}</Text>
        </Pressable>

        {right ? (
          <Pressable
            className="flex-1 overflow-hidden rounded-2xl bg-[#0a1535]"
            onPress={() => onCardPress?.(right)}
          >
            <View className="relative h-28 w-full">
              <Image source={right.image} resizeMode="cover" className="h-full w-full" />
              {right.deal ? <DealTag /> : null}
            </View>
            <Text className="px-2 py-2 text-sm text-white" numberOfLines={1}>{right.title}</Text>
          </Pressable>
        ) : (
          <View className="flex-1" />
        )}
      </View>
    );

    smallCount += right ? 2 : 1;
    i += right ? 2 : 1;
  }

  return <View>{elements}</View>;
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
