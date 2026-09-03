-- New Kandy Essence: self profile lookup that doesn't need the caller to
-- already know their own id, so it can run concurrently with
-- supabase.auth.getUser()'s network round trip to the Auth server instead
-- of waiting on it.
--
-- SECURITY INVOKER (not DEFINER): this must stay fully subject to the
-- profiles_select RLS policy, not bypass it. Filtering by auth.uid() here
-- is what keeps this from ever returning another user's row even for an
-- owner caller, for whom profiles_select alone would allow every row.
--
-- This function does NOT independently verify the caller's session against
-- the Auth server -- it only trusts the JWT PostgREST already validated for
-- this request. Callers must still gate on auth.getUser() succeeding before
-- using whatever this returns; it exists purely to let that fetch overlap
-- with getUser()'s network call, not to replace getUser() as the auth check.
create or replace function get_own_profile()
returns setof profiles
language sql
security invoker
stable
set search_path = public
as $$
  select * from profiles where id = auth.uid();
$$;

revoke all on function get_own_profile() from public;
grant execute on function get_own_profile() to authenticated;
