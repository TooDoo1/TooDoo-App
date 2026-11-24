export const API_BASE_URL =
	process.env.EXPO_PUBLIC_API_URL ?? 'https://toodoo-backend-production-21f4.up.railway.app';

export function apiUrl(path: string) {
	if (!path.startsWith('/')) return `${API_BASE_URL}/${path}`;
	return `${API_BASE_URL}${path}`;
}

export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

/**
 * fetch with an abort deadline. Hung requests on flaky mobile networks otherwise
 * never settle, which leaves loading spinners up forever.
 */
export async function fetchWithTimeout(
	input: string,
	init: RequestInit = {},
	timeoutMs = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Response> {
	const controller = new AbortController();
	const outerSignal = init.signal;
	const onOuterAbort = () => controller.abort();
	if (outerSignal) {
		if (outerSignal.aborted) controller.abort();
		else outerSignal.addEventListener('abort', onOuterAbort);
	}
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(input, { ...init, signal: controller.signal });
	} finally {
		clearTimeout(timeoutId);
		outerSignal?.removeEventListener('abort', onOuterAbort);
	}
}

export function isAbortError(error: unknown) {
	return (
		typeof error === 'object' &&
		error !== null &&
		'name' in error &&
		(error as { name?: unknown }).name === 'AbortError'
	);
}

function ensureHttps(url: string) {
	if (url.startsWith('http://')) {
		return `https://${url.slice('http://'.length)}`;
	}
	return url;
}

/** Backend sometimes stores relative paths with Windows `\\` separators; URLs must use `/`. */
export function normalizeImageUrl(raw?: unknown) {
	if (typeof raw !== 'string') return undefined;
	const trimmed = raw.trim().replace(/\\/g, '/');
	if (!trimmed) return undefined;
	if (trimmed.startsWith('https://')) return trimmed;
	if (trimmed.startsWith('http://')) return ensureHttps(trimmed);
	if (trimmed.startsWith('//')) return `https:${trimmed}`;
	if (trimmed.startsWith('/')) return apiUrl(trimmed);
	return apiUrl(`/${trimmed}`);
}
