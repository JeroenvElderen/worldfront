-- Phase 2: allow authenticated anonymous players to enqueue their own
-- completed journeys. This is NOT authoritative mission verification:
-- browser-generated missions require server-side mission issuance to prevent cheating.
create or replace function public.enqueue_exploration_job(
  p_job_id text, p_vehicle_id text, p_completed_at timestamptz, p_segments jsonb
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if length(p_job_id) < 1 or length(p_job_id) > 200 or length(p_vehicle_id) < 1 or length(p_vehicle_id) > 200 then
    raise exception 'Invalid job or vehicle identifier';
  end if;
  if p_completed_at > now() + interval '2 minutes' or p_completed_at < now() - interval '30 days' then
    raise exception 'Invalid completion time';
  end if;
  if jsonb_typeof(p_segments) <> 'array' or jsonb_array_length(p_segments) < 1
     or jsonb_array_length(p_segments) > 10 then
    raise exception 'Invalid route segments';
  end if;
  if pg_column_size(p_segments) > 250000 then raise exception 'Route exceeds maximum size'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_segments) as segment
    where jsonb_typeof(segment) <> 'array'
       or jsonb_array_length(segment) < 2
       or jsonb_array_length(segment) > 5000
       or exists (
         select 1 from jsonb_array_elements(segment) as point
         where jsonb_typeof(point) <> 'array' or jsonb_array_length(point) <> 2
            or jsonb_typeof(point->0) <> 'number' or jsonb_typeof(point->1) <> 'number'
            or (point->>0)::numeric not between -180 and 180
            or (point->>1)::numeric not between -90 and 90
       )
  ) then raise exception 'Invalid coordinates'; end if;
  insert into public.exploration_jobs(user_id,job_id,vehicle_id,completed_at,segments)
  values(v_user,p_job_id,p_vehicle_id,p_completed_at,p_segments)
  on conflict(user_id,job_id) do nothing;
end $$;
revoke all on function public.enqueue_exploration_job(text,text,timestamptz,jsonb) from public,anon;
grant execute on function public.enqueue_exploration_job(text,text,timestamptz,jsonb) to authenticated;
