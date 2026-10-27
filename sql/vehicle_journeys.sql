-- WorldFront: optional Supabase/PostgreSQL vehicle journey archive.
-- The current browser game persists route history in its existing IndexedDB
-- game save. This schema is for future authenticated cloud synchronization.
-- Run in the Supabase SQL editor only if you want cloud route storage.
create table if not exists public.vehicle_journeys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  save_id text not null,
  vehicle_id text not null,
  job_id text not null,
  completed_at timestamptz not null,
  distance_km double precision not null default 0 check (distance_km >= 0),
  route_coordinates jsonb not null,
  created_at timestamptz not null default now(),
  constraint vehicle_journeys_route_is_array check (jsonb_typeof(route_coordinates) = 'array'),
  constraint vehicle_journeys_owner_save_job_unique unique (owner_id, save_id, job_id)
);

create index if not exists vehicle_journeys_owner_vehicle_date_idx
  on public.vehicle_journeys (owner_id, save_id, vehicle_id, completed_at desc);

alter table public.vehicle_journeys enable row level security;

drop policy if exists "Owners read vehicle journeys" on public.vehicle_journeys;
create policy "Owners read vehicle journeys" on public.vehicle_journeys
  for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "Owners insert vehicle journeys" on public.vehicle_journeys;
create policy "Owners insert vehicle journeys" on public.vehicle_journeys
  for insert to authenticated with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners update vehicle journeys" on public.vehicle_journeys;
create policy "Owners update vehicle journeys" on public.vehicle_journeys
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners delete vehicle journeys" on public.vehicle_journeys;
create policy "Owners delete vehicle journeys" on public.vehicle_journeys
  for delete to authenticated using ((select auth.uid()) = owner_id);

comment on table public.vehicle_journeys is
  'Optional per-vehicle completed journey archive; road checkpoints are recorded during driving and exploration is unlocked only at passenger drop-off.';
