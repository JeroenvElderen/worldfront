# Travel Empire

A mobile-first transport and travel management game foundation built around the real-world Mapbox map.

## Getting started

1. Copy the environment template and add a public Mapbox access token:

   ```bash
   cp .env.example .env
   ```

2. Install and start the browser build:

   ```bash
   pnpm install
   pnpm dev
   ```

Vite prints the local URL (normally `http://localhost:5173`). Without a token the game remains usable with a clearly labelled map fallback, but Mapbox streets and navigation are only loaded once `VITE_MAPBOX_ACCESS_TOKEN` is configured.

## Android

The native project is generated from the Capacitor configuration after dependencies are installed:

```bash
pnpm exec cap add android
pnpm android:open
```

For later web changes, `pnpm android:open` builds the app, syncs the web bundle and opens Android Studio. To prepare/sync without opening Android Studio, run:

```bash
pnpm android:prepare
```

Android Studio and its Android SDK are required to compile and run the resulting native project.

## Quality commands

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## Current milestone

The game includes the first-time city flow, local autosave, starter company, fleet purchasing, map base marker, HUD, and navigable game sections. A random taxi request arrives every 30 seconds (up to six open offers), and each available taxi can take its own fare. Every taxi remains visible on the map; when dispatched it drives from its current position to the pickup before continuing to the destination. With a Mapbox token these routes use `driving-traffic`, so they follow drivable roads and current traffic-aware restrictions rather than drawing straight lines. Hiring, travel agencies and multiple save-slot UI are reserved for future milestones. The IndexedDB save schema uses a named `autosave` key so additional slots can be introduced without replacing the persistence layer.
