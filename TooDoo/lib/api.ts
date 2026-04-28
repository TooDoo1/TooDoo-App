export const API_BASE_URL =
	process.env.EXPO_PUBLIC_API_URL ?? 'https://toodoo-backend-ejml.onrender.com';

export function apiUrl(path: string) {
	if (!path.startsWith('/')) return `${API_BASE_URL}/${path}`;
	return `${API_BASE_URL}${path}`;
}
