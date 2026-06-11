import { createElement, memo, useCallback, useEffect, useRef } from 'react';
import { Image, Platform, StyleSheet } from 'react-native';
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from 'react-native-reanimated';
import { WebView } from 'react-native-webview';

import { getLightningIntroHtml } from '@/lib/lightning-intro-html';

const logoSrc = require('../../assets/images/TooDoo.jpg');

export const SPLASH_EXIT_DURATION_MS = 380;

type LightningIntroSplashProps = {
	isExiting?: boolean;
	onIntroComplete?: () => void;
};

function LightningIntroSplash({
	isExiting = false,
	onIntroComplete,
}: LightningIntroSplashProps) {
	const exitProgress = useSharedValue(0);
	const iframeRef = useRef<HTMLIFrameElement | null>(null);
	const webViewRef = useRef<WebView>(null);
	const introCompleteRef = useRef(false);

	const notifyIntroComplete = useCallback(() => {
		if (introCompleteRef.current) return;
		introCompleteRef.current = true;
		onIntroComplete?.();
	}, [onIntroComplete]);

	useEffect(() => {
		if (!isExiting) return;

		const exitMessage = { type: 'toodoo-intro-exit' };

		if (Platform.OS === 'web') {
			iframeRef.current?.contentWindow?.postMessage(exitMessage, '*');
		} else {
			webViewRef.current?.injectJavaScript(
				`window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(exitMessage)} })); true;`
			);
		}

		exitProgress.value = withTiming(1, {
			duration: SPLASH_EXIT_DURATION_MS,
			easing: Easing.out(Easing.quad),
		});
	}, [exitProgress, isExiting]);

	useEffect(() => {
		if (Platform.OS !== 'web' || typeof window === 'undefined') return;

		const onMessage = (event: MessageEvent) => {
			if (event.data?.type === 'toodoo-intro-complete') {
				notifyIntroComplete();
			}
		};

		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	}, [notifyIntroComplete]);

	const containerStyle = useAnimatedStyle(() => ({
		opacity: 1 - exitProgress.value,
	}));

	if (Platform.OS === 'web') {
		return (
			<Animated.View style={[styles.container, containerStyle]}>
				{createElement('iframe', {
					ref: iframeRef,
					src: '/lightning-intro.html',
					key: 'toodoo-lightning-intro',
					title: 'TooDoo intro',
					style: {
						position: 'absolute',
						inset: 0,
						width: '100%',
						height: '100%',
						border: 'none',
						backgroundColor: '#0e1325',
					},
				})}
			</Animated.View>
		);
	}

	const logoUri = Image.resolveAssetSource(logoSrc).uri;

	return (
		<Animated.View style={[styles.container, containerStyle]}>
			<WebView
				ref={webViewRef}
				source={{ html: getLightningIntroHtml(logoUri), baseUrl: logoUri }}
				style={styles.webview}
				scrollEnabled={false}
				bounces={false}
				originWhitelist={['*']}
				onMessage={(event) => {
					try {
						const data = JSON.parse(event.nativeEvent.data);
						if (data?.type === 'toodoo-intro-complete') {
							notifyIntroComplete();
						}
					} catch {
						if (event.nativeEvent.data === 'toodoo-intro-complete') {
							notifyIntroComplete();
						}
					}
				}}
			/>
		</Animated.View>
	);
}

export default memo(LightningIntroSplash);

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#0e1325',
	},
	webview: {
		flex: 1,
		backgroundColor: '#0e1325',
	},
});
