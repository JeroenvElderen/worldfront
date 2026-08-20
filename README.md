# Travel Empire

A mobile-first transport and travel management game foundation built around the real-world Mapbox map.

## Getting started

1. Install and start the browser build:

   ```bash
   pnpm install
   pnpm dev
   ```

Vite prints the local URL (normally `http://localhost:5173`). The bundled public Mapbox token loads the map and generates taxi requests from real Mapbox places, so no environment file is required.

## Taxi requests

When a taxi is available, the phone searches Mapbox directly for real points of interest around that taxi's current location, then the game's own on-device selection logic creates varied journeys from those authoritative names and coordinates. Incoming requests appear as calls over the map instead of living in a separate jobs tab, and can be accepted or declined immediately. No Ollama installation, AI provider, game server, custom HTTP endpoint, tunnel, or curated location list is required. Routes start at 6 km, Mapbox results are cached for the current app session, and the last 100 route signatures remain in the autosave to keep offers varied.

The Mapbox public token is embedded in the app and should use URL/app restrictions appropriate for a public client. Mapbox network access is required when a city is first searched; previously loaded offers and saved game data remain on the device.

## Battery use

The map is deliberately updated once per second while a taxi is moving instead
of continuously rendering at the display frame rate. Journey timers and Mapbox
rendering stop whenever the app is
in the background, then catch up from the saved timestamps as soon as it becomes
visible again. New job offers are generated in response to an idle taxi rather
than from a repeating 30-second timer. Tile-expiry refreshes and label fades are
also disabled, and the tile cache is capped, which avoids recurring network,
CPU, GPU, and memory work without changing game outcomes.

Vehicles are rendered as small, color-coded map dots: green taxis are available,
orange taxis are driving to a pickup, and red taxis have their client aboard.
Active journeys follow a thin route line, and selecting a job highlights the
road route the nearest available driver will take to its pickup and destination.

## Postal service

The Fleet dealership also sells postal vans. Dispatching one generates an
automatic local delivery round of between one and eight hours, with the number
and positions of its stops varied for every working day. Numbered stop markers
and the remaining route appear on the map, and the van follows Mapbox's
traffic-aware road geometry before returning to its depot. Longer rounds carry
larger rewards and energy costs. Finishing a round earns cash and reputation,
and the van can then be dispatched again; unlike taxis, postal vehicles do not
wait for individual customer job offers.

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

Android Studio with its Android SDK is the supported desktop workflow for compiling and running the native project.

Building directly on an Android phone is also possible when an ARM-compatible Android SDK is already installed. See the step-by-step [Termux installation guide](TERMUX.md) for setup, APK creation, and installation.

## Quality commands

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## Current milestone

The game includes the first-time city flow, local autosave, starter company, fleet purchasing, map base marker, HUD, and navigable game sections. When a taxi becomes available, a locally generated taxi call is requested immediately, with at most one open call per available taxi; there is no periodic polling timer. Each available taxi can take its own metered fare, calculated from the passenger's actual journey distance. Completed jobs earn reputation, with every 50 reputation advancing the company one level. Level 1 journeys start at 6 km and are capped at 10 km with one vehicle, 15 km with two, and 20 km with three or more; after level 1, every level unlocks another 20 km of job range without an artificial distance cap, eventually opening the whole country. Every taxi remains visible on the map; when dispatched it drives from its current position to the pickup before continuing to the destination at eight times real-world speed, so the trip takes an eighth of its estimated real-world time. With a Mapbox token these routes use `driving-traffic`, so they follow drivable roads and current traffic-aware restrictions rather than drawing straight lines. Travel agencies and multiple save-slot UI are reserved for future milestones. The IndexedDB save schema uses a named `autosave` key so additional slots can be introduced without replacing the persistence layer.

Early-company management includes four rotating driver candidates with gameplay traits, daily and weekly goals, categorized passenger requests with vehicle requirements, satisfaction-based tips and reputation, vehicle wear and three maintenance plans, functional upgrades, and per-vehicle refueling strategies. Newly purchased vehicles are delivered without a driver and must be staffed from the Company screen; the starter taxi includes a careful driver so a new game remains immediately playable.

Fleet operations now track energy and driver fatigue. A taxi that runs low automatically drives to a fuel or charging station; a tired driver takes the taxi home to rest, with both recovery journeys shown on the map. Players can select day or night shifts in Fleet. The Company screen offers interest-bearing loans, while the dealership supports vehicle leasing and owned vehicles can be sold at a condition-adjusted value. The HUD shows an accelerated calendar and clock, advancing one game minute per real second. Recurring driver, lease, and loan payments are collected at the start of each game month. Timed city events create temporary fare and energy-use modifiers and are announced above the map.
