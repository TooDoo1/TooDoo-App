import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ReanimatedScreenProvider } from 'react-native-screens/reanimated';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';
import '../global.css';

import { ThemePreferenceProvider, useThemePreference } from '@/context/theme-preference-context';
import { TabBarMotionProvider } from '@/context/tab-bar-motion-context';
import { AuthProvider } from '@/context/auth-context';
import { FavoritesProvider } from '@/context/favorites-context';
import { FavoriteOfferNotificationsProvider } from '@/context/favorite-offer-notifications';
import { AppReadyProvider, useAppReady } from '@/context/app-ready-context';
import { PwaStandaloneViewport } from '@/components/pwa-standalone-viewport';
import { RootFloatingTabBarOverlay } from '@/components/root-floating-tab-bar-overlay';
import { useStandalonePwa } from '@/lib/use-standalone-pwa';
import { WebStackEdgeSwipeBack } from '@/components/web-stack-edge-swipe-back';
import { WebHistoryBackSync } from '@/components/web-history-back-sync';
import LightningIntroSplash, { SPLASH_EXIT_DURATION_MS } from '@/components/ui/lightning-intro-splash';
import { WebStackSwipeProvider } from '@/context/web-stack-swipe-context';
import { getHomeScreenSnapshot } from '@/lib/home-list-cache';
import { getSwipeableStackScreenOptions } from '@/lib/stack-navigation';

SplashScreen.preventAutoHideAsync().catch(() => {});

const MAX_SPLASH_DURATION_MS = 12000;
const WEB_SPLASH_SEEN_KEY = 'toodoo_splash_seen';

function hasWebSplashBeenSeen() {
	return Platform.OS === 'web' && typeof sessionStorage !== 'undefined'
		? sessionStorage.getItem(WEB_SPLASH_SEEN_KEY) === '1'
		: false;
}

function markWebSplashSeen() {
	if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
		sessionStorage.setItem(WEB_SPLASH_SEEN_KEY, '1');
		sessionStorage.removeItem('toodoo_intro_lightning_played');
	}
}

function shouldSkipStartupSplash() {
	if (hasWebSplashBeenSeen()) return true;
	return Boolean(getHomeScreenSnapshot());
}

export const unstable_settings = {
	anchor: '(tabs)',
};

function NativeStackMotionProvider({ children }: { children: ReactNode }) {
	if (Platform.OS === 'web') {
		return children;
	}

	return <ReanimatedScreenProvider>{children}</ReanimatedScreenProvider>;
}

function AppShell() {
	const { width: windowWidth } = useWindowDimensions();
	const { effectiveScheme } = useThemePreference();
	const isStandalonePwa = useStandalonePwa();
	const { isDataReady, markDataReady } = useAppReady();
	const swipeableStackScreenOptions = useMemo(
		() => getSwipeableStackScreenOptions(windowWidth),
		[windowWidth]
	);
	const skipStartupSplash = shouldSkipStartupSplash();
	const [introComplete, setIntroComplete] = useState(skipStartupSplash);
	const [hasMaxElapsed, setHasMaxElapsed] = useState(skipStartupSplash);
	const [isSplashMounted, setIsSplashMounted] = useState(!skipStartupSplash);

	useEffect(() => {
		SplashScreen.hideAsync().catch(() => {});

		const maxTimer = setTimeout(() => {
			setHasMaxElapsed(true);
			setIntroComplete(true);
			markDataReady();
		}, MAX_SPLASH_DURATION_MS);

		return () => clearTimeout(maxTimer);
	}, [markDataReady]);

	useEffect(() => {
		if (!isSplashMounted || introComplete) return;

		const introFallback = setTimeout(() => setIntroComplete(true), 5200);
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

		const unmountTimer = setTimeout(() => {
			markWebSplashSeen();
			setIsSplashMounted(false);
		}, SPLASH_EXIT_DURATION_MS);

		return () => clearTimeout(unmountTimer);
	}, [isExiting, isSplashMounted]);

	const appShellStyle =
		Platform.OS === 'web' && isStandalonePwa
			? { flex: 1, height: '100%', minHeight: 0, backgroundColor: '#0e1325' as const }
			: Platform.OS === 'web'
				? { flex: 1, height: '100%' }
				: { flex: 1 };

	return (
		<TabBarMotionProvider>
			<WebStackSwipeProvider>
			<NativeStackMotionProvider>
				<PwaStandaloneViewport />
				<GestureHandlerRootView
					nativeID={Platform.OS === 'web' && isStandalonePwa ? 'app-shell' : undefined}
					style={appShellStyle}
				>
					<ThemeProvider value={effectiveScheme === 'dark' ? DarkTheme : DefaultTheme}>
						<WebStackEdgeSwipeBack />
						<WebHistoryBackSync />
						<View style={appShellStyle}>
						<Stack
							screenOptions={{
								contentStyle: { flex: 1, backgroundColor: '#0e1325' },
								...(Platform.OS === 'web' ? { detachInactiveScreens: false } : {}),
							}}
						>
							<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
							<Stack.Screen name="company-detail" options={swipeableStackScreenOptions} />
							<Stack.Screen name="nara-dig" options={swipeableStackScreenOptions} />
							<Stack.Screen name="heta-erbjudanden" options={swipeableStackScreenOptions} />
							<Stack.Screen name="slutar-snart" options={swipeableStackScreenOptions} />
							<Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
						</Stack>
						</View>
						{!isSplashMounted ? <RootFloatingTabBarOverlay /> : null}
						<StatusBar style={effectiveScheme === 'dark' ? 'light' : 'dark'} />
						{isSplashMounted ? (
							<View
								style={[
									StyleSheet.absoluteFill,
									{ pointerEvents: isExiting ? 'none' : 'auto' },
								]}
							>
								<LightningIntroSplash
									isExiting={isExiting}
									onIntroComplete={handleIntroComplete}
								/>
							</View>
						) : null}
					</ThemeProvider>
				</GestureHandlerRootView>
			</NativeStackMotionProvider>
			</WebStackSwipeProvider>
		</TabBarMotionProvider>
	);
}

export default function RootLayout() {
	return (
		<AppReadyProvider>
			<ThemePreferenceProvider>
				<AuthProvider>
					<FavoritesProvider>
						<FavoriteOfferNotificationsProvider>
							<AppShell />
						</FavoriteOfferNotificationsProvider>
					</FavoritesProvider>
				</AuthProvider>
			</ThemePreferenceProvider>
		</AppReadyProvider>
	);
}
