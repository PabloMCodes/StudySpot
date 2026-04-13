# StudySpot Mobile Frontend (React Native)

This frontend is now an Expo React Native app.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start development server:

```bash
npm run dev
```

3. Open preview:

- `i` for iOS simulator
- `a` for Android emulator
- `w` for web preview

## Environment

Set backend API URL:

```bash
EXPO_PUBLIC_API_URL=http://localhost:8000
```

Notes:
- iOS simulator can usually use `http://localhost:8000`
- Android emulator typically needs `http://10.0.2.2:8000`

## Map provider scaffold

The post-login home screen is now map-first and uses a map provider switch:

- `EXPO_PUBLIC_MAP_PROVIDER=fallback` (default) keeps the app fully usable in Expo Go.
- `EXPO_PUBLIC_MAP_PROVIDER=mapbox` enables the Mapbox path, which currently falls back to list mode until Mapbox rendering is wired.

Use npx expo start --tunnel --dev-client 
when working at school or annoying internet!!!!


Recommended team workflow:

1. Everyone keeps using Expo Go with `fallback`.
2. Mapbox feature work happens in a development build branch/path.
3. Once Mapbox is ready, only the Mapbox component implementation needs to change, not the app shell or auth flow.
