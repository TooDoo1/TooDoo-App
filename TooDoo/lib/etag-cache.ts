import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchWithTimeout } from '@/lib/api';

type EtagEntry = {
  etag: string;
  body: string;
  savedAt: number;
};

const memory = new Map<string, EtagEntry>();
const MAX_AGE_MS = 1000 * 60 * 60 * 12; // 12h

function storageKey(cacheKey: string) {
  return `toodoo:etag:${cacheKey}`;
}

function readEtagHeader(res: Response): string | null {
  const raw =
    res.headers.get('ETag') ??
    res.headers.get('etag') ??
    res.headers.get('Etag');
  const trimmed = raw?.trim();
  return trimmed || null;
}

async function readEntry(cacheKey: string): Promise<EtagEntry | null> {
  const mem = memory.get(cacheKey);
  if (mem && Date.now() - mem.savedAt < MAX_AGE_MS) return mem;

  try {
    const raw = await AsyncStorage.getItem(storageKey(cacheKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EtagEntry;
    if (
      !parsed?.etag ||
      typeof parsed.body !== 'string' ||
      Date.now() - (parsed.savedAt ?? 0) >= MAX_AGE_MS
    ) {
      return null;
    }
    memory.set(cacheKey, parsed);
    return parsed;
  } catch {
    return null;
  }
}

async function writeEntry(cacheKey: string, etag: string, body: string) {
  const entry: EtagEntry = { etag, body, savedAt: Date.now() };
  memory.set(cacheKey, entry);
  try {
    await AsyncStorage.setItem(storageKey(cacheKey), JSON.stringify(entry));
  } catch {
    // Memory cache still helps within the session.
  }
}

function mergeHeaders(
  initHeaders?: HeadersInit,
  extra?: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  if (initHeaders && typeof Headers !== 'undefined' && initHeaders instanceof Headers) {
    initHeaders.forEach((value, key) => {
      out[key] = value;
    });
  } else if (Array.isArray(initHeaders)) {
    for (const [key, value] of initHeaders) {
      out[key] = value;
    }
  } else if (initHeaders && typeof initHeaders === 'object') {
    Object.assign(out, initHeaders as Record<string, string>);
  }
  if (extra) Object.assign(out, extra);
  return out;
}

function parseBody<T>(text: string): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Conditional GET for unsigned endpoints that send ETag
 * (notably GET /home and GET /business/city-cards).
 * On 304, returns the previously stored JSON body.
 */
export async function fetchJsonWithEtag<T = unknown>(options: {
  url: string;
  cacheKey: string;
  init?: RequestInit;
  /** Only send If-None-Match when true (unsigned GETs). */
  useEtag: boolean;
}): Promise<{ status: number; json: T | null; fromCache: boolean }> {
  let cached: EtagEntry | null = null;
  const conditional: Record<string, string> = {};

  if (options.useEtag) {
    cached = await readEntry(options.cacheKey);
    if (cached?.etag) {
      conditional['If-None-Match'] = cached.etag;
    }
  }

  const doFetch = (extraHeaders?: Record<string, string>) =>
    fetchWithTimeout(options.url, {
      ...options.init,
      headers: mergeHeaders(options.init?.headers, extraHeaders),
    });

  let res = await doFetch(Object.keys(conditional).length ? conditional : undefined);

  if (res.status === 304) {
    if (cached?.body) {
      const json = parseBody<T>(cached.body);
      if (json != null) {
        return { status: 304, json, fromCache: true };
      }
    }
    // Missing/corrupt local body — fetch a fresh 200 without precondition.
    res = await doFetch();
  }

  if (!res.ok) {
    return { status: res.status, json: null, fromCache: false };
  }

  const text = await res.text();
  const json = parseBody<T>(text);

  if (options.useEtag) {
    const etag = readEtagHeader(res);
    if (etag && text) {
      void writeEntry(options.cacheKey, etag, text);
    }
  }

  return { status: res.status, json, fromCache: false };
}
