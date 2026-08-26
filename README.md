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

When a taxi is available, the phone searches Mapbox directly for real points of interest around that taxi's current location, including restaurants, parks, malls, dealerships, hospitals, offices, transport hubs, schools, entertainment and public services. The game's own on-device selection logic creates varied journeys from those authoritative names and coordinates. Incoming requests appear as calls over the map instead of living in a separate jobs tab, and can be accepted or declined immediately. A foreground watchdog retries failed generation after lifecycle or network interruptions. No Ollama installation, AI provider, game server, custom HTTP endpoint, tunnel, or curated location list is required. Routes start at 6 km, Mapbox results are cached for the current app session, and the last 100 route signatures remain in the autosave to keep offers varied.

The Mapbox public token is embedded in the app and should use URL/app restrictions appropriate for a public client. Mapbox network access is required when a city is first searched; previously loaded offers and saved game data remain on the device.

The Dispatch screen presents each call as a Travel Empire operation, with a service type, priority, reference number, dispatch window, and resource checklist. This operational layer reuses the existing nearest-suitable-taxi assignment and does not change vehicle markers, road routing, or journey behaviour.

## Battery use

The map is deliberately updated once per second while a taxi is moving instead
of continuously rendering at the display frame rate. Journey timers and Mapbox
rendering stop whenever the app is in the background, then journeys and other
deadlines catch up from their saved timestamps as soon as it becomes visible
again. New job offers are generated immediately in response to an idle taxi,
and a once-per-minute foreground refresh removes expired calls and replenishes
every available offer slot. Tile-expiry refreshes and label fades are also
disabled, and the tile cache is capped, which avoids unnecessary network, CPU,
GPU, and memory work without changing game outcomes.

Vehicles are rendered as small map dots, with a consistent purple marker for
every vehicle type and operating state.
Active journeys follow a thin route line, and selecting a job highlights the
road route the nearest available driver will take to its pickup and destination.
Completed taxi journeys uncover a focused 500-meter corridor around the route,
so expanding service territory requires meaningful travel through an area.

## Postal service

The Fleet dealership also sells postal vans. Dispatching one generates an
automatic local delivery round of between one and eight hours, with the number
and positions of its stops varied for every working day. Numbered stop markers
and the remaining route appear on the map, and the van follows Mapbox's
traffic-aware road geometry before returning to its depot. Longer rounds carry
larger rewards and energy costs. Finishing a round earns cash and reputation,
and the van can then be dispatched again; unlike taxis, postal vehicles do not
wait for individual customer job offers.

## Car rentals

The Travel screen includes a self-drive rental branch. Rental cars need no hired
driver: buy a car, rent it to a customer, and its purple marker automatically
roams real roads around the city without displaying a route line. Each rental
returns to the branch after a short trip and adds revenue, mileage, energy use,
condition wear, and electric-battery wear to the existing fleet lifecycle.

## Build an empire

Company progression now opens five connected management systems. At level 2,
players can establish branches around whichever location they choose and switch the live command map
between cities. Level 3 unlocks local travel agencies, player-created sightseeing
tours, and automatic tour dispatch. Dedicated 32-seat hybrid tour buses can be
purchased directly from the Travel screen, while 48-seat coaches serve scheduled
intercity routes. An operations manager can automatically accept taxi work
above a configurable minimum fare. Rotating airport, postal, and tourism contracts
offer milestone rewards, and each company can choose a permanent mobility,
tourism, logistics, or sustainability specialization.

## International network

At company level 3, operating licenses open eight European countries and their
city markets. Licensed cities support new local branches and become destinations
for the wider passenger network. Levels 4–6 introduce intercity trains, passenger
ferries, and regional airliners. Players purchase each asset, design routes from
their active city, dispatch a correctly positioned vehicle, and collect ticket
revenue and reputation when the scheduled service arrives. Assets retain their
location, condition, and lifetime revenue between journeys.

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

The game includes the first-time city flow, local autosave, starter company, fleet purchasing, map base marker, HUD, and navigable game sections. When a taxi becomes available, a locally generated taxi call is requested immediately, with at most one open call per available taxi; there is no periodic polling timer. Each available taxi can take its own metered fare, calculated from the passenger's actual journey distance. Completed jobs earn reputation, with every 50 reputation advancing the company one level. Level 1 journeys start at 6 km and are capped at 10 km with one vehicle, 15 km with two, and 20 km with three or more; after level 1, every level unlocks another 20 km of job range without an artificial distance cap, eventually opening the whole country. Every taxi remains visible on the map; when dispatched it drives from its current position to the pickup before continuing to the destination in real time. Taxis from the exclusive performance collection complete the same journey four times faster. With a Mapbox token these routes use `driving-traffic`, so they follow drivable roads and current traffic-aware restrictions rather than drawing straight lines. Multiple save-slot UI is reserved for a future milestone. The IndexedDB save schema uses a named `autosave` key so additional slots can be introduced without replacing the persistence layer.

Vehicle lifecycle management now tracks odometer mileage, age-based depreciation, lifetime revenue and expenses, escalating high-mileage service costs, major-service intervals, manufacturer warranty status, and electric-battery health. The Fleet screen estimates market value, net return, and replacement recommendations for every vehicle. A dedicated Financials tab records income and expenses in an on-device ledger, with cash flow, operating profit, category breakdowns, fleet value, debt, net worth, and recent transactions.

Vehicle interiors can be specialized with passenger Wi-Fi, climate control,
luggage storage, accessibility equipment, child seats, entertainment, security
partitions, premium seating, and luxury trim. Each vehicle receives a comfort
score that improves passenger satisfaction and tips, builds loyalty, increases
tour revenue, and qualifies equipped taxis for premium passenger categories.

Early-company management includes four rotating driver candidates with gameplay traits, daily and weekly goals, categorized passenger requests with vehicle requirements, satisfaction-based tips and reputation, vehicle wear and three maintenance plans, functional upgrades, and per-vehicle refueling strategies. Every listed research and vehicle-upgrade benefit is applied to its corresponding fare, request capacity, range, energy, wear, service, resale, construction, or fleet-capacity calculation; for example, a Smart roof sign keeps an additional passenger request available for its taxi, while Eco tires, Range packs, and Dash cameras now reduce energy use and wear on taxi, rental, postal, and scheduled journeys. Vehicle finance is available from level 1 so a new company can expand with a 10% deposit: a 36-month lease returns the car at the end of its term, while 48-month hire purchase transfers ownership after the final payment. Newly purchased, leased, or financed vehicles are delivered without a driver and must be staffed from the Company screen; the starter taxi includes a careful driver so a new game remains immediately playable.

Every station includes a facility builder, with three levels each for parking,
workshops, energy facilities, and driver lounges. These upgrades expand local
fleet capacity and reduce servicing, energy, and payroll costs.

The company operates under one name while its network grows like MissionChief:
the first station starts with one taxi, and the map’s plus button purchases and
places each additional station together with another taxi. Every station creates
a visible service area, can be selected from Company, and can be upgraded
independently.

The live map uses a pitched 3D view with terrain and extruded buildings where
Mapbox data is available. The Company screen also includes a four-discipline
technology tree. Company levels grant innovation points for permanent operations,
engineering, clean mobility, and infrastructure research, including fare,
service-radius, fleet-capacity, maintenance, energy, resale, and station-network
improvements.

Fleet operations now track energy and driver fatigue. A taxi that runs low automatically drives to a fuel or charging station; a tired driver takes the taxi home to rest, with both recovery journeys shown on the map. Players can select day or night shifts in Fleet. The Company screen offers interest-bearing loans, while the dealership supports vehicle leasing and owned vehicles can be sold at a condition-adjusted value. The HUD shows an accelerated calendar and clock running at twice real time, so one game minute passes every 30 real seconds. Recurring driver, lease, and loan payments are collected at the start of each game month. Timed city events create temporary fare and energy-use modifiers and are announced above the map.

Fatigued drivers now visibly follow a road route home instead of being moved
directly to their destination. When home is more than 12 km away, the driver
takes the vehicle to a nearby hotel for a paid overnight stay instead; the live
map shows the moving vehicle and its remaining recovery route.

The company Market center adds AI competitors with configurable aggression,
market share, partnerships, and acquisitions. Live rain, snow, storms, heat and
transport disruptions alter demand and operations, while poorly maintained
vehicles can require paid roadside recovery. Drivers now build careers through
experience, morale, trip records and specialist certifications; passengers build
loyalty across repeat journeys. Players can also choose a brand color, fare
position and timed marketing campaign, and configure departure time and frequency
for coach, rail, ferry and airline routes.
