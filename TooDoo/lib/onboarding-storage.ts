import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_SEEN_KEY = 'toodoo.onboardingSeen';

export async function hasSeenOnboarding(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(ONBOARDING_SEEN_KEY);
    return stored === '1';
  } catch {
    return false;
  }
}

export async function markOnboardingSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, '1');
  } catch {
    // Ignore storage failures — worst case the intro shows again next launch.
  }
}

export async function resetOnboarding(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ONBOARDING_SEEN_KEY);
  } catch {
    // Ignore.
  }
}
