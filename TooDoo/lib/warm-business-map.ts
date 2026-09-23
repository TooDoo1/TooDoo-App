import { Platform } from 'react-native';

import { loadMapBusinesses } from '@/lib/business-map-data';
import { getEffectiveUserCoordsIfGranted } from '@/lib/geo';
import { warmMapPinImages } from '@/lib/map-business-pin';

let warmupStarted = false;

/**
 * Start loading map assets + pin data during the splash so the explore map
 * paints immediately when the user opens it (or when splash exits onto it).
 * Uses already-granted location only — never opens the GPS prompt during splash.
 */
export function warmBusinessMapDuringStartup(): void {
	if (warmupStarted) return;
	warmupStarted = true;

	void getEffectiveUserCoordsIfGranted()
		.catch(() => null)
		.then((coords) => loadMapBusinesses(coords))
		.then((businesses) => {
			// Businesses come back sorted by distance — decode the closest pin
			// avatars now so markers paint instantly when the map opens.
			if (Platform.OS === 'web' && businesses?.length) {
				warmMapPinImages(businesses.map((b) => b.imageUri));
			}
		})
		.catch(() => {});

	if (Platform.OS === 'web') {
		void import('@/components/ui/maplibre-map.web').then((mod) => {
			mod.prefetchBusinessMapAssets();
			mod.warmBusinessMapTiles();
		});
	}
}
