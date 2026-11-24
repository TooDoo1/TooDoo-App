import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { apiUrl } from '@/lib/api';

export const TOODOO_NOTIFICATION_CHANNEL_ID = 'toodoo-default';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let channelReady = false;

export async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android' || channelReady) return;
  await Notifications.setNotificationChannelAsync(TOODOO_NOTIFICATION_CHANNEL_ID, {
    name: 'TooDoo',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 150, 250],
    lightColor: '#ff3b30',
  });
  channelReady = true;
}

export async function ensureNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (!Device.isDevice) return false;

  await ensureAndroidNotificationChannel();

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  return status === 'granted';
}

export async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;
  if (!(await ensureNotificationPermissions())) return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.projectId;

  try {
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId: String(projectId) } : undefined
    );
    return token.data ?? null;
  } catch {
    return null;
  }
}

/** Register device push token with backend (for server-sent notifications). */
export async function registerPushTokenWithBackend(accessToken: string, expoPushToken: string) {
  const bodies = [{ token: expoPushToken }, { pushToken: expoPushToken }, { expoPushToken }];
  for (const body of bodies) {
    try {
      const res = await fetch(apiUrl('/user/push-token'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (res.ok) return true;
    } catch {
      // try next shape
    }
  }
  return false;
}

export type LocalNotificationData = Record<string, string>;

export async function scheduleLocalOfferNotification(
  title: string,
  body: string,
  data?: LocalNotificationData
) {
  if (Platform.OS === 'web') return;
  if (!(await ensureNotificationPermissions())) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
      ...(Platform.OS === 'android' ? { channelId: TOODOO_NOTIFICATION_CHANNEL_ID } : null),
    },
    trigger: null,
  });
}

export async function scheduleLocalNotification(options: {
  identifier: string;
  title: string;
  body: string;
  data?: LocalNotificationData;
  trigger: Notifications.NotificationTriggerInput;
}) {
  if (Platform.OS === 'web') return;
  if (!(await ensureNotificationPermissions())) return;

  try {
    await Notifications.cancelScheduledNotificationAsync(options.identifier);
  } catch {
    // ignore missing id
  }

  await Notifications.scheduleNotificationAsync({
    identifier: options.identifier,
    content: {
      title: options.title,
      body: options.body,
      data: options.data,
      sound: true,
      ...(Platform.OS === 'android' ? { channelId: TOODOO_NOTIFICATION_CHANNEL_ID } : null),
    },
    trigger: options.trigger,
  });
}

export async function cancelNotificationsByPrefix(prefix: string) {
  if (Platform.OS === 'web') return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((item) => item.identifier.startsWith(prefix))
        .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier))
    );
  } catch {
    // ignore
  }
}

export async function cancelNotification(identifier: string) {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch {
    // ignore
  }
}
