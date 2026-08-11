import { Alert, Platform } from 'react-native';

/** `Alert.alert` is a no-op on web — use `window.alert` there. */
export function showAlert(title: string, message?: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
