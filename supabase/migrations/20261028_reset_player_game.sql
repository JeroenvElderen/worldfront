-- Deletes only the currently authenticated player's WorldFront cloud data.
-- Run this migration in the Supabase SQL editor before using the full reset button.
create or replace function public.reset_worldfront_player_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in before resetting your game';
  end if;
  delete from public.exploration_territories where user_id = auth.uid();
  delete from public.exploration_jobs where user_id = auth.uid();
  delete from public.worldfront_saves where user_id = auth.uid();
end;
$$;
revoke all on function public.reset_worldfront_player_data() from public, anon;
grant execute on function public.reset_worldfront_player_data() to authenticated;
