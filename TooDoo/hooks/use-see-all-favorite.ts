import { Alert } from 'react-native';

import { useAuth } from '@/context/auth-context';
import { useFavorites } from '@/context/favorites-context';
import { isPlaceholderNavigationId } from '@/lib/home-offers';

/** Favorite press for see-all cards: requires a business id + logged-in USER. */
export function useSeeAllFavorite(businessId?: string | null) {
  const { isLoggedIn, role } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();
  const resolvedId =
    businessId && !isPlaceholderNavigationId(businessId) ? String(businessId) : undefined;

  return {
    isFavorite: resolvedId ? isFavorite(resolvedId) : false,
    onFavoritePress: () => {
      if (!resolvedId) {
        Alert.alert('Kan inte spara favorit', 'Den här posten saknar en verksamhet att spara.');
        return;
      }
      if (!isLoggedIn || role !== 'USER') {
        Alert.alert('Logga in', 'Logga in som användare för att spara favoriter.');
        return;
      }
      void toggleFavorite(resolvedId);
    },
  };
}
