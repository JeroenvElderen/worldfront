-- Optional shared maritime registry. Run in Supabase SQL Editor.
-- Public read access only. Ingestion must run in a trusted server process.
create table if not exists public.maritime_ports (
  id text primary key,
  name text not null,
  country_code text,
  longitude double precision not null check (longitude between -180 and 180),
  latitude double precision not null check (latitude between -90 and 90),
  sources text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create table if not exists public.maritime_connections (
  id text primary key,
  origin_port_id text not null references public.maritime_ports(id),
  destination_port_id text not null references public.maritime_ports(id),
  name text not null,
  distance_km double precision,
  duration_minutes double precision,
  route_coordinates jsonb,
  sources text[] not null default '{}',
  verified_at timestamptz not null default now(),
  check (origin_port_id <> destination_port_id)
);
create index if not exists maritime_connections_origin_idx on public.maritime_connections(origin_port_id);
alter table public.maritime_ports enable row level security;
alter table public.maritime_connections enable row level security;
drop policy if exists "Anyone can read maritime ports" on public.maritime_ports;
create policy "Anyone can read maritime ports" on public.maritime_ports for select to anon, authenticated using (true);
drop policy if exists "Anyone can read maritime connections" on public.maritime_connections;
create policy "Anyone can read maritime connections" on public.maritime_connections for select to anon, authenticated using (true);
-- Do not grant insert/update/delete to anon or authenticated roles.
