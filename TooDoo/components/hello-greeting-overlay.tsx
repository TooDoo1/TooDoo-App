import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSegments } from 'expo-router';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useAuth } from '@/context/auth-context';
import { useThemePreference } from '@/context/theme-preference-context';
import { useHeroTopInset } from '@/lib/use-hero-top-inset';
import { uiTheme } from '@/lib/ui-theme';

const HELLO_SEEN_KEY = 'toodoo_hello_seen_v6';
const NAME_WAIT_MS = 900;
const HOME_READY_MS = 280;
const HOLD_MS = 2000;
const FLY_MS = 480;
const WEB_ANIM_MS = 3200;

let helloShownThisLaunch = false;

function hasHelloBeenSeen() {
  if (helloShownThisLaunch) return true;
  if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
    return sessionStorage.getItem(HELLO_SEEN_KEY) === '1';
  }
  return false;
}

function markHelloSeen() {
  helloShownThisLaunch = true;
  if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(HELLO_SEEN_KEY, '1');
  }
}

function formatGreetingName(value: string) {
  const text = value.trim();
  if (!text) return '';
  const letters = text.match(/[A-Za-zÅÄÖåäö]/g) ?? [];
  if (letters.length < 2) return text;
  const upper = (text.match(/[A-ZÅÄÖ]/g) ?? []).length;
  if (upper / letters.length < 0.7) {
    return text.charAt(0).toLocaleUpperCase('sv-SE') + text.slice(1);
  }
  return text
    .toLocaleLowerCase('sv-SE')
    .replace(
      /(^|[^A-Za-zÅÄÖåäö])([A-Za-zÅÄÖåäö])/g,
      (_match: string, sep: string, ch: string) => sep + ch.toLocaleUpperCase('sv-SE')
    );
}

function readFirstName(json: unknown): string {
  if (!json || typeof json !== 'object') return '';
  const root = json as Record<string, unknown>;
  const direct = root.firstName ?? root.firstname ?? root.givenName;
  if (typeof direct === 'string' && direct.trim()) return direct;
  for (const key of ['user', 'data', 'profile', 'me']) {
    const nested = root[key];
    if (nested && typeof nested === 'object') {
      const record = nested as Record<string, unknown>;
      const name = record.firstName ?? record.firstname ?? record.givenName;
      if (typeof name === 'string' && name.trim()) return name;
    }
  }
  return '';
}

function HelloGreetingBanner({
  name,
  onDone,
}: {
  name: string;
  onDone: () => void;
}) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const topInset = useHeroTopInset();
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const translateY = useSharedValue(-180);
  const opacity = useSharedValue(0);
  const lineTwo = useSharedValue(0);
  const bannerBg = theme.primary;
  const bannerFg = '#ffffff';
  const bannerFgMuted = 'rgba(255,255,255,0.78)';
  const bannerBorder = 'rgba(10,15,28,0.55)';
  const bannerShadow = '0 8px 22px rgba(0,0,0,0.48)';
  const hello = name ? `Hej ${name}` : 'Hej';

  const finish = useCallback(() => {
    onDoneRef.current();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const timer = setTimeout(finish, WEB_ANIM_MS);
      return () => clearTimeout(timer);
    }

    translateY.value = withSequence(
      withSpring(0, { damping: 14, stiffness: 180, mass: 0.85 }),
      withDelay(
        HOLD_MS,
        withTiming(-220, { duration: FLY_MS, easing: Easing.in(Easing.cubic) }, (done) => {
          if (done) runOnJS(finish)();
        })
      )
    );
    opacity.value = withSequence(
      withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) }),
      withDelay(HOLD_MS + 360, withTiming(0, { duration: FLY_MS - 80, easing: Easing.in(Easing.quad) }))
    );
    lineTwo.value = withDelay(720, withTiming(1, { duration: 340, easing: Easing.out(Easing.quad) }));
  }, [finish, lineTwo, opacity, translateY]);

  const bannerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const lineTwoStyle = useAnimatedStyle(() => ({
    opacity: lineTwo.value,
    transform: [{ translateY: (1 - lineTwo.value) * 8 }],
  }));

  if (Platform.OS === 'web') {
    return (
      <div className="toodoo-hello-layer" style={{ paddingTop: topInset + 10, alignItems: 'center' }}>
        <div
          className="toodoo-hello-banner"
          style={{
            backgroundColor: bannerBg,
            borderColor: bannerBorder,
            boxShadow: bannerShadow,
            color: bannerFg,
            height: 'auto',
            alignSelf: 'center',
          }}
        >
          <div className="toodoo-hello-title">{hello}</div>
          <div className="toodoo-hello-tagline" style={{ color: bannerFgMuted }}>
            Hitta på något roligt?
          </div>
        </div>
      </div>
    );
  }

  return (
    <View pointerEvents="none" style={[styles.layer, { paddingTop: topInset + 10 }]}>
      <Animated.View
        style={[
          styles.banner,
          {
            backgroundColor: bannerBg,
            borderColor: bannerBorder,
            boxShadow: bannerShadow,
          },
          bannerStyle,
        ]}
      >
        <Text style={[styles.hello, { color: bannerFg }]} numberOfLines={1}>
          {hello}
        </Text>
        <Animated.Text
          style={[styles.tagline, { color: bannerFgMuted }, lineTwoStyle]}
          numberOfLines={1}
        >
          Hitta på något roligt?
        </Animated.Text>
      </Animated.View>
    </View>
  );
}

function isDiscoverHome(segments: string[]) {
  const leaf = segments.filter((segment) => !segment.startsWith('('));
  if (leaf.length === 0) return true;
  return leaf.length === 1 && leaf[0] === 'index';
}

export function HelloGreetingOverlay({ ready = true }: { ready?: boolean }) {
  const segments = useSegments();
  const onHome = isDiscoverHome(segments as string[]);
  const { isLoggedIn, isAuthReady, authFetch } = useAuth();
  const [phase, setPhase] = useState<'idle' | 'show' | 'done'>('idle');
  const [name, setName] = useState('');
  const nameRef = useRef('');

  useEffect(() => {
    if (!isAuthReady || !isLoggedIn || nameRef.current) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await authFetch('/user/me');
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        const next = formatGreetingName(readFirstName(json));
        nameRef.current = next;
        setName(next);
      } catch {
        // Keep a nameless Hej.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch, isAuthReady, isLoggedIn]);

  useEffect(() => {
    if (phase === 'done') return;
    if (!ready || !isAuthReady || !isLoggedIn) return;

    if (!onHome) {
      if (phase === 'show') {
        markHelloSeen();
        setPhase('done');
      }
      return;
    }

    if (phase === 'show') return;

    if (hasHelloBeenSeen()) {
      setPhase('done');
      return;
    }

    const wait = nameRef.current ? HOME_READY_MS : NAME_WAIT_MS;
    const timer = setTimeout(() => {
      markHelloSeen();
      setPhase('show');
    }, wait);

    return () => clearTimeout(timer);
  }, [isAuthReady, isLoggedIn, onHome, phase, ready]);

  if (phase !== 'show' || !onHome) return null;

  return (
    <HelloGreetingBanner
      name={name}
      onDone={() => {
        markHelloSeen();
        setPhase('done');
      }}
    />
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-start',
    zIndex: 420,
  },
  banner: {
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 9,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  hello: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  tagline: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
    lineHeight: 17,
  },
});
