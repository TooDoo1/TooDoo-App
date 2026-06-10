import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { RootFloatingTabBarOverlay } from '@/components/root-floating-tab-bar-overlay';
import { WebStackEdgeSwipeBack } from '@/components/web-stack-edge-swipe-back';
import { WebHistoryBackSync } from '@/components/web-history-back-sync';
import LoadingSplash, { SPLASH_EXIT_DURATION_MS } from '@/components/ui/loading-splash';
import { WebStackSwipeProvider } from '@/context/web-stack-swipe-context';
import { getSwipeableStackScreenOptions } from '@/lib/stack-navigation';

SplashScreen.preventAutoHideAsync().catch(() => {});

const MIN_SPLASH_DURATION_MS = 3000;
const MAX_SPLASH_DURATION_MS = 10000;
const WEB_SPLASH_SEEN_KEY = 'toodoo_splash_seen';

function hasWebSplashBeenSeen() {
	return Platform.OS === 'web' && typeof sessionStorage !== 'undefined'
		? sessionStorage.getItem(WEB_SPLASH_SEEN_KEY) === '1'
		: false;
}

function markWebSplashSeen() {
	if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
		sessionStorage.setItem(WEB_SPLASH_SEEN_KEY, '1');
	}
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
	const { isDataReady, markDataReady } = useAppReady();
	const swipeableStackScreenOptions = useMemo(
		() => getSwipeableStackScreenOptions(windowWidth),
		[windowWidth]
	);
	const webSplashSeen = hasWebSplashBeenSeen();
	const [hasMinElapsed, setHasMinElapsed] = useState(webSplashSeen);
	const [hasMaxElapsed, setHasMaxElapsed] = useState(webSplashSeen);
	const [isSplashMounted, setIsSplashMounted] = useState(!webSplashSeen);

	useEffect(() => {
		SplashScreen.hideAsync().catch(() => {});

		const minTimer = setTimeout(() => setHasMinElapsed(true), MIN_SPLASH_DURATION_MS);
		const maxTimer = setTimeout(() => {
			setHasMaxElapsed(true);
			markDataReady();
		}, MAX_SPLASH_DURATION_MS);

		return () => {
			clearTimeout(minTimer);
			clearTimeout(maxTimer);
		};
	}, [markDataReady]);

	const showSplash = !hasMaxElapsed && (!hasMinElapsed || !isDataReady);
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

	return (
		<TabBarMotionProvider>
			<WebStackSwipeProvider>
			<NativeStackMotionProvider>
				<GestureHandlerRootView style={{ flex: 1 }}>
					<ThemeProvider value={effectiveScheme === 'dark' ? DarkTheme : DefaultTheme}>
						<WebStackEdgeSwipeBack />
						<WebHistoryBackSync />
						<Stack>
							<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
							<Stack.Screen name="company-detail" options={swipeableStackScreenOptions} />
							<Stack.Screen name="nara-dig" options={swipeableStackScreenOptions} />
							<Stack.Screen name="heta-erbjudanden" options={swipeableStackScreenOptions} />
							<Stack.Screen name="slutar-snart" options={swipeableStackScreenOptions} />
							<Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
						</Stack>
						{!isSplashMounted ? <RootFloatingTabBarOverlay /> : null}
						<StatusBar style={effectiveScheme === 'dark' ? 'light' : 'dark'} />
						{isSplashMounted ? (
							<View
								style={[
									StyleSheet.absoluteFill,
									{ pointerEvents: isExiting ? 'none' : 'auto' },
								]}
							>
								<LoadingSplash isExiting={isExiting} />
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
