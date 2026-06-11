import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import { useFavorites } from '@/context/favorites-context';
import { apiUrl } from '@/lib/api';
import { getOrderBusinessId, getOrderId, isActiveOffer, parseOrdersList } from '@/lib/offers';
import {
  getExpoPushToken,
  registerPushTokenWithBackend,
  scheduleLocalOfferNotification,
} from '@/lib/push-notifications';

const SEEN_OFFERS_KEY_PREFIX = 'toodoo_seen_offer_ids_';
const POLL_INTERVAL_MS = 5 * 60 * 1000;

const FavoriteOfferNotificationsContext = createContext<undefined>(undefined);

function seenOffersKey(userId: string) {
  return `${SEEN_OFFERS_KEY_PREFIX}${userId}`;
}

async function loadSeenOfferIds(userId: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(seenOffersKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

async function saveSeenOfferIds(userId: string, ids: Set<string>) {
  try {
    await AsyncStorage.setItem(seenOffersKey(userId), JSON.stringify(Array.from(ids)));
  } catch {
    // ignore
  }
}

export function FavoriteOfferNotificationsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { token, role, isAuthReady, authFetch } = useAuth();
  const { favoriteBusinessIds } = useFavorites();
  const favoriteIdsRef = useRef(favoriteBusinessIds);
  const isFirstScanRef = useRef(true);
  const userIdRef = useRef<string | null>(null);

  favoriteIdsRef.current = favoriteBusinessIds;

  const scanFavoriteOffers = useCallback(async () => {
    if (!token || role !== 'USER' || favoriteIdsRef.current.size === 0) return;

    try {
      const meRes = await authFetch('/user/me');
      const me = await meRes.json().catch(() => ({}));
      if (me?.notificationsEnabled === false) return;

      const userId = String(me?.id ?? me?.email ?? 'me');
      userIdRef.current = userId;

      const ordersRes = await fetch(apiUrl('/orders'));
      const ordersJson = await ordersRes.json().catch(() => []);
      const orders = parseOrdersList(ordersJson);
      const nowMs = Date.now();
      const favoriteSet = favoriteIdsRef.current;

      const activeFromFavorites = orders.filter((order) => {
        const businessId = getOrderBusinessId(order);
        return businessId && favoriteSet.has(businessId) && isActiveOffer(order, nowMs);
      });

      const seen = await loadSeenOfferIds(userId);
      const newlyFound: { orderId: string; title: string; businessName: string; businessId: string }[] = [];

      for (const order of activeFromFavorites) {
        const orderId = getOrderId(order);
        if (!orderId) continue;
        if (!seen.has(orderId)) {
          newlyFound.push({
            orderId,
            title: String(order?.title ?? 'Nytt erbjudande'),
            businessName: String(order?.business?.name ?? order?.businessName ?? 'En favorit'),
            businessId: getOrderBusinessId(order) ?? '',
          });
        }
        seen.add(orderId);
      }

      await saveSeenOfferIds(userId, seen);

      if (isFirstScanRef.current) {
        isFirstScanRef.current = false;
        return;
      }

      for (const item of newlyFound) {
        await scheduleLocalOfferNotification(
          `Nytt erbjudande från ${item.businessName}`,
          item.title,
          {
            businessId: item.businessId,
            orderId: item.orderId,
          }
        );
      }
    } catch {
      // ignore transient failures
    }
  }, [authFetch, role, token]);

  useEffect(() => {
    if (!isAuthReady || !token || role !== 'USER' || Platform.OS === 'web') return;

    void (async () => {
      const pushToken = await getExpoPushToken();
      if (pushToken) {
        await registerPushTokenWithBackend(token, pushToken);
      }
    })();
  }, [isAuthReady, token, role]);

  useEffect(() => {
    if (!isAuthReady || !token || role !== 'USER') return;

    isFirstScanRef.current = true;
    void scanFavoriteOffers();

    const interval = setInterval(() => {
      void scanFavoriteOffers();
    }, POLL_INTERVAL_MS);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void scanFavoriteOffers();
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [isAuthReady, token, role, favoriteBusinessIds, scanFavoriteOffers]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as {
        businessId?: string;
        orderId?: string;
      };
      if (data?.businessId) {
        router.push({
          pathname: '/company-detail',
          params: {
            id: data.businessId,
            claimBusinessId: data.businessId,
            title: 'Erbjudande',
            ...(data.orderId ? { claimOrderId: data.orderId } : {}),
          },
        });
      }
    });

    return () => sub.remove();
  }, [router]);

  return (
    <FavoriteOfferNotificationsContext.Provider value={undefined}>
      {children}
    </FavoriteOfferNotificationsContext.Provider>
  );
}

export function useFavoriteOfferNotifications() {
  return useContext(FavoriteOfferNotificationsContext);
}
