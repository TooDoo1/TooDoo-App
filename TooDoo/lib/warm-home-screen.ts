import { hydrateOfferCardImages } from '@/lib/business-image';
import { fetchEventFeed, type EventFeedItem } from '@/lib/events-feed';
import { getEffectiveUserCoordsIfGranted } from '@/lib/geo';
import { heroSlides, resolveHeroImageUri } from '@/lib/hero-slides';
import { fetchHomeScreenData, type OfferCardItem } from '@/lib/home-offers';
import {
	getHomeEventsCache,
	getHomeScreenSnapshot,
	hasFreshHomeScreenSnapshot,
	setHomeEndingSoonCache,
	setHomeEventsCache,
	setHomeHotOffersCache,
	setHomeNearbyBusinessesCache,
	setHomeScreenSnapshot,
} from '@/lib/home-list-cache';
import { prefetchImageUris } from '@/lib/image-prefetch';

export type SettledHomeAssets = {
	deals: OfferCardItem[];
	nearYouCards: OfferCardItem[];
	hotOfferCards: OfferCardItem[];
};

const SETTLE_BUDGET_MS = 3500;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
	return new Promise((resolve) => {
		let settled = false;
		const timer = setTimeout(() => {
			if (!settled) {
				settled = true;
				resolve(null);
			}
		}, ms);
		void promise.then(
			(value) => {
				if (!settled) {
					settled = true;
					clearTimeout(timer);
					resolve(value);
				}
			},
			() => {
				if (!settled) {
					settled = true;
					clearTimeout(timer);
					resolve(null);
				}
			}
		);
	});
}

/** Hydrate card images and await first-viewport prefetch so Upptäck paints complete. */
export async function settleHomeScreenAssets(options: {
	deals: OfferCardItem[];
	nearYouCards: OfferCardItem[];
	hotOfferCards: OfferCardItem[];
	events?: EventFeedItem[];
}): Promise<SettledHomeAssets> {
	const { deals, nearYouCards, hotOfferCards, events = [] } = options;
	const knownCards = [...deals, ...hotOfferCards, ...nearYouCards];

	const [hydratedDeals, hydratedHot, hydratedNear] = await Promise.all([
		hydrateOfferCardImages(deals, { knownCards }),
		hydrateOfferCardImages(hotOfferCards, { knownCards }),
		hydrateOfferCardImages(nearYouCards, { knownCards }),
	]);

	await prefetchImageUris(
		[
			...heroSlides.map((slide) => resolveHeroImageUri(slide.source)),
			...hydratedDeals.slice(0, 12).map((card) => card.image),
			...hydratedNear.slice(0, 6).map((card) => card.image),
			...hydratedHot.slice(0, 6).map((card) => card.image),
			...events.slice(0, 6).map((event) => event.image),
		],
		28
	);

	return {
		deals: hydratedDeals,
		nearYouCards: hydratedNear,
		hotOfferCards: hydratedHot,
	};
}

/** Same as settleHomeScreenAssets, but never blocks the splash longer than the budget. */
export async function settleHomeScreenAssetsWithinBudget(
	options: Parameters<typeof settleHomeScreenAssets>[0],
	budgetMs = SETTLE_BUDGET_MS
): Promise<SettledHomeAssets> {
	const settled = await withTimeout(settleHomeScreenAssets(options), budgetMs);
	return (
		settled ?? {
			deals: options.deals,
			nearYouCards: options.nearYouCards,
			hotOfferCards: options.hotOfferCards,
		}
	);
}

function cacheNearbyFromDeals(deals: OfferCardItem[]) {
	setHomeNearbyBusinessesCache(
		deals.map((card) => {
			const uri =
				typeof card.image === 'object' &&
				card.image &&
				'uri' in card.image &&
				typeof card.image.uri === 'string'
					? card.image.uri
					: '';
			return {
				id: card.id,
				title: card.title,
				image: { uri },
				Adress: card.Adress,
				kortbeskrivning: card.kortbeskrivning,
				långbeskrivning: card.långbeskrivning,
				latitude: card.latitude,
				longitude: card.longitude,
				distanceKm: card.distanceKm,
			};
		})
	);
}

let homeWarmupStarted = false;

/**
 * Fetch + settle Upptäck during splash without opening the GPS permission prompt.
 * Permission can be requested after the frontpage is visible.
 */
export function warmHomeScreenDuringStartup(options?: { token?: string | null }): void {
	if (homeWarmupStarted) return;
	homeWarmupStarted = true;

	void (async () => {
		try {
			if (hasFreshHomeScreenSnapshot()) {
				const snapshot = getHomeScreenSnapshot();
				const events = getHomeEventsCache() ?? [];
				if (snapshot) {
					const settled = await settleHomeScreenAssetsWithinBudget({
						deals: snapshot.deals as OfferCardItem[],
						nearYouCards: snapshot.nearYouCards as OfferCardItem[],
						hotOfferCards: snapshot.hotOfferCards as OfferCardItem[],
						events,
					});
					setHomeScreenSnapshot({
						categoryFilters: snapshot.categoryFilters,
						deals: settled.deals,
						nearYouCards: settled.nearYouCards,
						hotOfferCards: settled.hotOfferCards,
					});
					setHomeHotOffersCache(settled.hotOfferCards);
					setHomeEndingSoonCache(settled.nearYouCards);
				}
				return;
			}

			// Never prompt for location during splash — that freezes the homepage load.
			const coords = await getEffectiveUserCoordsIfGranted().catch(() => null);
			const [data, events] = await Promise.all([
				fetchHomeScreenData({ token: options?.token ?? null, coords }),
				fetchEventFeed({ limit: 12 }).catch(() => [] as EventFeedItem[]),
			]);

			setHomeScreenSnapshot({
				categoryFilters: data.categoryFilters,
				deals: data.deals,
				nearYouCards: data.nearYouCards,
				hotOfferCards: data.hotOfferCards,
			});
			setHomeEventsCache(events);
			setHomeHotOffersCache(data.hotOfferCards);
			setHomeEndingSoonCache(data.nearYouCards);
			cacheNearbyFromDeals(data.deals);

			const settled = await settleHomeScreenAssetsWithinBudget({
				deals: data.deals,
				nearYouCards: data.nearYouCards,
				hotOfferCards: data.hotOfferCards,
				events,
			});

			setHomeScreenSnapshot({
				categoryFilters: data.categoryFilters,
				deals: settled.deals,
				nearYouCards: settled.nearYouCards,
				hotOfferCards: settled.hotOfferCards,
			});
			setHomeHotOffersCache(settled.hotOfferCards);
			setHomeEndingSoonCache(settled.nearYouCards);
		} catch {
			// Splash still has a max-duration safety valve.
		}
	})();
}
