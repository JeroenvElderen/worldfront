# Travel Empire

A mobile-first transport and travel management game foundation built around the real-world Mapbox map.

## Getting started

1. Install [Ollama](https://ollama.com), then download the free local model:

   ```bash
   ollama pull llama3.2
   ```

2. Copy the environment template and optionally add a Mapbox key:

   ```bash
   cp .env.example .env
   ```

3. Install and start the browser build (leave Ollama running):

   ```bash
   pnpm install
   pnpm dev
   ```

Vite prints the local URL (normally `http://localhost:5173`). Without a Mapbox token the game remains usable with a clearly labelled map fallback, but Mapbox streets and navigation are only loaded once `VITE_MAPBOX_ACCESS_TOKEN` is configured.

## AI-generated taxi requests

You do **not** need an API key, subscription, paid AI service, or separate endpoint for private local use. The Vite development server provides `/api/jobs` and talks to [Ollama](https://ollama.com) on your computer. The default `llama3.2` model runs locally, so job prompts and results are not sent to a hosted AI provider.

The built-in endpoint exists while running `pnpm dev`, which is the recommended setup for private play. It first loads named points of interest within 15 km of the city from OpenStreetMap's Overpass API, then requires Ollama to select from those IDs. Labels and coordinates are copied from the map data rather than invented by the model, so shops, stations, landmarks, and other venues appear at their real mapped positions. Results are cached for six hours. You can change `OLLAMA_MODEL`, `OLLAMA_BASE_URL`, or `OVERPASS_API_URL` in `.env`. A standalone deployed web or Android build cannot reach the development server; that use case still needs an accessible backend set through `VITE_AI_JOBS_ENDPOINT`; custom backends should apply equivalent location grounding.

The app sends a `POST` request like this:

```json
{
  "city": { "name": "Dublin", "countryCode": "IE", "center": [-6.2603, 53.3498] },
  "count": 4,
  "excludeRoutes": ["central station→riverside hotel"],
  "instructions": "Create varied taxi requests between real, currently mapped places..."
}
```

The endpoint must return JSON in this shape (coordinates are `[longitude, latitude]`):

```json
{
  "jobs": [{
    "passengerName": "Maya O'Brien",
    "partySize": 2,
    "pickupLabel": "Chester Beatty Library",
    "pickup": [-6.2675, 53.3421],
    "destinationLabel": "Clontarf Promenade",
    "destination": [-6.1911, 53.3632]
  }]
}
```

The built-in handler gives Ollama a catalog of real OpenStreetMap place IDs, validates the selected IDs, and replaces them with the authoritative mapped labels and coordinates before responding in the public shape above. The client validates every result, calculates gameplay values itself, rejects duplicate routes, and retains the last 100 route signatures in the autosave so future prompts can avoid them.

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

The game includes the first-time city flow, local autosave, starter company, fleet purchasing, map base marker, HUD, and navigable game sections. An AI-generated taxi request arrives every 30 seconds (up to six open offers), and each available taxi can take its own metered fare, calculated from the passenger's actual journey distance. Every taxi remains visible on the map; when dispatched it drives from its current position to the pickup before continuing to the destination on an accelerated game clock. With a Mapbox token these routes use `driving-traffic`, so they follow drivable roads and current traffic-aware restrictions rather than drawing straight lines. Hiring, travel agencies and multiple save-slot UI are reserved for future milestones. The IndexedDB save schema uses a named `autosave` key so additional slots can be introduced without replacing the persistence layer.
