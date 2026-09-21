# TooDoo

TooDoo is a cross-platform app for discovering local offers and business events, claiming deals with QR codes, and managing favorites and profile preferences. The active product lives in [`TooDoo/`](TooDoo/) — an **Expo Router** app targeting **iOS, Android, and web** (including installable PWA).

The repository root also contains legacy static web prototypes (`home.html`, `app.js`, `style.css`) that are **not** the current app entry point.

## Repository layout

```text
TooDoo-App/
  TooDoo/                 Main Expo app (use this for development)
  TooDoo-Backend/         Backend snippets / integration scaffolds (see below)
  README.md
  vercel.json             Vercel config for web builds (builds TooDoo/)
```

The production API is a separate **Express + Prisma** backend (deployed on Railway by default). This frontend talks to it over HTTPS via `EXPO_PUBLIC_API_URL`.

## What the app does

- **Upptäck** — personalized offer feeds (`/orders/for-you`, ending-soon, close), popular businesses (`/business/popular`), category filters, and unified search.
- **Sök** — `GET /search` / `POST /search/natural` return **businesses** and, for event/culture intents (konsert, jazz, vad händer, …), **cached public events** (`type: "event"`). The home search tips dropdown also surfaces matching events (suggestions alone stay business-only on the API).
- **Favoriter** — bookmark businesses (authenticated `USER` role).
- **Mina Erbjudanden** — claimed offers with redeem countdown, QR display, and optional worker QR scanning.
- **Evenemang** — business events (`/business-events`) plus city-scoped public events (`GET /events?city=…` from Municipio / Visit Sweden).
- **Company detail** — offers, events, claim flow, favorites, maps, and realtime invalidation via SSE.
- **Auth** — login, portal login for managers, registration, multi-step onboarding (`Registrering` → `Personality`), password reset.
- **Profil** — account settings, interests/categories, security, support links.

### Core concepts

| Concept | Description |
| --- | --- |
| **Order / offer** | A redeemable deal tied to a business, with publish window, daily redemption times, and optional caps. |
| **Claim** | User action that creates a QR code; redemption is validated at the business. |
| **Business event** | Scheduled listing from a TooDoo business (not claimable) with optional user interest. |
| **Cached public event** | External event from Municipio or Visit Sweden (`GET /events`, searchable via unified search as `type: "event"`). Detail uses the DB surrogate `id`. |
| **Category** | Interest/filter dimension; businesses can have multiple categories. |

## Tech stack

| Layer | Choice |
| --- | --- |
| Language | TypeScript |
| UI | React Native 0.81, Expo 54 |
| Navigation | Expo Router, React Navigation |
| Styling | NativeWind 4, Tailwind CSS |
| State | React context (auth, favorites, realtime, theme) |
| Persistence | AsyncStorage (auth session) |
| Maps / location | `react-native-maps`, `expo-location` |
| Web | `react-native-web`, Workbox service worker for PWA |
| API | `fetch` against TooDoo Backend REST + SSE |

## Getting started

### Prerequisites

- **Node.js 20+**
- **npm**
- iOS Simulator, Android emulator, or a physical device (optional for mobile)
- A running **TooDoo Backend** (local Docker Postgres + API, or the shared Railway deployment)

### Install and run

```bash
cd TooDoo
npm install
npm start          # Expo dev menu — press w / i / a for web / iOS / Android
```

You can also run the same scripts from the **repository root** (they forward to `TooDoo/`), e.g. `npm run web:lan:clear`.

Useful scripts:

| Command | Purpose |
| --- | --- |
| `npm run web` | Web dev server (localhost) |
| `npm run web:lan` | Web on your LAN IP (phone on same Wi-Fi) |
| `npm run web:lan:clear` | Same, with Metro cache cleared |
| `npm run build:web` | Static export + Workbox SW for production web |
| `npm run lint` | ESLint |

On **Windows PowerShell**, prefer `npm start` over `npx expo start` if execution policy blocks `npx.ps1`.

### Environment variables

Create `TooDoo/.env` (or set in your host/CI):

```bash
EXPO_PUBLIC_API_URL=https://your-backend.example.com
# Android MapView (react-native-maps) — required for release/dev builds on Android.
# iOS uses Apple Maps by default and does not need this key.
GOOGLE_MAPS_API_KEY=your-google-maps-sdk-key
```

If unset, the app defaults to:

```text
https://toodoo-backend-production-10ee.up.railway.app
```

Production web builds use [`TooDoo/.env.production`](TooDoo/.env.production) when configured for deploy.

**Maps:** OpenStreetMap data via **MapLibre + OpenFreeMap** on web (TooDoo pins/cards/categories on top). Native explore map uses Carto raster + the same pin data until MapLibre Native. Customize basemap in [Maputnik](https://maputnik.github.io/) — see [`TooDoo/public/map-styles/README.md`](TooDoo/public/map-styles/README.md). No Google.

**Image URLs:** API responses often return root-relative `publicUrl` paths (e.g. `/images/...`). On web, concatenate your API origin with that path when the SPA runs on a different host.

## Project structure (TooDoo)

```text
TooDoo/
  app/                      Expo Router screens
    (tabs)/                 Main tab flows (Upptäck, Favoriter, Erbjudanden, Logga in, Profil, …)
    company-detail.tsx      Business / offer detail stack screen
    business-map.tsx        Nearby businesses map (native MapView)
    sokresultat.tsx         Search results
    profile-*.tsx           Profile sub-screens
    _layout.tsx             Root stack + providers
  components/               UI (tab bar, carousels, claim cards, registration shell, …)
  context/                  Auth, favorites, realtime, theme
  lib/                      API client, feeds, search, claim helpers, category colors
  hooks/                    Realtime subscription, theme hooks
  assets/                   Images and icons
  public/                   PWA manifest, hero assets, service worker inputs
  global.css                Web-only styles (PWA, wheel picker, form zoom fix)
```

**Good entry points when reading code:**

- [`TooDoo/app/_layout.tsx`](TooDoo/app/_layout.tsx) — providers, stack, floating tab bar overlay
- [`TooDoo/app/(tabs)/index.tsx`](TooDoo/app/(tabs)/index.tsx) — home / discovery
- [`TooDoo/context/auth-context.tsx`](TooDoo/context/auth-context.tsx) — JWT session + `authFetch`
- [`TooDoo/lib/api.ts`](TooDoo/lib/api.ts) — API base URL and image URL normalization
- [`TooDoo/components/company-detail-screen.tsx`](TooDoo/components/company-detail-screen.tsx) — claim + detail UX

## Backend integration

The frontend expects the **TooDoo Backend** API (JWT auth, orders, businesses, claims, events, search, realtime SSE). Full API documentation lives with the backend service.

Common endpoints used by this app:

| Area | Examples |
| --- | --- |
| Auth | `POST /user/login`, `POST /user/register`, `POST /user/refresh`, `GET /user/me` |
| Offers | `GET /orders`, `GET /orders/for-you`, `GET /orders/for-you/ending-soon`, `GET /orders/for-you/close` |
| Businesses | `GET /business`, `GET /business/popular`, `GET /business/:id`, `POST /business/:id/click` |
| Search | `GET /search`, `GET /search/suggestions`, `POST /search/natural` (businesses + event-intent public events) |
| Claims | `POST /claim`, `GET /user/me/claims`, `POST /claim/validate` |
| Favorites | `POST /user/me/favorite-business/:id`, `DELETE /user/me/unfavorite-business/:id` |
| Events | `GET /business-events`, `GET /events?city=…`, `GET /events/:id` |
| Realtime | `GET /realtime/stream` (SSE; `?token=` on web EventSource) |

**Search contract:** results may be `type: "business"` or `type: "event"`. The app maps event hits to cards and opens `/municipio-event-detail` with the surrogate event `id`. Ignoring `type: "event"` would make event search look empty even when the API returns events.

**Auth:** responses include `token` and `refreshToken`. The client stores them in AsyncStorage and sends `Authorization: Bearer <token>` on protected routes.

**Errors:** JSON bodies with an `error` field; validation failures may include `details[]`.

## Web / PWA deployment

Web is built from `TooDoo/`:

```bash
cd TooDoo
npm run build:web
```

Root [`vercel.json`](vercel.json) points Vercel at `TooDoo/dist` after `npm run build:web --prefix TooDoo`. The app supports standalone PWA mode with viewport and tab-bar overlays tuned for iOS home-screen install.

## TooDoo-Backend folder in this repo

[`TooDoo-Backend/`](TooDoo-Backend/) currently holds **integration scaffolds** (e.g. search tips route/service) meant to be merged into the main backend repository. It is not a full standalone API checkout in this monorepo. Run the complete backend from its primary project or your Railway deployment.

## Verification

```bash
cd TooDoo
npm run lint
```

There is no automated frontend test suite in `package.json` today. Backend smoke/coverage tests live in the backend project.

## Troubleshooting

| Issue | Fix |
| --- | --- |
| `package.json` not found | Run commands from `TooDoo/`, not the repo root. |
| Network errors on login/feed | Check `EXPO_PUBLIC_API_URL` and backend health (`GET /health`). |
| Images broken on web | Prefix API origin onto root-relative `publicUrl` paths. |
| Phone cannot open dev URL | Use `npm run web:lan` and the printed LAN IP, not `localhost`. |
| iOS zoom on input focus | Web inputs use `font-size: 16px` in `global.css` to avoid Safari auto-zoom. |

## Contributing

- Branch per feature; open a PR with screenshots for UI changes.
- Match existing TypeScript / NativeWind patterns; avoid drive-by refactors.
- Run `npm run lint` before submitting.
- Document new `EXPO_PUBLIC_*` variables and any backend contract changes in this README.
