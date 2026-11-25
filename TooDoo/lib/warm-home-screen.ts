import { hydrateOfferCardImages } from '@/lib/business-image';
import {
	EVENT_FEED_DAYS,
	fetchEventFeed,
	resolveEventFeedCity,
	type EventFeedItem,
} from '@/lib/events-feed';
import { getEffectiveUserCoordsIfGranted, HELSINGBORG_COORDS } from '@/lib/geo';
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
	type HomeFilterCategory,
} from '@/lib/home-list-cache';
import { prefetchImageUris } from '@/lib/image-prefetch';
import { IMAGE_DISPLAY_WIDTH, sizedImageUrl } from '@/lib/image-url';

export type SettledHomeAssets = {
	deals: OfferCardItem[];
	nearYouCards: OfferCardItem[];
	hotOfferCards: OfferCardItem[];
};

/** Keep splash settle short — full image hydration continues after first paint. */
const SETTLE_BUDGET_MS = 1200;
const SPLASH_PREFETCH_LIMIT = 14;

function cardImageUri(card: OfferCardItem, displayWidth: number) {
	const raw =
		typeof card.image === 'object' && card.image && 'uri' in card.image && typeof card.image.uri === 'string'
			? card.image.uri
			: undefined;
	return sizedImageUrl(raw, displayWidth) ?? raw;
}

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
	/** Cap how many images we wait on (splash should stay lean). */
	prefetchLimit?: number;
}): Promise<SettledHomeAssets> {
	const {
		deals,
		nearYouCards,
		hotOfferCards,
		events = [],
		prefetchLimit = SPLASH_PREFETCH_LIMIT,
	} = options;
	const knownCards = [...deals, ...hotOfferCards, ...nearYouCards];

	const [hydratedDeals, hydratedHot, hydratedNear] = await Promise.all([
		hydrateOfferCardImages(deals, { knownCards }),
		hydrateOfferCardImages(hotOfferCards, { knownCards }),
		hydrateOfferCardImages(nearYouCards, { knownCards }),
	]);

	await prefetchImageUris(
		[
			...hydratedHot.slice(0, 4).map((card) => cardImageUri(card, IMAGE_DISPLAY_WIDTH.featured)),
			...hydratedDeals.slice(0, 6).map((card) => cardImageUri(card, IMAGE_DISPLAY_WIDTH.card)),
			...hydratedNear.slice(0, 4).map((card) => cardImageUri(card, IMAGE_DISPLAY_WIDTH.card)),
			...events.slice(0, 4).map((event) => event.image),
		],
		prefetchLimit
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
				categoryId: card.categoryId,
				categoryIds: card.categoryIds,
				categoryName: card.categoryName,
				openingHours: card.openingHours,
			};
		})
	);
}

function writePaintReadySnapshot(options: {
	categoryFilters: HomeFilterCategory[];
	deals: OfferCardItem[];
	nearYouCards: OfferCardItem[];
	hotOfferCards: OfferCardItem[];
	events: EventFeedItem[];
	cacheCity?: string | null;
}) {
	const { categoryFilters, deals, nearYouCards, hotOfferCards, events, cacheCity } = options;
	setHomeScreenSnapshot({
		categoryFilters,
		deals,
		nearYouCards,
		hotOfferCards,
	});
	setHomeEventsCache(events, cacheCity);
	setHomeHotOffersCache(hotOfferCards);
	setHomeEndingSoonCache(nearYouCards);
	cacheNearbyFromDeals(deals);
}

let homeWarmupStarted = false;

/**
 * Fetch + settle Upptäck during splash without opening the GPS permission prompt.
 * Permission can be requested after the frontpage is visible.
 *
 * Important: call onSettled as soon as paint-ready cards are cached. Image settle
 * continues in the background so the splash does not sit on a blank wait.
 */
export function warmHomeScreenDuringStartup(options?: {
	token?: string | null;
	/** Called once paint-ready data is cached (or failed), so splash can lift early. */
	onSettled?: () => void;
}): void {
	if (homeWarmupStarted) return;
	homeWarmupStarted = true;

	let released = false;
	const releaseSplash = () => {
		if (released) return;
		released = true;
		options?.onSettled?.();
	};

	void (async () => {
		try {
			if (hasFreshHomeScreenSnapshot()) {
				const snapshot = getHomeScreenSnapshot();
				const events = getHomeEventsCache() ?? [];
				// Cached cards are enough to paint — lift splash before image settle.
				releaseSplash();
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
			// Seed Helsingborg so the request key matches the home screen's first paint
			// and the two can share one in-flight fetchHomeScreenData call.
			const granted = await getEffectiveUserCoordsIfGranted().catch(() => null);
			const coords = granted ?? HELSINGBORG_COORDS;
			const eventCity = resolveEventFeedCity(undefined, coords);
			const data = await fetchHomeScreenData({
				token: options?.token ?? null,
				coords,
				city: eventCity,
			});
			const events =
				data.source === 'home' && Array.isArray(data.events)
					? data.events
					: await fetchEventFeed({ days: EVENT_FEED_DAYS, city: eventCity }).catch(
							() => [] as EventFeedItem[]
						);
			const cacheCity = data.resolvedCity ?? eventCity;

			// Paint-ready snapshot first, then release splash — don't wait on images.
			writePaintReadySnapshot({
				categoryFilters: data.categoryFilters,
				deals: data.deals,
				nearYouCards: data.nearYouCards,
				hotOfferCards: data.hotOfferCards,
				events,
				cacheCity,
			});
			releaseSplash();

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
		} finally {
			releaseSplash();
		}
	})();
}
