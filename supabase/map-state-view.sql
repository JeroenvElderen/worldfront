-- WorldFront map-state projection, backed by the existing revision-safe cloud save.
-- Run after supabase/schema.sql and supabase/atomic-save-migration.sql.
-- No separate writes or frame-by-frame taxi updates are required.
-- SECURITY INVOKER is essential: the owner's worldfront_saves RLS still applies.
-- Existing saves store JSON as TEXT in payload; preserve that schema.
create or replace view public.worldfront_map_state
with (security_invoker = true)
as
select
  s.user_id,
  s.revision,
  s.updated_at as saved_at,
  coalesce(s.payload::jsonb -> 'vehicles', '[]'::jsonb) as vehicles,
  coalesce(s.payload::jsonb -> 'jobs', '[]'::jsonb) as missions,
  coalesce(s.payload::jsonb -> 'exploredTerritory', 'null'::jsonb) as explored_territory,
  coalesce(s.payload::jsonb -> 'territoryExpansions', '[]'::jsonb) as territory_expansions,
  coalesce(s.payload::jsonb -> 'branches', '[]'::jsonb) as branches,
  coalesce(s.payload::jsonb -> 'purchasedHarbours', '[]'::jsonb) as harbours,
  coalesce(s.payload::jsonb -> 'transportRoutes', '[]'::jsonb) as transport_routes
from public.worldfront_saves s;

revoke all on public.worldfront_map_state from public, anon;
grant select on public.worldfront_map_state to authenticated;

comment on view public.worldfront_map_state is
  'Read-only projection of the authoritative revisioned save for Mapbox markers, mission road routes and exploration. No per-frame database writes.';
