-- Execute in Supabase SQL Editor. Never expose a service-role key in the browser.
create extension if not exists pgcrypto;

create table if not exists public.worldfront_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  save_data jsonb not null,
  saved_at timestamptz not null default now()
);

alter table public.worldfront_saves enable row level security;

create policy "Players read their own saves"
on public.worldfront_saves for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Players insert their own saves"
on public.worldfront_saves for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Players update their own saves"
on public.worldfront_saves for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
