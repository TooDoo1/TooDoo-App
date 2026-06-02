# TooDoo Frontend

TooDoo is an Expo Router mobile app for discovering offers and events, viewing offer details, and signing in or registering user and company accounts. The active app lives in [TooDoo/](TooDoo/). The files at the repository root are legacy web artifacts and are not the current app entry point.

## Project Overview

TooDoo helps users browse curated offers and events, then open each item for details such as location, contact information, website, and active deal status. The app also provides login and registration flows for users and companies.

The problem it solves is simple: it gives one place to discover promotions and event-like experiences, then moves a user from browsing to account creation or sign-in when they want to save or use offers.

High-level architecture:

- Expo Router powers navigation from [TooDoo/app/](TooDoo/app/).
- Bottom tabs define the main flows: discovery, saved offers, login, and onboarding.
- The app calls a small backend for authentication and uses external services for maps and geocoding.
- Most of the app content is currently hardcoded sample data, so TODO: Confirm this if production data is expected to come from an API.

## Key Concepts / Domain Overview

- Offer / deal: a card that may include a discount, claim count, amount available, and expiration date.
- Discovery feed: the main browse screen where users filter categories like family, events, food, and sports.
- Saved offers: the "Mina Erbjudanden" area, which currently behaves like an entry point to sign in rather than a fully wired saved-items dashboard.
- Account type: the UI distinguishes between `user` and `company` for login and registration.
- Personality onboarding: a short preference flow that asks for basic profile information and interests after registration.
- Claim count: the visible count of how many offer redemptions have been used versus the total available.
- TODO: Confirm this - there is no persistence layer in the client for saved preferences, claims, or profile completion.

## Tech Stack

- Language: TypeScript
- UI framework: React Native
- App framework: Expo
- Navigation: Expo Router and React Navigation
- Styling: NativeWind and Tailwind CSS utilities
- Media and UI helpers: `expo-blur`, `expo-linear-gradient`, `expo-haptics`, `expo-image`, `react-native-maps`
- Backend communication: `fetch`
- Tooling: ESLint, TypeScript, Expo CLI

Important dependencies from [TooDoo/package.json](TooDoo/package.json): `expo`, `expo-router`, `react`, `react-native`, `nativewind`, `react-native-maps`, and `react-native-reanimated`.

## Getting Started (For Developers)

### Prerequisites

- Node.js 20+ recommended
- npm
- Windows PowerShell, macOS Terminal, or a shell that can run Expo CLI
- An Android emulator, iOS simulator, or a physical device if you want to test on mobile

### Installation

```powershell
cd TooDoo
npm install
```

### Run Locally

```powershell
cd TooDoo
npm start
```

Platform-specific commands:

```powershell
npm run android
npm run ios
npm run web
```

Use `npm start` instead of `npx expo start` on Windows PowerShell if you hit the `npx.ps1` execution policy error.

### Environment Variables

The client reads one environment variable for the backend base URL:

```powershell
EXPO_PUBLIC_API_URL=https://example-backend.com
```

If `EXPO_PUBLIC_API_URL` is not set, the app falls back to:

```text
https://toodoo-backend-ejml.onrender.com
```

TODO: Confirm this - the repo does not currently include a checked-in `.env.example` file.

### Tests

There is no dedicated automated test command in [TooDoo/package.json](TooDoo/package.json).

Current verification options:

```powershell
npm run lint
```

TODO: Confirm this - if you want unit or integration tests, add a `test` script and document it here.

### Common Issues / Troubleshooting

- If Expo says it cannot find `package.json`, you are probably running commands from the repository root instead of [TooDoo/](TooDoo/).
- If PowerShell blocks `npx`, use `npm start` from [TooDoo/](TooDoo/).
- If login or registration fails with a network error, confirm `EXPO_PUBLIC_API_URL` points to a reachable backend.
- If maps do not load, the offer detail screen depends on `react-native-maps` and external geocoding from Nominatim.

## Project Structure

```text
TooDoo/
	app/
		_layout.tsx          Root navigation and theme setup
		modal.tsx            Modal route
		(tabs)/              Tab-based app flows
			_layout.tsx        Bottom tab configuration
			index.tsx          Main discovery feed
			MinaDeals.tsx      Saved offers entry point
			Loggain.tsx        Login screen
			Registrering.tsx   Registration screen
			Personality.tsx    Onboarding / preferences flow
			Erbjudanden.tsx    Offer detail screen
	components/            Shared UI components
	constants/             Theme and app-wide constants
	hooks/                 Reusable hooks such as color-scheme helpers
	assets/                Images and other static assets
	scripts/               Project maintenance scripts
```

Where to start reading code:

- [TooDoo/app/_layout.tsx](TooDoo/app/_layout.tsx) for app bootstrap and navigation.
- [TooDoo/app/(tabs)/_layout.tsx](TooDoo/app/%28tabs%29/_layout.tsx) for the tab structure.
- [TooDoo/app/(tabs)/index.tsx](TooDoo/app/%28tabs%29/index.tsx) for the main user journey.
- [TooDoo/app/(tabs)/Erbjudanden.tsx](TooDoo/app/%28tabs%29/Erbjudanden.tsx) for offer detail behavior.
- [TooDoo/app/(tabs)/Loggain.tsx](TooDoo/app/%28tabs%29/Loggain.tsx) and [TooDoo/app/(tabs)/Registrering.tsx](TooDoo/app/%28tabs%29/Registrering.tsx) for backend integration.

## API / Backend Contract (IMPORTANT)

The frontend currently talks to a backend at `EXPO_PUBLIC_API_URL`, or `https://toodoo-backend-ejml.onrender.com` by default.

### Endpoint Summary

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/user/login` | Authenticate a user or company account |
| POST | `/user/register` | Create a new user or company account |

### POST /user/login

Authenticates a login request from the login screen.

Request example:

```json
{
	"email": "user@example.com",
	"password": "secret123"
}
```

Expected success response:

```json
{
	"token": "jwt-or-session-token"
}
```

Known client-handled errors:

| Status | Meaning | Example response |
| --- | --- | --- |
| 401 | Invalid credentials | `{ "error": "Invalid credentials" }` |
| 4xx/5xx | Other failure | `{ "error": "Kunde inte logga in just nu." }` or backend-specific text |

Notes:

- The client only checks for `data.token` on HTTP 200.
- TODO: Confirm this - the app does not currently persist the token after login.
- TODO: Confirm this - account type (`user` vs `company`) is selected in the UI, but the request body does not include it.

### POST /user/register

Creates a new account from the registration screen.

Request example for a user account:

```json
{
	"email": "user@example.com",
	"password": "secret123"
}
```

Request example for a company account:

```json
{
	"email": "company@example.com",
	"password": "secret123",
	"name": "Acme AB"
}
```

Expected success response:

```json
{}
```

The client only checks for HTTP 201 and then navigates to the onboarding flow.

Known client-handled errors:

| Status | Meaning | Example response |
| --- | --- | --- |
| 409 | Email already exists | `{ "error": "Email already exists" }` |
| 4xx/5xx | Other failure | `{ "error": "Kunde inte registrera just nu." }` or backend-specific text |

Notes:

- The client validates that email, password, and password confirmation are present before calling the API.
- The password must be at least 8 characters on the client side.
- TODO: Confirm this - company registration requires a name in the UI, but the backend contract is not documented elsewhere in the repo.

### Authentication

- Current auth style: email and password login that returns a token.
- Token handling: TODO: Confirm this, because the client does not currently store or reuse the token.
- There is no documented refresh-token, logout, or session-expiry flow in the client code.

### Error Format

The client expects JSON with an `error` field when the backend wants to communicate a failure:

```json
{
	"error": "Human-readable message"
}
```

If JSON parsing fails or the network request fails, the app shows a generic network error alert.

## How to Contribute

Branching strategy:

- TODO: Confirm this - no branch policy is documented in the repository.
- Recommended default: one feature branch per change, merged through a pull request.

Code style expectations:

- Match the existing TypeScript and React Native style.
- Keep screens focused and avoid adding unused abstractions.
- Reuse existing utility classes and shared components where possible.
- Prefer explicit data flow over hidden global state.

PR process:

- Describe the user-facing change.
- Include screenshots or short screen recordings for UI updates.
- Mention any backend contract changes, new environment variables, or migration steps.
- Run `npm run lint` before opening the PR.

## Usage (For Non-Developers)

The app is used in three broad ways:

1. Browse the discovery feed on the "Upptäck" tab.
2. Open an item to view its details, map link, website link, and offer state.
3. Log in or register if you want to move into account-based flows.

Example workflow:

```text
Open app -> browse categories -> tap an offer -> view details -> open map or website -> log in or register if needed
```

Inputs and outputs:

- Inputs are mostly taps, email/password fields, and category selections.
- Outputs are offer cards, detail pages, alerts, and navigation between tabs and onboarding screens.

For stakeholders and external teams:

- The discovery feed is currently populated by local sample data.
- The authentication screens are wired to a backend, but the rest of the browsing experience is not yet API-driven.
- TODO: Confirm this - if production content should come from a CMS or backend, that integration is not in this repo yet.

## Integration Notes

What other systems this depends on:

- Backend auth service at `EXPO_PUBLIC_API_URL` or `https://toodoo-backend-ejml.onrender.com`
- Nominatim OpenStreetMap search for geocoding addresses in the offer detail screen
- Google Maps for opening address links
- External image URLs for some sample content

How other teams should use this frontend:

- Frontend teams should preserve the `/user/login` and `/user/register` request shapes unless the backend contract changes in sync.
- Backend teams should treat the current error handling as JSON-based with an `error` field.
- Product and stakeholder teams should know that most discovery content is hardcoded sample data and should be replaced before production if dynamic content is required.

Assumptions and limitations:

- The app does not currently expose a documented API for fetching offers.
- The login token is returned but not yet used for downstream authenticated requests.
- The offer feed uses mocked data with real-looking fields, so TODO: Confirm this before treating it as live content.

## Deployment

Deployment is not documented in the repository.

TODO: Confirm this - there is no clear CI/CD or release pipeline description in the codebase.

Likely environments, based on the current setup:

- Development: local Expo via `npm start`
- Testing: device or simulator connected to the local Expo server
- Production: TODO: Confirm this

## FAQ / Gotchas

- Why does `npx expo start` fail in PowerShell? PowerShell can block the `npx.ps1` shim. Use `npm start` from [TooDoo/](TooDoo/) instead.
- Why does Expo say `package.json` is missing? You are probably in the repository root instead of [TooDoo/](TooDoo/).
- Why do some screens look like demo content? The main discovery feed is currently sample data.
- Why do login and register work but the rest of the app does not show saved account state? The token is not persisted in the client yet.
- Why do map links sometimes fail? The offer detail view depends on geocoding and external map services.
- TODO: Confirm this - there is no automated test suite configured in the repository today.