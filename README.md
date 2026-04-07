# TooDoo Frontend

This repository has one active app in [TooDoo/](TooDoo/). The files at the repository root are older web artifacts and are not the current startup path.

## Start Here

1. Open a terminal in the repository root.
2. Move into the Expo app folder:

	```powershell
	cd TooDoo
	```

3. Install dependencies:

	```powershell
	npm install
	```

4. Start the app:

	```powershell
	npm start
	```

`npm start` uses the project script in [TooDoo/package.json](TooDoo/package.json), which avoids the PowerShell `npx.ps1` execution policy problem.

## Development Commands

```powershell
npm start        # Start Expo in development mode
npm run android  # Open the app in an Android emulator or device
npm run ios      # Open the app in iOS Simulator on macOS
npm run web      # Start the web build
npm run lint     # Run Expo lint checks
npm run reset-project  # Restore the starter app scaffold
```

## Project Layout

- [TooDoo/app/_layout.tsx](TooDoo/app/_layout.tsx) sets up the root navigation stack and theme provider.
- [TooDoo/app/(tabs)/_layout.tsx](TooDoo/app/%28tabs%29/_layout.tsx) defines the bottom tab navigation.
- [TooDoo/app/(tabs)/index.tsx](TooDoo/app/%28tabs%29/index.tsx) is the main discovery screen.
- [TooDoo/app/(tabs)/MinaDeals.tsx](TooDoo/app/%28tabs%29/MinaDeals.tsx) is the saved offers screen.
- [TooDoo/app/(tabs)/Loggain.tsx](TooDoo/app/%28tabs%29/Loggain.tsx), [TooDoo/app/(tabs)/Registrering.tsx](TooDoo/app/%28tabs%29/Registrering.tsx), and [TooDoo/app/(tabs)/Personality.tsx](TooDoo/app/%28tabs%29/Personality.tsx) cover the login and onboarding flow.
- [TooDoo/components/](TooDoo/components/) contains shared UI components.
- [TooDoo/constants/](TooDoo/constants/) contains theme and app-wide constants.
- [TooDoo/hooks/](TooDoo/hooks/) contains reusable hooks such as color-scheme helpers.

## New Developer Notes

- Run commands from [TooDoo/](TooDoo/), not the repository root.
- If you see a missing `package.json` error, you are in the wrong folder.
- If PowerShell blocks `npx`, use `npm start` instead of `npx expo start`.
- Expo Go works for fast device testing, but some features may need a development build.