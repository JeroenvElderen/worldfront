# Unified taxi, road and cloud integration — verification

This workstream builds on merged PRs #169–#171. It is **not** a complete server-authoritative simulation.

## Implemented
- Live taxi marker coordinates are collected during existing timestamp-driven animation without causing Zustand rerenders on every frame.
- A browser-local position cache is saved on pagehide; the map uses recent cached coordinates when recreating taxi sources.
- Supabase cloud snapshots include the most recently animated taxi positions, not only the last stationary store coordinates.
- Unknown road speed limits use a conservative 50 km/h fallback; known posted limits and vehicle top speed remain upper bounds.
- Optional cloud backups are stopped when polling detects a newer remote save. This is a best-effort conflict warning, not an atomic compare-and-swap.
- Existing closure rendering and route-alternative filtering from earlier PRs remain in place.

## Required manual verification (Vercel preview)
1. Run `pnpm run build` and `pnpm run lint` on the branch; resolve any failures.
2. Start a new company and buy a taxi. Confirm the top-view SVG appears immediately, never a permanent circle.
3. Assign two jobs; verify each taxi follows its own route and turns naturally.
4. While taxis are moving, refresh and switch cities. Verify markers and routes are restored and no duplicate layers are created.
5. Leave the tab and reopen it; check the taxi positions are restored from the browser cache and corrected by the job clock.
6. Sign into Supabase, opt into backups, wait 60 seconds, inspect `worldfront_saves.save_data.vehicles` for current taxi positions.
7. Sign into a second browser and update the same save. Verify the first browser pauses backups after its next remote check; **do not assume this prevents races**.
8. Introduce a road closure on an offered journey and confirm returned route alternatives avoid its coordinate or fail safely when no detour is available.
9. Verify roads are highlighted using the actual loaded road geometry. Check map zoom, style changes and closure expiration.
10. Verify explored territories, territory licenses and purchased branches are unchanged after saving and restoring.

## Not yet solved
- Exact OpenStreetMap road edge identifiers and closure ranges (current closure is coordinate-proximity based).
- Guaranteed rerouting of taxis already driving when a closure is generated.
- Server-authoritative, atomic, multi-device Supabase state synchronization.
- Durable per-segment speed-limit annotations for already-persisted taxi jobs.
- Browser or Vercel runtime tests; do not mark these as verified without evidence.

## Configuration
Supabase needs `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and the `public.worldfront_saves` table and RLS policies from `supabase/schema.sql`.
