import AsyncStorage from '@react-native-async-storage/async-storage';
import { InteractionManager, Platform } from 'react-native';
import { SchedulableTriggerInputTypes } from 'expo-notifications';

import { getOrderPublishEndMs } from '@/lib/order-claim-window';
import { getOrderBusinessId, getOrderId } from '@/lib/offers';
import {
  cancelNotification,
  cancelNotificationsByPrefix,
  hasNotificationPermission,
  scheduleLocalNotification,
} from '@/lib/push-notifications';

const LAST_OPEN_KEY = 'toodoo:last_app_open_ms';
const EXPIRY_PREFIX = 'toodoo.expiry.';
const LUNCH_PREFIX = 'toodoo.lunch.wd.';
const WEEKEND_PREFIX = 'toodoo.weekend.';
const REENGAGE_ID = 'toodoo.reengage';

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FIVE_MIN_MS = 5 * 60 * 1000;

/** Expo weekly weekday: 1 = Sunday … 7 = Saturday */
const WEEKDAY = {
  monday: 2,
  tuesday: 3,
  wednesday: 4,
  thursday: 5,
  friday: 6,
  saturday: 7,
} as const;

export async function markAppOpenedNow() {
  try {
    await AsyncStorage.setItem(LAST_OPEN_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

export async function getLastAppOpenMs(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_OPEN_KEY);
    const ms = raw ? Number(raw) : NaN;
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

/**
 * Schedule / refresh recurring engagement notifications.
 * Safe to call on every app foreground — deferred so it doesn't jank first paint.
 */
export async function refreshEngagementNotifications(enabled: boolean) {
  if (Platform.OS === 'web') return;

  await new Promise<void>((resolve) => {
    InteractionManager.runAfterInteractions(() => resolve());
  });

  if (!enabled) {
    await cancelNotificationsByPrefix(LUNCH_PREFIX);
    await cancelNotificationsByPrefix(WEEKEND_PREFIX);
    await cancelNotification(REENGAGE_ID);
    return;
  }

  await markAppOpenedNow();
  if (!(await hasNotificationPermission())) return;
  await Promise.all([
    scheduleLunchWeekdayNotifications(),
    scheduleWeekendNotifications(),
    scheduleReengagementNotification(),
  ]);
}

/** Weekdays ~10:00 — lunch offers & places. */
async function scheduleLunchWeekdayNotifications() {
  const weekdays = [
    WEEKDAY.monday,
    WEEKDAY.tuesday,
    WEEKDAY.wednesday,
    WEEKDAY.thursday,
    WEEKDAY.friday,
  ];

  for (const weekday of weekdays) {
    await scheduleLocalNotification({
      identifier: `${LUNCH_PREFIX}${weekday}`,
      title: 'Dags för lunch?',
      body: 'Kolla luncherbjudanden och matställen nära dig i TooDoo.',
      data: {
        type: 'lunch',
        screen: 'home',
        query: 'lunch',
      },
      trigger: {
        type: SchedulableTriggerInputTypes.WEEKLY,
        weekday,
        hour: 10,
        minute: 0,
      },
    });
  }
}

/** Thursday–Saturday tips for weekend activities. */
async function scheduleWeekendNotifications() {
  const slots: Array<{ weekday: number; hour: number; minute: number; title: string; body: string }> =
    [
      {
        weekday: WEEKDAY.thursday,
        hour: 17,
        minute: 0,
        title: 'Helgen närmar sig',
        body: 'Hitta något kul att göra i helgen — evenemang och erbjudanden nära dig.',
      },
      {
        weekday: WEEKDAY.friday,
        hour: 16,
        minute: 0,
        title: 'Fredagskänsla?',
        body: 'Se vad som händer i helgen och delta i deals innan de tar slut.',
      },
      {
        weekday: WEEKDAY.saturday,
        hour: 11,
        minute: 0,
        title: 'Vad gör du idag?',
        body: 'Upptäck saker att göra i helgen med TooDoo.',
      },
    ];

  for (const slot of slots) {
    await scheduleLocalNotification({
      identifier: `${WEEKEND_PREFIX}${slot.weekday}`,
      title: slot.title,
      body: slot.body,
      data: {
        type: 'weekend',
        screen: 'home',
        query: 'helg',
      },
      trigger: {
        type: SchedulableTriggerInputTypes.WEEKLY,
        weekday: slot.weekday,
        hour: slot.hour,
        minute: slot.minute,
      },
    });
  }
}

/** “Vill du hitta på något?” after one week without opening the app. */
async function scheduleReengagementNotification() {
  await scheduleLocalNotification({
    identifier: REENGAGE_ID,
    title: 'Vill du hitta på något?',
    body: 'Det har gått ett tag — öppna TooDoo och se vad som händer nära dig.',
    data: {
      type: 'reengage',
      screen: 'home',
    },
    trigger: {
      type: SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + ONE_WEEK_MS),
    },
  });
}

/**
 * Schedule “5 minutes before offer ends” for favorite-business offers.
 * Replaces previous expiry schedules for those order ids.
 */
export async function scheduleFavoriteOfferExpiryNotifications(
  orders: any[],
  favoriteBusinessIds: Set<string>,
  enabled: boolean
) {
  if (Platform.OS === 'web') return;

  await cancelNotificationsByPrefix(EXPIRY_PREFIX);
  if (!enabled || favoriteBusinessIds.size === 0) return;

  const now = Date.now();
  const scheduled = new Set<string>();

  for (const order of orders) {
    const orderId = getOrderId(order);
    const businessId = getOrderBusinessId(order);
    if (!orderId || !businessId || !favoriteBusinessIds.has(businessId)) continue;

    const endMs = getOrderPublishEndMs(order);
    if (endMs == null) continue;

    const fireAt = endMs - FIVE_MIN_MS;
    if (fireAt <= now + 15_000) continue;
    // Don't schedule more than ~3 days ahead (keeps the queue lean).
    if (fireAt - now > 3 * 24 * 60 * 60 * 1000) continue;
    if (scheduled.has(orderId)) continue;
    scheduled.add(orderId);

    const businessName = String(order?.business?.name ?? order?.businessName ?? 'din favorit');
    const title = String(order?.title ?? 'Erbjudande');

    await scheduleLocalNotification({
      identifier: `${EXPIRY_PREFIX}${orderId}`,
      title: 'Snart slut!',
      body: `${title} hos ${businessName} går ut om 5 minuter.`,
      data: {
        type: 'expiry',
        businessId,
        orderId,
      },
      trigger: {
        type: SchedulableTriggerInputTypes.DATE,
        date: new Date(fireAt),
      },
    });
  }
}
