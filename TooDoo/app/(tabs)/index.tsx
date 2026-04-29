import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Platform,
  Dimensions,
  Image,
  ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { Easing } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppReady } from '@/context/app-ready-context';
import { apiUrl } from '@/lib/api';
import { useAuth } from '@/context/auth-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StarrySkyScreenBackground } from '@/components/ui/starry-background';
import { useThemePreference } from '@/context/theme-preference-context';
import { uiTheme } from '@/lib/ui-theme';

const ALL_CATEGORIES_ID = 'all';
const OFFERS_CATEGORY_ID = 'offers';
const FEATURED_REPEAT_COUNT = 600;

// Starry background extracted to `components/ui/starry-background.tsx`

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
  const [searchQuery, setSearchQuery] = useState('');
  const [firstName, setFirstName] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<'nearby' | 'hot' | 'endingSoon' | null>(null);
  const nearbyAnim = useRef(new Animated.Value(0)).current;
  const hotAnim = useRef(new Animated.Value(0)).current;
  const endingSoonAnim = useRef(new Animated.Value(0)).current;
  const tooDooLetters = ['T', 'o', 'o', 'D', 'o', 'o'] as const;
  const tooDooColors = ['#ff4d6d', '#ff7a00', '#ffd60a', '#00d4ff', '#3a86ff', '#9b5de5'] as const;
  const tooDooBounceValues = useRef(tooDooLetters.map(() => new Animated.Value(0))).current;
  const didScrollAfterExpandRef = useRef(false);
  const didOpenCardRef = useRef(false);
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
  const { token } = useAuth();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
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

  useEffect(() => {
    if (Platform.OS === 'android') {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
  }, []);

  useEffect(() => {
    const run = (value: Animated.Value, toValue: number) => {
      Animated.timing(value, {
        toValue,
        duration: 650,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }).start();
    };

    run(nearbyAnim, expandedSection === 'nearby' ? 1 : 0);
    run(hotAnim, expandedSection === 'hot' ? 1 : 0);
    run(endingSoonAnim, expandedSection === 'endingSoon' ? 1 : 0);
  }, [expandedSection, nearbyAnim, hotAnim, endingSoonAnim]);

  useEffect(() => {
    if (!expandedSection) {
      return;
    }

    didScrollAfterExpandRef.current = false;
    didOpenCardRef.current = false;
    const current = expandedSection;
    const timer = setTimeout(() => {
      if (expandedSection === current && !didScrollAfterExpandRef.current && !didOpenCardRef.current) {
        setExpandedSection(null);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [expandedSection]);

  useFocusEffect(
    useCallback(() => {
      // Reset "opened card" tracking when returning to this screen.
      didOpenCardRef.current = false;
      // Play the same "bounce letters" feel as the login screen.
      tooDooBounceValues.forEach((value) => value.setValue(0));
      const bounceOneLetter = Animated.stagger(
        80,
        tooDooBounceValues.map((value) =>
          Animated.sequence([
            Animated.timing(value, { toValue: -10, duration: 140, useNativeDriver: true }),
            Animated.timing(value, { toValue: 0, duration: 140, useNativeDriver: true }),
          ])
        )
      );
      bounceOneLetter.start();
      return () => {};
    }, [tooDooBounceValues])
  );

  const markExpandedSectionScrolled = () => {
    didScrollAfterExpandRef.current = true;
  };

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
          fetch(apiUrl('/category')),
          fetch(apiUrl('/business?status=APPROVED')),
          fetch(apiUrl('/orders')),
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
  }, [markDataReady]);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setFirstName(null);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const res = await fetch(apiUrl('/user/me'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (!cancelled) {
          setFirstName(typeof json?.firstName === 'string' ? json.firstName : null);
        }
      } catch {
        if (!cancelled) setFirstName(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

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

  const endingSoonDeals = useMemo(() => {
    const toValues = (value?: string | string[]) => (Array.isArray(value) ? value : value ? [value] : []);
    const parseEndMs = (card: CardItem) => {
      const raw = toValues(card.erbjudandelängd);
      const best = raw
        .map((item) => new Date(item).getTime())
        .filter((ms) => Number.isFinite(ms))
        .sort((a, b) => a - b)[0];
      return best ?? Number.POSITIVE_INFINITY;
    };

    return [...filteredDeals]
      .filter((card) => card.deal)
      .map((card) => ({ card, endMs: parseEndMs(card) }))
      .filter((item) => Number.isFinite(item.endMs) && item.endMs !== Number.POSITIVE_INFINITY)
      .sort((a, b) => a.endMs - b.endMs)
      .slice(0, 8)
      .map((item) => item.card);
  }, [filteredDeals]);

  const searchedDeals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filteredDeals;
    return filteredDeals.filter((card) => {
      const hay = `${card.title} ${card.kortbeskrivning} ${card.långbeskrivning}`.toLowerCase();
      return hay.includes(q);
    });
  }, [filteredDeals, searchQuery]);

  const getCategoryIconName = (label: string): React.ComponentProps<typeof Ionicons>['name'] => {
    const name = label.toLowerCase();
    if (name.includes('mat') || name.includes('food') || name.includes('restaur')) return 'restaurant-outline';
    if (name.includes('familj') || name.includes('family') || name.includes('barn')) return 'people-outline';
    if (name.includes('sport') || name.includes('träning') || name.includes('fitness')) return 'football-outline';
    if (name.includes('hälsa') || name.includes('health')) return 'heart-outline';
    if (name.includes('skön') || name.includes('beauty') || name.includes('spa')) return 'sparkles-outline';
    if (name.includes('nöje') || name.includes('entertain') || name.includes('bio')) return 'film-outline';
    if (name.includes('kläder') || name.includes('shopping') || name.includes('butik')) return 'bag-outline';
    if (name.includes('resa') || name.includes('travel')) return 'airplane-outline';
    return 'grid-outline';
  };

  const handleCardPress = (card: CardItem) => {
    didOpenCardRef.current = true;
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

  const setExpandedSectionAnimated = (next: typeof expandedSection) => setExpandedSection(next);

  const handleNearbyCardPress = (card: CardItem) => {
    if (expandedSection !== 'nearby') {
      setExpandedSectionAnimated('nearby');
      return;
    }
    handleCardPress(card);
  };

  const handleHotCardPress = (card: CardItem) => {
    if (expandedSection !== 'hot') {
      setExpandedSectionAnimated('hot');
      return;
    }
    handleCardPress(card);
  };

  const handleEndingSoonCardPress = (card: CardItem) => {
    if (expandedSection !== 'endingSoon') {
      setExpandedSectionAnimated('endingSoon');
      return;
    }
    handleCardPress(card);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.screenBg }}>
      <StarrySkyScreenBackground variant={theme.isDark ? 'dark' : 'light'} />
      <SafeAreaView
        edges={['top', 'left', 'right']}
        className="flex-1"
        style={[styles.screen, { backgroundColor: 'transparent' }]}
      >
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 16 }}>
        <View className="px-6 pt-3">
          <View className="relative items-center justify-center">
            <View style={{ flexDirection: 'row' }}>
              {tooDooLetters.map((letter, idx) => (
                <Animated.Text
                  key={`${letter}-${idx}`}
                  style={{
                    color: tooDooColors[idx],
                    fontSize: 30,
                    fontWeight: '600',
                    transform: [{ translateY: tooDooBounceValues[idx] }],
                    lineHeight: 36,
                  }}
                >
                  {letter}
                </Animated.Text>
              ))}
            </View>
            <Pressable
              onPress={() => router.push('/(tabs)/Profile')}
              className="absolute right-0 h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: theme.cardBgMuted, borderColor: theme.border, borderWidth: 1 }}
            >
              <Ionicons name="person" size={20} color={theme.text} />
            </Pressable>
          </View>
          <Text className="mt-1 text-base" style={{ color: theme.textMuted }}>
            Hej {firstName?.trim() ? firstName.trim() : 'vän'}
          </Text>
        </View>

        <View className="px-6 pt-3">
          <View
            className="flex-row items-center rounded-full px-4 py-2.5"
            style={{ borderWidth: 1, borderColor: theme.isDark ? 'rgba(255,255,255,0.40)' : 'rgba(0,11,42,0.25)', backgroundColor: theme.cardBg }}
          >
            <Ionicons name="search" size={18} color={theme.text} style={{ marginRight: 8 }} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Vad vill du göra idag?"
              placeholderTextColor={theme.textFaint}
              className="flex-1"
              style={{ color: theme.text }}
              returnKeyType="search"
            />
            {searchQuery.trim() ? (
              <Pressable onPress={() => setSearchQuery('')} className="ml-2 rounded-full px-2 py-1">
                <Ionicons name="close-circle" size={18} color={theme.text} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <View className="mt-4 px-6">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-lg font-semibold" style={{ color: theme.text }}>& Nära dig</Text>
            <Pressable onPress={() => {}}>
              <Text style={{ color: theme.textMuted }}>Se alla →</Text>
            </Pressable>
          </View>

          {featuredBusinesses.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 10 }}
              onScrollBeginDrag={() => expandedSection === 'nearby' && markExpandedSectionScrolled()}
            >
              <View className="flex-row gap-3 pb-2">
                {featuredBusinesses.map((biz, idx) => (
                  <Animated.View
                    key={`${biz.id}-${idx}`}
                    style={{
                      width: nearbyAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [176, 256],
                      }),
                      overflow: 'visible',
                    }}
                  >
                    <View
                      style={{
                        shadowColor: '#000',
                        shadowOpacity: theme.isDark ? 0.16 : 0.06,
                        shadowRadius: theme.isDark ? 10 : 6,
                        shadowOffset: { width: 0, height: theme.isDark ? 5 : 1 },
                        elevation: theme.isDark ? 3 : 1,
                        overflow: 'visible',
                      }}
                    >
                      <Pressable
                        className="overflow-hidden rounded-2xl"
                        style={{
                          backgroundColor: theme.cardBg,
                          borderColor: theme.border,
                          borderWidth: 1,
                        }}
                        onPress={() => handleNearbyCardPress(biz)}
                      >
                        <Animated.View
                          className="relative w-full"
                          style={{
                            height: nearbyAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [96, 144],
                            }),
                          }}
                        >
                          <Image source={biz.image} resizeMode="cover" className="h-full w-full" />
                          <View className="absolute inset-0 bg-black/25" />
                          <View
                            className="absolute left-2 top-2 rounded-full px-2 py-1"
                            style={{
                              backgroundColor: theme.isDark ? 'rgba(0,0,0,0.55)' : 'rgba(0,11,42,0.55)',
                            }}
                          >
                            <Text className="text-[10px] font-medium text-white">0.{(idx % 9) + 1} km</Text>
                          </View>
                          <Animated.View
                            style={{
                              position: 'absolute',
                              left: 0,
                              right: 0,
                              bottom: 0,
                              // Animated wrapper is safe; keep `LinearGradient` static to avoid render crashes.
                              height: nearbyAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [56, 104],
                              }),
                              overflow: 'hidden',
                            }}
                          >
                            <LinearGradient
                              colors={
                                theme.isDark
                                  ? [
                                      'rgba(0,11,42,0.00)',
                                      'rgba(0,11,42,0.92)',
                                      'rgba(0,11,42,0.92)',
                                    ]
                                  : [
                                      'rgba(245,247,255,0.00)',
                                      'rgba(245,247,255,0.98)',
                                      'rgba(245,247,255,0.98)',
                                    ]
                              }
                              locations={[0, 0.28, 1]}
                              start={{ x: 0.5, y: 0 }}
                              end={{ x: 0.5, y: 1 }}
                              style={{
                                flex: 1,
                                paddingHorizontal: 12,
                                // Tune spacing so title/category sit nicely within the gradient
                                // in both collapsed and enlarged states.
                                paddingBottom: 8,
                                paddingTop: 10,
                                justifyContent: 'flex-end',
                              }}
                            >
                              <Text
                                className="font-semibold"
                                numberOfLines={1}
                                style={{ color: theme.text, lineHeight: 18 }}
                              >
                                {biz.title}
                              </Text>
                              <Text
                                className="text-xs"
                                numberOfLines={1}
                                style={{ color: theme.textMuted, lineHeight: 16 }}
                              >
                                {biz.categoryName ?? 'Nära dig'}
                              </Text>
                              <Animated.View
                                style={{
                                  height: nearbyAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0, 30],
                                  }),
                                  opacity: nearbyAnim,
                                  overflow: 'hidden',
                                }}
                              >
                                <Animated.Text
                                  className="mt-1 text-[11px]"
                                  numberOfLines={2}
                                  style={{
                                    transform: [
                                      {
                                        translateY: nearbyAnim.interpolate({
                                          inputRange: [0, 1],
                                          outputRange: [6, 0],
                                        }),
                                      },
                                    ],
                                  }}
                                >
                                  {biz.kortbeskrivning || 'Upptäck detta företag och deras erbjudanden.'}
                                </Animated.Text>
                              </Animated.View>
                            </LinearGradient>
                          </Animated.View>
                        </Animated.View>
                      </Pressable>
                    </View>
                  </Animated.View>
                ))}
              </View>
            </ScrollView>
          ) : (
            <Text style={{ color: theme.textMuted }}>{isLoadingData ? 'Laddar...' : 'Inget att visa just nu.'}</Text>
          )}
        </View>

        <View className="mt-4 px-6">
          <View className="flex-row items-center">
            <Ionicons name="flame" size={18} color="#ff3b30" />
            <Text className="ml-2 text-lg font-semibold" style={{ color: theme.text }}>Heta erbjudanden</Text>
          </View>
          <View className="mt-3">
            {isLoadingData ? (
              <Text style={{ color: theme.textMuted }}>Laddar...</Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 10 }}
                onScrollBeginDrag={() => expandedSection === 'hot' && markExpandedSectionScrolled()}
              >
                <View className="flex-row gap-3 pb-2">
                  {searchedDeals
                    .filter((c) => c.deal)
                    .slice(0, 10)
                    .map((card, idx) => (
                      <Animated.View
                        key={`${card.id}-${idx}`}
                        style={{
                          width: hotAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [256, 320],
                          }),
                      overflow: 'visible',
                        }}
                      >
                        <View
                          style={{
                            shadowColor: '#000',
                          shadowOpacity: theme.isDark ? 0.16 : 0.06,
                          shadowRadius: theme.isDark ? 10 : 6,
                          shadowOffset: { width: 0, height: theme.isDark ? 5 : 1 },
                          elevation: theme.isDark ? 3 : 1,
                        overflow: 'visible',
                          }}
                        >
                          <Pressable
                            className="overflow-hidden rounded-2xl border"
                            style={{
                              backgroundColor: theme.cardBg,
                              borderColor: theme.isDark ? theme.border : 'rgba(255,255,255,0.65)',
                              borderWidth: 1,
                            }}
                            onPress={() => handleHotCardPress(card)}
                          >
                          <Animated.View
                            className="relative w-full"
                            style={{
                              height: hotAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [128, 176],
                              }),
                            }}
                          >
                          <Image source={card.image} resizeMode="cover" className="h-full w-full" />
                          <View className="absolute inset-0 bg-black/20" />
                          {card.deal ? <DealTag /> : null}
                          <LinearGradient
                            colors={
                              theme.isDark
                                ? ['rgba(0,11,42,0.00)', 'rgba(0,11,42,0.92)', 'rgba(0,11,42,0.92)']
                            : ['rgba(245,247,255,0.00)', 'rgba(245,247,255,0.98)', 'rgba(245,247,255,0.98)']
                            }
                            locations={[0, 0.28, 1]}
                            start={{ x: 0.5, y: 0 }}
                            end={{ x: 0.5, y: 1 }}
                            style={{
                              position: 'absolute',
                              left: 0,
                              right: 0,
                              bottom: 0,
                              height: '55%',
                              paddingHorizontal: 12,
                              paddingBottom: 12,
                              paddingTop: 16,
                              justifyContent: 'flex-end',
                            }}
                          >
                            <Text className="text-lg font-semibold" style={{ color: theme.text }} numberOfLines={1}>
                              {card.title}
                            </Text>
                            <Text className="mt-0.5 text-xs" style={{ color: theme.textMuted }} numberOfLines={2}>
                              {card.kortbeskrivning || 'Upptäck detta företag och deras erbjudanden.'}
                            </Text>
                          </LinearGradient>
                          </Animated.View>
                          </Pressable>
                        </View>
                      </Animated.View>
                    ))}
                </View>
              </ScrollView>
            )}
          </View>
        </View>

        <View className="mt-4 px-6">
          <View className="flex-row items-center">
            <Ionicons name="time" size={18} color={theme.text} />
            <Text className="ml-2 text-lg font-semibold" style={{ color: theme.text }}>Slutar snart</Text>
          </View>
          <View className="mt-3">
            {endingSoonDeals.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 10 }}
                onScrollBeginDrag={() => expandedSection === 'endingSoon' && markExpandedSectionScrolled()}
              >
                <View className="flex-row gap-3 pb-2">
                  {endingSoonDeals.map((card, idx) => (
                    <Animated.View
                      key={`${card.id}-${idx}`}
                      style={{
                        width: endingSoonAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [160, 256],
                        }),
                        overflow: 'visible',
                      }}
                    >
                      <View
                        style={{
                          shadowColor: '#000',
                          shadowOpacity: theme.isDark ? 0.16 : 0.06,
                          shadowRadius: theme.isDark ? 10 : 6,
                          shadowOffset: { width: 0, height: theme.isDark ? 5 : 1 },
                          elevation: theme.isDark ? 3 : 1,
                          overflow: 'visible',
                        }}
                      >
                        <Pressable
                          className="overflow-hidden rounded-2xl border"
                          style={{
                            backgroundColor: theme.cardBg,
                            borderColor: theme.isDark ? theme.border : 'rgba(255,255,255,0.65)',
                            borderWidth: 1,
                          }}
                          onPress={() => handleEndingSoonCardPress(card)}
                        >
                        <Animated.View
                          className="relative w-full"
                          style={{
                            height: endingSoonAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [88, 140],
                            }),
                          }}
                        >
                          <Image source={card.image} resizeMode="cover" className="h-full w-full" />
                          <View className="absolute inset-0 bg-black/20" />
                          {card.deal ? <DealTag /> : null}
                          <LinearGradient
                            colors={
                              theme.isDark
                                ? ['rgba(0,11,42,0.00)', 'rgba(0,11,42,0.92)', 'rgba(0,11,42,0.92)']
                            : ['rgba(245,247,255,0.00)', 'rgba(245,247,255,0.98)', 'rgba(245,247,255,0.98)']
                            }
                            locations={[0, 0.28, 1]}
                            start={{ x: 0.5, y: 0 }}
                            end={{ x: 0.5, y: 1 }}
                            style={{
                              position: 'absolute',
                              left: 0,
                              right: 0,
                              bottom: 0,
                              height: '58%',
                              paddingHorizontal: 10,
                              paddingBottom: 10,
                              paddingTop: 14,
                              justifyContent: 'flex-end',
                            }}
                          >
                            <Text className="text-sm font-semibold" style={{ color: theme.text }} numberOfLines={1}>
                              {card.title}
                            </Text>
                            <Animated.View
                              style={{
                                height: endingSoonAnim.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0, 28],
                                }),
                                opacity: endingSoonAnim,
                                overflow: 'hidden',
                              }}
                            >
                              <Animated.Text
                                className="mt-0.5 text-[11px]"
                                numberOfLines={2}
                                // keep a small slide-in while respecting themed text color
                                style={{
                                  color: theme.textMuted,
                                  transform: [
                                    {
                                      translateY: endingSoonAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [6, 0],
                                      }),
                                    },
                                  ],
                                }}
                              >
                                {card.kortbeskrivning || 'Upptäck detta företag och deras erbjudanden.'}
                              </Animated.Text>
                            </Animated.View>
                          </LinearGradient>
                        </Animated.View>
                        </Pressable>
                      </View>
                    </Animated.View>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <Text style={{ color: theme.textMuted }}>{isLoadingData ? 'Laddar...' : 'Inga tidsbegränsade erbjudanden hittades.'}</Text>
            )}
          </View>
        </View>

        <View className="mt-4 px-6">
          <View className="flex-row items-center">
            <Ionicons name="apps" size={18} color={theme.textMuted} />
            <Text className="ml-2 text-lg font-semibold" style={{ color: theme.text }}>Bläddra kategorier</Text>
          </View>
          <View
            className="mt-3 rounded-3xl border px-4 py-4"
            style={{
              borderColor: theme.isDark ? theme.border : 'rgba(255,255,255,0.55)',
              // In light mode, match the cards' "text area" overlay tone.
              backgroundColor: theme.isDark ? theme.cardBg : 'rgba(245,247,255,0.98)',
              borderWidth: 1,
              shadowColor: '#000',
              shadowOpacity: theme.isDark ? 0.22 : 0.10,
              shadowRadius: theme.isDark ? 14 : 10,
              shadowOffset: { width: 0, height: theme.isDark ? 8 : 4 },
              elevation: theme.isDark ? 6 : 2,
            }}
          >
            <View className="flex-row flex-wrap justify-between">
              {categoryFilters.map((cat, idx) => {
                // More vibrant ("screaming") palette for category bubbles.
                const palette = ['#FFB703', '#00D4FF', '#FF4D6D', '#9B5DE5', '#00E676', '#FF5ACD', '#3A86FF', '#FFD60A'];
                const bg = palette[idx % palette.length];
                return (
                  <Pressable
                    key={cat.id}
                    className="mb-3 w-[23%] items-center"
                    onPress={() => setActiveCategory(cat.id)}
                  >
                    <View
                      className="h-14 w-14 overflow-hidden rounded-2xl"
                      style={{
                        backgroundColor: bg,
                        // Use dark shadow in both modes for a consistent "lifted" look.
                        shadowColor: '#000',
                        shadowOpacity: theme.isDark ? 0.25 : 0.22,
                        shadowRadius: 10,
                        shadowOffset: { width: 0, height: 6 },
                        elevation: 6,
                      }}
                    >
                      {/* Frost layer (what makes it "glass") */}
                      <View
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: 'rgba(255,255,255,0.04)',
                        }}
                      />

                      {/* Specular highlight */}
                      <LinearGradient
                        colors={['rgba(255,255,255,0.40)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.00)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                      />

                      {/* Subtle bottom shadow for depth */}
                      <LinearGradient
                        colors={['rgba(0,0,0,0.00)', 'rgba(0,0,0,0.015)']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                      />
                      <View className="flex-1 items-center justify-center">
                        <Ionicons name={getCategoryIconName(cat.label)} size={22} color="#ffffff" />
                      </View>
                      {/* Glass edges */}
                      <View
                        className="absolute inset-0 rounded-2xl border"
                        style={{ borderWidth: 1, borderColor: theme.isDark ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.70)' }}
                      />
                      <View
                        className="absolute inset-[1px] rounded-[15px] border"
                        style={{ borderWidth: 1, borderColor: theme.isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.30)' }}
                      />
                    </View>
                    <Text className="mt-2 text-xs" style={{ color: theme.textMuted }} numberOfLines={1}>
                      {cat.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
        </ScrollView>
      </SafeAreaView>
    </View>
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
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);

  if (enlarged) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-3 pb-2">
          {cards.map((card, index) => (
            <View
              key={`${card.id}-${index}-shadow`}
              style={{
                shadowColor: '#000',
                shadowOpacity: theme.isDark ? 0.22 : 0.14,
                shadowRadius: theme.isDark ? 14 : 12,
                shadowOffset: { width: 0, height: theme.isDark ? 8 : 6 },
                elevation: theme.isDark ? 6 : 4,
              }}
            >
              <Pressable
                key={`${card.id}-${index}`}
                className="w-64 overflow-hidden rounded-2xl"
                style={{
                  backgroundColor: theme.cardBg,
                  borderWidth: 1,
                  borderColor: theme.isDark ? theme.border : 'rgba(255,255,255,0.60)',
                }}
                onPress={() => onCardPress?.(card)}
              >
              <View className="relative h-44 w-full">
                <Image source={card.image} resizeMode="cover" className="h-full w-full" />
                <View className="absolute inset-0 bg-black/20" />
                {card.deal ? <DealTag /> : null}
                <View className="absolute bottom-0 left-0 right-0 p-3">
                  <View className="rounded-xl bg-black/50 px-3 py-2">
                    <Text className="text-lg font-semibold" style={{ color: theme.text }} numberOfLines={1}>{card.title}</Text>
                    <Text className="mt-0.5 text-xs" style={{ color: theme.textMuted }} numberOfLines={2}>
                      {card.kortbeskrivning || 'Upptäck detta företag och deras erbjudanden.'}
                    </Text>
                  </View>
                </View>
              </View>
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View className="flex-row gap-3 pb-2">
        {cards.map((card, index) => (
          <View
            key={`${card.id}-${index}-shadow`}
            style={{
              shadowColor: '#000',
              shadowOpacity: theme.isDark ? 0.22 : 0.14,
              shadowRadius: theme.isDark ? 14 : 12,
              shadowOffset: { width: 0, height: theme.isDark ? 8 : 6 },
              elevation: theme.isDark ? 6 : 4,
            }}
          >
            <Pressable
              key={`${card.id}-${index}`}
              className="w-40 overflow-hidden rounded-2xl"
              style={{
                backgroundColor: theme.cardBg,
                borderWidth: 1,
                borderColor: theme.isDark ? theme.border : 'rgba(255,255,255,0.60)',
              }}
              onPress={() => onCardPress?.(card)}
            >
              <View className="relative h-28 w-full">
                <Image source={card.image} resizeMode="cover" className="h-full w-full" />
                {card.deal ? <DealTag /> : null}
              </View>
              <Text className="px-2 py-2 text-sm" style={{ color: theme.text }}>{card.title}</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function CardGrid({ cards, onCardPress }: { cards: CardItem[]; onCardPress?: (card: CardItem) => void }) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const elements: React.ReactNode[] = [];
  let i = 0;
  let smallCount = 0;

  while (i < cards.length) {
    if (smallCount > 0 && smallCount % 8 === 0) {
      const card = cards[i];
      elements.push(
          <View
            key={`${card.id}-${i}-large-shadow`}
            style={{
              shadowColor: '#000',
              shadowOpacity: theme.isDark ? 0.22 : 0.14,
              shadowRadius: theme.isDark ? 14 : 12,
              shadowOffset: { width: 0, height: theme.isDark ? 8 : 6 },
              elevation: theme.isDark ? 6 : 4,
            }}
          >
            <Pressable
              key={`${card.id}-${i}-large`}
              className="mb-3 w-full overflow-hidden rounded-2xl"
              style={{
                backgroundColor: theme.cardBg,
                borderWidth: 1,
                borderColor: theme.isDark ? theme.border : 'rgba(255,255,255,0.60)',
              }}
              onPress={() => onCardPress?.(card)}
            >
              <View className="relative h-52 w-full">
                <Image source={card.image} resizeMode="cover" className="h-full w-full" />
                <View className="absolute inset-0 bg-black/20" />
                {card.deal ? <DealTag /> : null}
                <View className="absolute bottom-0 left-0 right-0 p-3">
                  <View className="rounded-xl bg-black/50 px-3 py-2">
                    <Text className="text-lg font-semibold" style={{ color: theme.text }} numberOfLines={1}>
                      {card.title}
                    </Text>
                    <Text className="mt-0.5 text-xs" style={{ color: theme.textMuted }} numberOfLines={2}>
                      {card.kortbeskrivning || 'Upptäck detta företag och deras erbjudanden.'}
                    </Text>
                  </View>
                </View>
              </View>
            </Pressable>
          </View>
      );
      i += 1;
      smallCount = 0;
      continue;
    }

    const left = cards[i];
    const right = i + 1 < cards.length ? cards[i + 1] : null;

    elements.push(
      <View key={`row-${i}`} className="mb-3 flex-row gap-3">
        <View
          style={{
            flex: 1,
            shadowColor: '#000',
            shadowOpacity: theme.isDark ? 0.22 : 0.14,
            shadowRadius: theme.isDark ? 14 : 12,
            shadowOffset: { width: 0, height: theme.isDark ? 8 : 6 },
            elevation: theme.isDark ? 6 : 4,
          }}
        >
          <Pressable
            className="flex-1 overflow-hidden rounded-2xl"
            style={{
              backgroundColor: theme.cardBg,
              borderWidth: 1,
              borderColor: theme.isDark ? theme.border : 'rgba(255,255,255,0.60)',
            }}
            onPress={() => onCardPress?.(left)}
          >
            <View className="relative h-28 w-full">
              <Image source={left.image} resizeMode="cover" className="h-full w-full" />
              {left.deal ? <DealTag /> : null}
            </View>
            <Text className="px-2 py-2 text-sm" style={{ color: theme.text }} numberOfLines={1}>{left.title}</Text>
          </Pressable>
        </View>

        {right ? (
          <View
            style={{
              flex: 1,
              shadowColor: '#000',
              shadowOpacity: theme.isDark ? 0.22 : 0.14,
              shadowRadius: theme.isDark ? 14 : 12,
              shadowOffset: { width: 0, height: theme.isDark ? 8 : 6 },
              elevation: theme.isDark ? 6 : 4,
            }}
          >
            <Pressable
              className="flex-1 overflow-hidden rounded-2xl"
              style={{
                backgroundColor: theme.cardBg,
                borderWidth: 1,
                borderColor: theme.isDark ? theme.border : 'rgba(255,255,255,0.60)',
              }}
              onPress={() => onCardPress?.(right)}
            >
              <View className="relative h-28 w-full">
                <Image source={right.image} resizeMode="cover" className="h-full w-full" />
                {right.deal ? <DealTag /> : null}
              </View>
              <Text className="px-2 py-2 text-sm" style={{ color: theme.text }} numberOfLines={1}>{right.title}</Text>
            </Pressable>
          </View>
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
