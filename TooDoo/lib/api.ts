export const API_BASE_URL =
	process.env.EXPO_PUBLIC_API_URL ?? 'https://toodoo-backend-production-10ee.up.railway.app';

export function apiUrl(path: string) {
	if (!path.startsWith('/')) return `${API_BASE_URL}/${path}`;
	return `${API_BASE_URL}${path}`;
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
