import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';
import '../global.css';

import { ThemePreferenceProvider, useThemePreference } from '@/context/theme-preference-context';
import { TabBarMotionProvider } from '@/context/tab-bar-motion-context';
import { AuthProvider } from '@/context/auth-context';
import { RealtimeProvider } from '@/context/realtime-context';
import { FavoritesProvider } from '@/context/favorites-context';
import { FavoriteOfferNotificationsProvider } from '@/context/favorite-offer-notifications';
import { AppReadyProvider, useAppReady } from '@/context/app-ready-context';
import { RootFloatingTabBarOverlay } from '@/components/root-floating-tab-bar-overlay';
import { TabBarStackMotionReset } from '@/components/tab-bar-stack-motion-reset';
import { HelloGreetingOverlay } from '@/components/hello-greeting-overlay';
import LightningIntroSplash, { SPLASH_EXIT_DURATION_MS } from '@/components/ui/lightning-intro-splash';
import { LegalConsentOverlay } from '@/components/ui/legal-consent-overlay';
import { OnboardingOverlay } from '@/components/ui/onboarding-overlay';
import {
	hasAcceptedLegalConsent,
	markLegalConsentAccepted,
} from '@/lib/legal-consent-storage';
import { hasSeenOnboarding, markOnboardingSeen } from '@/lib/onboarding-storage';
import { applyAppTextDefaults } from '@/lib/app-fonts';
import { getStackScreenOptionsWithoutSwipeBack, getSwipeableStackScreenOptions } from '@/lib/stack-navigation';
import { uiTheme } from '@/lib/ui-theme';
import { warmBusinessMapDuringStartup } from '@/lib/warm-business-map';
import { warmHomeScreenDuringStartup } from '@/lib/warm-home-screen';

SplashScreen.preventAutoHideAsync().catch(() => {});
applyAppTextDefaults();

/** Hard cap — Android used to sit on a blank WebView splash for the full 12s. */
/** Android: keep the hard cap short — warmHome releases earlier when data is ready. */
const MAX_SPLASH_DURATION_MS = Platform.OS === 'android' ? 3200 : 7000;

export const unstable_settings = {
	anchor: '(tabs)',
};

/**
 * The experimental ReanimatedScreenProvider turned every native-stack screen into a
 * Reanimated screen. We don't use screen-level shared/animated transitions, so it
 * only added per-screen JS/UI work. Plain native-stack screens are lighter.
 */
function NativeStackMotionProvider({ children }: { children: ReactNode }) {
	return children;
}

function AppShell() {
	const { width: windowWidth } = useWindowDimensions();
	const { effectiveScheme, mode } = useThemePreference();
	const theme = uiTheme(mode);
	const { isDataReady, markDataReady } = useAppReady();
	// Warm tab-bar icon font during splash so Android doesn't reveal empty slots.
	useFonts(MaterialIcons.font);
	const swipeableStackScreenOptions = useMemo(
		() => getSwipeableStackScreenOptions(windowWidth),
		[windowWidth]
	);
	const businessMapScreenOptions = useMemo(
		() => getStackScreenOptionsWithoutSwipeBack(windowWidth),
		[windowWidth]
	);
	const [introComplete, setIntroComplete] = useState(false);
	const [hasMaxElapsed, setHasMaxElapsed] = useState(false);
	const [isSplashMounted, setIsSplashMounted] = useState(true);
	const [legalConsentStatus, setLegalConsentStatus] = useState<'pending' | 'needed' | 'accepted'>('pending');
	const [onboardingStatus, setOnboardingStatus] = useState<'pending' | 'needed' | 'skipped'>('pending');

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const [legalAccepted, onboardingSeen] = await Promise.all([
				hasAcceptedLegalConsent(),
				hasSeenOnboarding(),
			]);
			if (!cancelled) {
				setLegalConsentStatus(legalAccepted ? 'accepted' : 'needed');
				setOnboardingStatus(onboardingSeen ? 'skipped' : 'needed');
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const handleLegalConsentAccept = useCallback(() => {
		setLegalConsentStatus('accepted');
		void markLegalConsentAccepted();
	}, []);

	const handleOnboardingDone = useCallback(() => {
		setOnboardingStatus('skipped');
		void markOnboardingSeen();
	}, []);

	useEffect(() => {
		SplashScreen.hideAsync().catch(() => {});
		warmHomeScreenDuringStartup({ onSettled: markDataReady });
		if (Platform.OS === 'android') {
			// Don't compete with the home splash fetch — warm the map catalog after
			// the splash budget so the first map tap isn't a cold start.
			// Max timer unlocks the shell; also mark data ready so we never sit past
			// the cap waiting on a slow network settle.
			const maxTimer = setTimeout(() => {
				setHasMaxElapsed(true);
				setIntroComplete(true);
				markDataReady();
			}, MAX_SPLASH_DURATION_MS);
			const warmTimer = setTimeout(() => {
				warmBusinessMapDuringStartup();
			}, MAX_SPLASH_DURATION_MS + 400);
			return () => {
				clearTimeout(maxTimer);
				clearTimeout(warmTimer);
			};
		}

		warmBusinessMapDuringStartup();
		const maxTimer = setTimeout(() => {
			setHasMaxElapsed(true);
			setIntroComplete(true);
			markDataReady();
		}, MAX_SPLASH_DURATION_MS);

		return () => clearTimeout(maxTimer);
	}, [markDataReady]);

	useEffect(() => {
		if (!isSplashMounted || introComplete) return;

		const introFallback = setTimeout(
			() => setIntroComplete(true),
			Platform.OS === 'android' ? 1800 : 5200
		);
		return () => clearTimeout(introFallback);
	}, [introComplete, isSplashMounted]);

	const handleIntroComplete = useCallback(() => {
		setIntroComplete(true);
	}, []);

	const showSplash = !hasMaxElapsed && (!introComplete || !isDataReady);
	const isExiting = !showSplash;

	useEffect(() => {
		if (!isExiting || !isSplashMounted) {
			return;
		}
		// Wait for startup storage before revealing the app shell.
		if (legalConsentStatus === 'pending' || onboardingStatus === 'pending') {
			return;
		}

		const unmountTimer = setTimeout(() => {
			setIsSplashMounted(false);
		}, SPLASH_EXIT_DURATION_MS);

		return () => clearTimeout(unmountTimer);
	}, [isExiting, isSplashMounted, legalConsentStatus, onboardingStatus]);

	const appShellStyle = { flex: 1, backgroundColor: theme.screenBg };

	const startupResolved = legalConsentStatus !== 'pending' && onboardingStatus !== 'pending';
	const hideAppShell = legalConsentStatus !== 'accepted' || onboardingStatus !== 'skipped';
	// Wait until the splash is fully unmounted so the consent sheet isn't
	// clipped under the intro layer or measured against a half-exit layout.
	const showLegalConsent =
		legalConsentStatus === 'needed' && startupResolved && !isSplashMounted;
	const showOnboarding =
		legalConsentStatus === 'accepted' &&
		onboardingStatus === 'needed' &&
		startupResolved &&
		!isSplashMounted;
	// Mount the tab bar under the splash so MaterialIcons load before reveal
	// (otherwise Android often shows empty icon slots after a long splash).
	const showTabBar = !hideAppShell;

	return (
		<TabBarMotionProvider>
			<NativeStackMotionProvider>
				<GestureHandlerRootView style={appShellStyle}>
					<ThemeProvider value={effectiveScheme === 'dark' ? DarkTheme : DefaultTheme}>
						<TabBarStackMotionReset />
						<View
							style={[
								appShellStyle,
								hideAppShell && styles.hiddenAppShell,
							]}
						>
						<Stack
							screenOptions={{
								contentStyle: { flex: 1, backgroundColor: theme.screenBg },
							}}
						>
							<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
							<Stack.Screen name="company-detail" options={swipeableStackScreenOptions} />
							<Stack.Screen name="nara-dig" options={swipeableStackScreenOptions} />
							<Stack.Screen name="business-map" options={businessMapScreenOptions} />
							<Stack.Screen name="heta-erbjudanden" options={swipeableStackScreenOptions} />
							<Stack.Screen name="slutar-snart" options={swipeableStackScreenOptions} />
							<Stack.Screen name="evenemang" options={swipeableStackScreenOptions} />
							<Stack.Screen name="municipio-event-detail" options={swipeableStackScreenOptions} />
							<Stack.Screen name="sokresultat" options={swipeableStackScreenOptions} />
							<Stack.Screen name="profile-konto" options={swipeableStackScreenOptions} />
							<Stack.Screen name="profile-plats" options={swipeableStackScreenOptions} />
							<Stack.Screen name="profile-security" options={swipeableStackScreenOptions} />
							<Stack.Screen name="profile-policy" options={swipeableStackScreenOptions} />
							<Stack.Screen name="profile-support" options={swipeableStackScreenOptions} />
							<Stack.Screen name="glomt-losenord" options={swipeableStackScreenOptions} />
							<Stack.Screen name="reset-password" options={swipeableStackScreenOptions} />
						</Stack>
						</View>
						{showTabBar ? <RootFloatingTabBarOverlay /> : null}
						<HelloGreetingOverlay
							ready={!isSplashMounted && !showLegalConsent && !showOnboarding}
						/>
						<StatusBar style={effectiveScheme === 'dark' ? 'light' : 'dark'} />
						{isSplashMounted ? (
							<View
								style={[
									StyleSheet.absoluteFill,
									styles.splashLayer,
									{ pointerEvents: isExiting ? 'none' : 'auto' },
								]}
							>
								<LightningIntroSplash
									isExiting={isExiting}
									onIntroComplete={handleIntroComplete}
								/>
							</View>
						) : null}
						{showLegalConsent ? (
							<LegalConsentOverlay onAccept={handleLegalConsentAccept} />
						) : null}
						{showOnboarding ? (
							<OnboardingOverlay onDone={handleOnboardingDone} />
						) : null}
						{hideAppShell && !startupResolved ? (
							<View
								pointerEvents="auto"
								style={[
									StyleSheet.absoluteFill,
									styles.startupGate,
									{ backgroundColor: theme.screenBg },
								]}
							/>
						) : null}
					</ThemeProvider>
				</GestureHandlerRootView>
			</NativeStackMotionProvider>
		</TabBarMotionProvider>
	);
}

const styles = StyleSheet.create({
	hiddenAppShell: {
		opacity: 0,
		pointerEvents: 'none',
	},
	splashLayer: {
		zIndex: 500,
	},
	startupGate: {
		zIndex: 450,
	},
});

export default function RootLayout() {
	return (
		<AppReadyProvider>
			<ThemePreferenceProvider>
				<AuthProvider>
					<RealtimeProvider>
					<FavoritesProvider>
						<FavoriteOfferNotificationsProvider>
							<AppShell />
						</FavoriteOfferNotificationsProvider>
					</FavoritesProvider>
					</RealtimeProvider>
				</AuthProvider>
			</ThemePreferenceProvider>
		</AppReadyProvider>
	);
}
