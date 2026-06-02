export const API_BASE_URL =
	process.env.EXPO_PUBLIC_API_URL ?? 'https://toodoo-backend-ejml.onrender.com';

export function apiUrl(path: string) {
	if (!path.startsWith('/')) return `${API_BASE_URL}/${path}`;
	return `${API_BASE_URL}${path}`;
}

/** Backend sometimes stores relative paths with Windows `\\` separators; URLs must use `/`. */
export function normalizeImageUrl(raw?: unknown) {
	if (typeof raw !== 'string') return undefined;
	const trimmed = raw.trim().replace(/\\/g, '/');
	if (!trimmed) return undefined;
	if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
	if (trimmed.startsWith('//')) return `https:${trimmed}`;
	if (trimmed.startsWith('/')) return apiUrl(trimmed);
	return apiUrl(`/${trimmed}`);
}
