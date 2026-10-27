# Live taxi discovery QA

## Intended behavior
- A moving taxi reveals a buffered strip of map along **travelled** coordinates, not its entire proposed route.
- Exploration persists in the existing `exploredTerritory` save property, including cloud saves.
- Existing **Add to my territory** / `expandTerritory` remains untouched: purchased territory expansions still cost money, and exploration never purchases one.
- Existing completed-trip route discovery remains as a backfill for time spent away from the map or browser.
- A 6-second/80-metre throttle limits expensive geometry unions. Discontinuities over 3 km are ignored instead of revealing fictional straight-line corridors.

## Verify in Vercel
1. Start a new company and verify the original **Add to my territory** interaction and its cash deduction.
2. Start a taxi journey into an unrevealed area. Observe the locked-territory mask retreat progressively, not all at once.
3. Zoom and pan during a journey. Verify discovery does not flash or reset.
4. Refresh mid-journey. Verify already revealed territory persists.
5. Let a journey complete with the browser closed. Reopen and confirm the completed-trip backfill still reveals its route.
6. Save and restore through Supabase. Verify both paid territory and explored road coverage survive.
7. Confirm driving does not create a purchased territory expansion or charge money.
8. Run `pnpm run build` and check browser performance on multiple simultaneous taxis.

## Scope
This change deliberately preserves the existing map visuals and territory purchase controls. It does not introduce a new exploration currency or change business licensing.
