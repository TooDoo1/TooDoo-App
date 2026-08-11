import { apiUrl } from '@/lib/api';

export type UserGender = 'MALE' | 'FEMALE' | 'NON_BINARY' | 'OTHER';

export type UserProfile = {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  gender?: UserGender | string;
  location?: string;
  notificationsEnabled?: boolean;
  interests?: Array<string | { id?: string; _id?: string; name?: string }>;
};

export const GENDER_OPTIONS: { label: string; value: UserGender }[] = [
  { label: 'Man', value: 'MALE' },
  { label: 'Kvinna', value: 'FEMALE' },
  { label: 'Ickebinär', value: 'NON_BINARY' },
  { label: 'Annat', value: 'OTHER' },
];

export function getProfileDisplayName(profile: UserProfile | null | undefined): string {
  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ');
  return name || profile?.email || 'Din profil';
}

export function normalizeInterestIds(
  interests: UserProfile['interests'] | undefined
): string[] {
  if (!Array.isArray(interests)) return [];

  return interests
    .map((item) => {
      if (typeof item === 'string') return item;
      return item?.id ?? item?._id ?? '';
    })
    .filter(Boolean);
}

export type CategoryOption = { id: string; name: string };

export async function fetchCategoryOptions(): Promise<CategoryOption[]> {
  const response = await fetch(apiUrl('/category'));
  const data = await response.json().catch(() => []);
  const categories = Array.isArray(data)
    ? data
    : Array.isArray(data?.categories)
      ? data.categories
      : Array.isArray(data?.data)
        ? data.data
        : [];

  return categories
    .map((item: { id?: string; _id?: string; name?: string }) => ({
      id: String(item.id ?? item._id ?? ''),
      name: String(item.name ?? '').trim(),
    }))
    .filter((item: CategoryOption) => Boolean(item.id && item.name));
}
