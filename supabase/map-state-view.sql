-- WorldFront map-state projection, backed by the existing revision-safe cloud save.
-- Run after supabase/schema.sql and supabase/atomic-save-migration.sql.
-- No separate writes or frame-by-frame taxi updates are required.
-- SECURITY INVOKER is essential: the owner's worldfront_saves RLS still applies.
-- Older installations may lack columns expected by the cloud-save client.
-- Add them without dropping the table or modifying existing saved games.
alter table public.worldfront_saves
  add column if not exists revision bigint not null default 0;
alter table public.worldfront_saves
  add column if not exists saved_at timestamptz not null default now();
create or replace view public.worldfront_map_state
with (security_invoker = true)
as
select
  s.user_id,
  s.revision,
  s.saved_at,
  coalesce(s.save_data -> 'vehicles', '[]'::jsonb) as vehicles,
  coalesce(s.save_data -> 'jobs', '[]'::jsonb) as missions,
  coalesce(s.save_data -> 'exploredTerritory', 'null'::jsonb) as explored_territory,
  coalesce(s.save_data -> 'territoryExpansions', '[]'::jsonb) as territory_expansions,
  coalesce(s.save_data -> 'branches', '[]'::jsonb) as branches,
  coalesce(s.save_data -> 'purchasedHarbours', '[]'::jsonb) as harbours,
  coalesce(s.save_data -> 'transportRoutes', '[]'::jsonb) as transport_routes
from public.worldfront_saves s;

revoke all on public.worldfront_map_state from public, anon;
grant select on public.worldfront_map_state to authenticated;

comment on view public.worldfront_map_state is
  'Read-only projection of the authoritative revisioned save for Mapbox markers, mission road routes and exploration. No per-frame database writes.';
