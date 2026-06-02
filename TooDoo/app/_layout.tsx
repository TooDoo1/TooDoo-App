import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';
import '../global.css';

import { ThemePreferenceProvider, useThemePreference } from '@/context/theme-preference-context';
import { AuthProvider } from '@/context/auth-context';
import { FavoritesProvider } from '@/context/favorites-context';
import { FavoriteOfferNotificationsProvider } from '@/context/favorite-offer-notifications';
import { AppReadyProvider, useAppReady } from '@/context/app-ready-context';
import LoadingSplash, { SPLASH_EXIT_DURATION_MS } from '@/components/ui/loading-splash';

SplashScreen.preventAutoHideAsync().catch(() => {});

const MIN_SPLASH_DURATION_MS = 3000;
const MAX_SPLASH_DURATION_MS = 10000;

export const unstable_settings = {
	anchor: '(tabs)',
};

function AppShell() {
	const { effectiveScheme } = useThemePreference();
	const { isDataReady, markDataReady } = useAppReady();
	const [hasMinElapsed, setHasMinElapsed] = useState(false);
	const [hasMaxElapsed, setHasMaxElapsed] = useState(false);
	const [isSplashMounted, setIsSplashMounted] = useState(true);

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
			setIsSplashMounted(false);
		}, SPLASH_EXIT_DURATION_MS);

		return () => clearTimeout(unmountTimer);
	}, [isExiting, isSplashMounted]);

	return (
		<ThemeProvider value={effectiveScheme === 'dark' ? DarkTheme : DefaultTheme}>
			<Stack>
				<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
				<Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
			</Stack>
			<StatusBar style={effectiveScheme === 'dark' ? 'light' : 'dark'} />
			{isSplashMounted ? (
				<View
					style={StyleSheet.absoluteFill}
					pointerEvents={isExiting ? 'none' : 'auto'}
				>
					<LoadingSplash isExiting={isExiting} />
				</View>
			) : null}
		</ThemeProvider>
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
