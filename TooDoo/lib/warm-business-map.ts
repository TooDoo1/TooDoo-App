import { loadMapBusinesses } from '@/lib/business-map-data';
import { getEffectiveUserCoordsIfGranted } from '@/lib/geo';

let warmupStarted = false;

/**
 * Start loading map pin data during the splash so the explore map
 * paints immediately when the user opens it (or when splash exits onto it).
 * Uses already-granted location only — never opens the GPS prompt during splash.
 */
export function warmBusinessMapDuringStartup(): void {
	if (warmupStarted) return;
	warmupStarted = true;

	void getEffectiveUserCoordsIfGranted()
		.catch(() => null)
		.then((coords) => loadMapBusinesses(coords))
		.catch(() => {});
}
