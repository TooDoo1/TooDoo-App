import AsyncStorage from '@react-native-async-storage/async-storage';

const LEGAL_CONSENT_KEY = 'toodoo.legalConsentAccepted';

export async function hasAcceptedLegalConsent(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(LEGAL_CONSENT_KEY);
    return stored === '1';
  } catch {
    return false;
  }
}

export async function markLegalConsentAccepted(): Promise<void> {
  try {
    await AsyncStorage.setItem(LEGAL_CONSENT_KEY, '1');
  } catch {
    // Ignore storage failures — worst case the consent sheet shows again next launch.
  }
}

export async function resetLegalConsent(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LEGAL_CONSENT_KEY);
  } catch {
    // Ignore.
  }
}
