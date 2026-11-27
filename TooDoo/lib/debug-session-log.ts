import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const INGEST =
  'http://127.0.0.1:7675/ingest/75320d83-763e-4111-a91e-6ee6c9dc777b';
/** LAN fallback so a physical phone can reach the Cursor debug ingest. */
const INGEST_LAN =
  'http://10.172.100.41:7675/ingest/75320d83-763e-4111-a91e-6ee6c9dc777b';
const SESSION_ID = '1eb8a6';
const BREADCRUMB_KEY = 'toodoo:debug:breadcrumbs:v1';
const LAST_FATAL_KEY = 'toodoo:debug:last-fatal:v1';
const MAX_BREADCRUMBS = 40;

type DebugPayload = {
  sessionId: string;
  runId?: string;
  hypothesisId?: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
};

function post(payload: DebugPayload) {
  const body = JSON.stringify(payload);
  const headers = {
    'Content-Type': 'application/json',
    'X-Debug-Session-Id': SESSION_ID,
  };
  // Prefer LAN first on device; localhost first on emulator/desktop.
  const urls =
    Platform.OS === 'android'
      ? [INGEST_LAN, INGEST]
      : [INGEST, INGEST_LAN];
  for (const url of urls) {
    fetch(url, { method: 'POST', headers, body }).catch(() => {});
  }
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[dbg:${payload.hypothesisId ?? '?'}]`, payload.message, payload.data ?? {});
  }
}

async function pushBreadcrumb(payload: DebugPayload) {
  try {
    const raw = await AsyncStorage.getItem(BREADCRUMB_KEY);
    const list: DebugPayload[] = raw ? (JSON.parse(raw) as DebugPayload[]) : [];
    list.push(payload);
    const trimmed = list.slice(-MAX_BREADCRUMBS);
    await AsyncStorage.setItem(BREADCRUMB_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
}

/** Fire-and-forget debug log for this Cursor session. */
export function dbgLog(
  location: string,
  message: string,
  data?: Record<string, unknown>,
  hypothesisId?: string,
  runId = 'pre-fix'
) {
  const payload: DebugPayload = {
    sessionId: SESSION_ID,
    runId,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  post(payload);
  void pushBreadcrumb(payload);
}

export async function dbgFlushStoredBreadcrumbs(runId = 'boot-flush') {
  try {
    const [crumbsRaw, fatalRaw] = await Promise.all([
      AsyncStorage.getItem(BREADCRUMB_KEY),
      AsyncStorage.getItem(LAST_FATAL_KEY),
    ]);
    if (fatalRaw) {
      const fatal = JSON.parse(fatalRaw) as DebugPayload;
      post({ ...fatal, runId, message: `FLUSH_FATAL: ${fatal.message}` });
    }
    if (crumbsRaw) {
      const list = JSON.parse(crumbsRaw) as DebugPayload[];
      post({
        sessionId: SESSION_ID,
        runId,
        hypothesisId: 'boot',
        location: 'debug-session-log.ts:flush',
        message: 'FLUSH_BREADCRUMBS',
        data: {
          count: list.length,
          last: list.slice(-8).map((item) => ({
            t: item.timestamp,
            h: item.hypothesisId,
            m: item.message,
            loc: item.location,
          })),
        },
        timestamp: Date.now(),
      });
    }
  } catch {
    // ignore
  }
}

export async function dbgRecordFatal(
  location: string,
  message: string,
  data?: Record<string, unknown>,
  hypothesisId = 'fatal'
) {
  const payload: DebugPayload = {
    sessionId: SESSION_ID,
    runId: 'fatal',
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  post(payload);
  try {
    await AsyncStorage.setItem(LAST_FATAL_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
  void pushBreadcrumb(payload);
}

let installed = false;

/** Capture JS fatals before the process dies; flush prior breadcrumbs on next boot. */
export function installDebugCrashHooks() {
  if (installed) return;
  installed = true;
  void dbgFlushStoredBreadcrumbs('boot-flush');
  dbgLog('debug-session-log.ts:install', 'crash hooks installed', { platform: Platform.OS }, 'boot');

  const g = globalThis as typeof globalThis & {
    ErrorUtils?: {
      getGlobalHandler?: () => ((error: Error, isFatal?: boolean) => void) | undefined;
      setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
    };
  };
  const ErrorUtils = g.ErrorUtils;
  if (!ErrorUtils?.setGlobalHandler) return;
  const previous = ErrorUtils.getGlobalHandler?.();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    void dbgRecordFatal(
      'ErrorUtils',
      error?.message ?? String(error),
      {
        isFatal: Boolean(isFatal),
        name: error?.name,
        stack: typeof error?.stack === 'string' ? error.stack.slice(0, 1800) : undefined,
      },
      'fatal'
    );
    previous?.(error, isFatal);
  });
}
