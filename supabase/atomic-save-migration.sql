-- Apply in Supabase SQL Editor after supabase/schema.sql.
-- Atomic optimistic concurrency for one save per authenticated player.
alter table public.worldfront_saves add column if not exists revision bigint not null default 0;

create or replace function public.worldfront_save_if_current(
  expected_revision bigint,
  payload jsonb
) returns bigint language plpgsql security invoker set search_path = public as $$
declare next_revision bigint;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if expected_revision = 0 then
    insert into public.worldfront_saves(user_id, save_data, revision, saved_at)
    values(auth.uid(), payload, 1, clock_timestamp())
    on conflict (user_id) do nothing
    returning revision into next_revision;
  else
    update public.worldfront_saves
    set save_data = payload, revision = revision + 1, saved_at = clock_timestamp()
    where user_id = auth.uid() and revision = expected_revision
    returning revision into next_revision;
  end if;
  if next_revision is null then
    raise exception 'Cloud save changed on another device. Restore or resolve the conflict before saving.' using errcode = '40001';
  end if;
  return next_revision;
end;
$$;
revoke all on function public.worldfront_save_if_current(bigint,jsonb) from public;
grant execute on function public.worldfront_save_if_current(bigint,jsonb) to authenticated;
