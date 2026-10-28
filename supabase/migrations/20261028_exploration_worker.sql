-- WorldFront exploration worker: run once in Supabase SQL Editor.
create table if not exists public.exploration_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id text not null,
  vehicle_id text not null,
  completed_at timestamptz not null,
  segments jsonb not null check (jsonb_typeof(segments) = 'array'),
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (user_id, job_id)
);
create index if not exists exploration_jobs_queue_idx
  on public.exploration_jobs(status, available_at);
create table if not exists public.exploration_territories (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id text not null,
  territory jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, job_id)
);
alter table public.exploration_jobs enable row level security;
alter table public.exploration_territories enable row level security;
revoke all on public.exploration_jobs from anon, authenticated;
revoke all on public.exploration_territories from anon, authenticated;
grant select on public.exploration_jobs to authenticated;
grant select on public.exploration_territories to authenticated;
create policy "Owner reads exploration jobs" on public.exploration_jobs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Owner reads exploration territory" on public.exploration_territories
  for select to authenticated using (user_id = (select auth.uid()));
-- Clients cannot claim jobs or submit arbitrary completed routes.
-- A validated server endpoint using the service key must enqueue missions.
create or replace function public.claim_exploration_jobs(p_worker text, p_limit integer default 3)
returns setof public.exploration_jobs
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  with selected as (
    select id from public.exploration_jobs
    where (status in ('pending','failed') and available_at <= now())
       or (status = 'processing' and locked_at < now() - interval '5 minutes')
    order by available_at, created_at
    for update skip locked
    limit least(greatest(p_limit, 1), 10)
  )
  update public.exploration_jobs j
  set status = 'processing', locked_at = now(), locked_by = p_worker, attempts = attempts + 1
  from selected where j.id = selected.id returning j.*;
end $$;
create or replace function public.complete_exploration_job(p_job_id uuid, p_worker text, p_territory jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_user uuid; v_job text;
begin
  select user_id, job_id into v_user, v_job
  from public.exploration_jobs
  where id = p_job_id and status = 'processing' and locked_by = p_worker
  for update;
  if not found then raise exception 'Exploration claim not held'; end if;
  insert into public.exploration_territories(user_id, job_id, territory)
  values(v_user, v_job, p_territory)
  on conflict(user_id, job_id) do update
    set territory = excluded.territory, updated_at = now();
  update public.exploration_jobs set status='completed', processed_at=now(),
    locked_at=null, locked_by=null, last_error=null where id=p_job_id;
end $$;
create or replace function public.retry_exploration_job(p_job_id uuid, p_worker text, p_error text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.exploration_jobs
  set status='failed', locked_at=null, locked_by=null,
    last_error=left(p_error,500),
    available_at=now() + make_interval(secs => least(300, 5 * power(2, least(attempts, 6))::integer))
  where id=p_job_id and status='processing' and locked_by=p_worker;
end $$;
revoke all on function public.claim_exploration_jobs(text,integer) from public, anon, authenticated;
revoke all on function public.complete_exploration_job(uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.retry_exploration_job(uuid,text,text) from public, anon, authenticated;
grant execute on function public.claim_exploration_jobs(text,integer) to service_role;
grant execute on function public.complete_exploration_job(uuid,text,jsonb) to service_role;
grant execute on function public.retry_exploration_job(uuid,text,text) to service_role;
-- Read-only Realtime events, scoped to the authenticated owner by RLS.
do $$
begin
  alter publication supabase_realtime add table public.exploration_territories;
exception when duplicate_object then null;
end $$;
