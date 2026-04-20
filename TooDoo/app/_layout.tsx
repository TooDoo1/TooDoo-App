import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';
import '../global.css';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider } from '@/context/auth-context';
import { AppReadyProvider, useAppReady } from '@/context/app-ready-context';
import LoadingSplash from '@/components/ui/loading-splash';

SplashScreen.preventAutoHideAsync().catch(() => {});

const MIN_SPLASH_DURATION_MS = 3000;
const MAX_SPLASH_DURATION_MS = 10000;

export const unstable_settings = {
	anchor: '(tabs)',
};

function AppShell() {
	const colorScheme = useColorScheme();
	const { isDataReady, markDataReady } = useAppReady();
	const [hasMinElapsed, setHasMinElapsed] = useState(false);
	const [hasMaxElapsed, setHasMaxElapsed] = useState(false);

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

	return (
		<ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
			<Stack>
				<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
				<Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
			</Stack>
			<StatusBar style="auto" />
			{showSplash ? (
				<View style={StyleSheet.absoluteFill} pointerEvents="auto">
					<LoadingSplash />
				</View>
			) : null}
		</ThemeProvider>
	);
}

export default function RootLayout() {
	return (
		<AppReadyProvider>
			<AuthProvider>
				<AppShell />
			</AuthProvider>
		</AppReadyProvider>
	);
}
