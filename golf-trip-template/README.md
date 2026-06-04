# Golf Trip Scoring App

A React Native / Expo app for real-time golf trip scoring with team competition, player bios, and live leaderboards backed by Firebase Firestore.

## Features

- Live hole-by-hole scoring with Firestore real-time sync
- Team vs. team competition format
- Player bios with photos (Firebase Storage)
- Leaderboard and score summary views
- Supports 2 teams of up to 6 players each

## Stack

- **React Native** (Expo SDK 54)
- **Firebase** (Firestore for data, Storage for photos)
- **TypeScript**
- **EAS Build** for iOS/Android distribution

## Setup

### 1. Create a Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com) and create a new project
2. Enable **Firestore Database** (start in test mode for development)
3. Enable **Storage**
4. Register a Web app to get your config values

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your Firebase config values from the Firebase Console (Project Settings > Your apps).

### 3. Install dependencies

```bash
npm install
```

### 4. Customize your trip

Edit `src/config/gameConfig.ts`:

```typescript
export const TEAM_A_NAME = "Team Eagles";
export const TEAM_B_NAME = "Team Birdies";

export const PLAYERS: Player[] = [
  { id: "1a", name: "Alice", team: "A" },
  { id: "1b", name: "Bob",   team: "B" },
  // ... add all players
];
```

Edit `src/screens/HomeScreen.tsx` to update the trip name and destination.

Edit `src/screens/BiosScreen.tsx` to add player initials for the bios screen.

### 5. Run locally

```bash
npx expo start
```

Scan the QR code with Expo Go on your phone, or press `i` for iOS simulator / `a` for Android emulator.

### 6. Build for distribution (optional)

```bash
# Install EAS CLI
npm install -g eas-cli

# Log in to your Expo account
eas login

# Configure your project (updates eas.json with your project ID)
eas build:configure

# Build for iOS (requires Apple Developer account)
eas build --platform ios

# Build for Android
eas build --platform android
```

## Firestore data structure

```
games/{gameId}
  scores/{playerId}_{holeNumber}: { strokes: number }
  players/{playerId}: { name: string, team: "A"|"B", photoUrl?: string }
```

## Project structure

```
golf-trip-template/
├── App.tsx
├── app.json              # Expo config (update bundleIdentifier)
├── eas.json              # EAS build config
├── .env.example          # Firebase env var template
├── src/
│   ├── config/
│   │   └── gameConfig.ts # Players and team names — edit this first
│   ├── firebase/
│   │   └── config.ts     # Firebase init (reads from .env)
│   └── screens/
│       ├── HomeScreen.tsx
│       ├── ScoringScreen.tsx
│       ├── LeaderboardScreen.tsx
│       └── BiosScreen.tsx
```

## Notes

- The `.env` file is gitignored — never commit real Firebase credentials
- For production, consider enabling Firestore security rules to restrict read/write access
- Player photos are stored in Firebase Storage; upload them via the Firebase Console or a separate admin script
