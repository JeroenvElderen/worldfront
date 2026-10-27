# Maritime data integration

## Required setup
Harbour construction now succeeds within owned territory even if ferry data services are offline. No new environment variables are required for this basic fix. The existing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY enable optional maritime registry reads.

To enable the shared registry, run `supabase/maritime-registry.sql` in the Supabase SQL Editor. The migration is additive and does not touch saves. It creates `maritime_ports` and `maritime_connections` with public read policies, and no browser write policies. A trusted ingestion process must populate verified ports and connections. An empty registry automatically falls back to existing curated/OSM routes.

## Data-provider roadmap (not yet connected)
- OpenStreetMap/Overpass: existing geographic fallback.
- Ferryhopper: optional passenger connections, only after API availability and reuse permissions are verified.
- Ferrylines: optional reference data, only with permission to systematically ingest and reuse.
- MarineTraffic: optional vessel movement and port-call signals, requires an authorised API plan.
- Seavec: optional water-safe path geometry, requires API access.
- OpenTripPlanner: self-hosted routing engine, requires licensed ferry timetable feeds (GTFS or equivalent); not a global data source.

Never put provider secrets in `VITE_*` variables. Vite exposes these values to browsers. Integrate licensed providers through server-side Supabase Edge Functions or another authenticated backend, with provider keys stored as server secrets. The optional registry is read-only from the client.

## Route data model
Use stable provider-specific port IDs and store deduplicated verified connections by origin/destination port IDs. `route_coordinates` is a GeoJSON-like array of `[longitude,latitude]` points (not a GeoJSON object). Only rows with verified navigable geometry become playable routes. Route length is not capped. The 3 km tolerance in the client only selects the port at the user's tap; it is **not** a destination or journey-distance limit.

## Verification
1. Build a harbour inside owned territory while offline: purchase should succeed; no routes fabricated.
2. Insert a verified port and connection with valid geometry via a trusted admin session, then construct a harbour nearby: registry route should appear.
3. With an empty registry, curated and OpenStreetMap lookups should continue to work.
4. Check that user saves are unchanged and only one €5,000 transaction is recorded per purchase.
