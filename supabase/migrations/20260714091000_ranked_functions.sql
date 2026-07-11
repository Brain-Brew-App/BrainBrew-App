-- BrainBrew — ranked eligibility, status, recalculation, and result projection
-- (Phase 6A). All SECURITY DEFINER with pinned search_path. The server is the
-- sole authority: eligibility derives from the verified profile + live pack +
-- server UTC date, never from client input.

-- Minimum ranked app version. Client-reported version is advisory (there is no
-- other way to know it); the server owns the threshold.
create or replace function app_version_ok(v text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select v is not null
     and v ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
     and string_to_array(v, '.')::int[] >= string_to_array('1.0.0', '.')::int[];
$$;

-- --------------------------------------------------------------------------
-- check_rank_eligibility — the one eligibility contract, used by the Home
-- status RPC AND the ranked-start flow. Returns a safe, non-sensitive shape.
-- --------------------------------------------------------------------------

create or replace function check_rank_eligibility(
  p_user uuid,
  p_app_version text default null,
  p_today date default (now() at time zone 'utc')::date
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp stable as $$
declare
  prof profiles%rowtype;
  existing attempts%rowtype;
  reason text;
  msg text;
begin
  if p_user is null then
    return jsonb_build_object('eligible', false, 'reason', 'anonymous_account', 'today', p_today,
      'ranked_status', 'none', 'ranked_attempt_id', null, 'locked_score', null,
      'practice_available', true, 'message', 'Guest brews are unranked. Secure your progress to play ranked.');
  end if;

  select * into prof from profiles where id = p_user;
  select * into existing from attempts where user_id = p_user and ranked_date = p_today and is_ranked limit 1;

  if prof.id is null or prof.account_type <> 'permanent' then
    reason := 'anonymous_account';
  elsif prof.onboarding_status <> 'complete' or prof.username is null then
    reason := 'incomplete_profile';
  elsif prof.country_code is null or not exists (select 1 from countries c where c.code = prof.country_code and c.active) then
    reason := 'invalid_country';
  elsif prof.rank_restricted_until is not null and prof.rank_restricted_until > now() then
    reason := 'integrity_restricted';
  elsif p_app_version is not null and not app_version_ok(p_app_version) then
    reason := 'unsupported_app_version';
  elsif not exists (
    select 1 from daily_packs
     where status = 'live' and pack_date = p_today and p_today <= (now() at time zone 'utc')::date
  ) then
    reason := 'no_live_pack';
  elsif existing.id is not null then
    reason := case when existing.status = 'completed' then 'ranked_attempt_completed' else 'ranked_attempt_exists' end;
  else
    reason := 'eligible';
  end if;

  msg := case reason
    when 'eligible' then 'You''re in. Play today''s ranked brew.'
    when 'anonymous_account' then 'Guest brews are unranked. Secure your progress to play ranked.'
    when 'incomplete_profile' then 'Complete your profile to enter future rankings.'
    when 'invalid_country' then 'Set your country to play ranked.'
    when 'unsupported_app_version' then 'Update BrainBrew to play ranked.'
    when 'integrity_restricted' then 'This result could not be ranked.'
    when 'no_live_pack' then 'Today''s brew isn''t ready yet.'
    when 'ranked_attempt_exists' then 'You have a ranked brew in progress today.'
    when 'ranked_attempt_completed' then 'Today''s ranked brew is complete.'
    else 'Ranked play is unavailable right now.'
  end;

  return jsonb_build_object(
    'eligible', reason = 'eligible',
    'reason', reason,
    'today', p_today,
    'ranked_status', case
      when existing.id is null then 'none'
      when existing.status = 'completed' then 'completed'
      when existing.status = 'active' then 'active'
      else 'expired' end,
    'ranked_attempt_id', existing.id,
    'locked_score', case when existing.status = 'completed' then existing.final_score else null end,
    'practice_available', true,
    'message', msg
  );
end;
$$;

-- Home status for the current user (server UTC, never client date).
create or replace function get_today_player_status(p_app_version text default null) returns jsonb
language sql security definer set search_path = public, pg_temp stable as $$
  select check_rank_eligibility(auth.uid(), p_app_version);
$$;

-- Backward-compatible boolean wrapper (now reflects the real rules).
create or replace function is_rank_eligible(p_user uuid default auth.uid()) returns boolean
language sql security definer set search_path = public, pg_temp stable as $$
  select (check_rank_eligibility(coalesce(p_user, auth.uid()))->>'eligible')::boolean;
$$;

-- --------------------------------------------------------------------------
-- recalculate_ranked_result — idempotent void recalculation (service_role).
-- Excludes now-void slots, renormalizes to 100, bumps recalc_version. Original
-- per-slot results remain stored for audit.
-- --------------------------------------------------------------------------

create or replace function recalculate_ranked_result(p_attempt_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  att attempts%rowtype;
  new_denom int;
  new_sum int;
  new_score int;
begin
  select * into att from attempts where id = p_attempt_id;
  if att.id is null or not att.is_ranked or att.status <> 'completed' then
    return jsonb_build_object('ok', false, 'reason', 'not_a_completed_ranked_attempt');
  end if;

  select coalesce(sum(s.max_score), 0) into new_denom
    from daily_pack_slots s where s.pack_id = att.pack_id and s.void_status = false;
  select coalesce(sum(i.awarded_score), 0) into new_sum
    from attempt_items i join daily_pack_slots s on s.id = i.slot_id
    where i.attempt_id = att.id and i.status = 'submitted' and s.void_status = false;

  if new_denom <= 0 then
    new_score := 0; new_denom := 100;   -- all slots voided: define as 0, no divide-by-zero
  else
    new_score := round(100.0 * new_sum / new_denom);
  end if;

  -- Idempotent: write (and bump version) only when the result actually changes.
  if new_score is distinct from att.final_score or new_denom is distinct from att.active_denominator then
    update attempts
       set final_score = new_score, active_denominator = new_denom, recalc_version = recalc_version + 1
     where id = p_attempt_id;
  end if;

  return jsonb_build_object('ok', true, 'final_score', new_score, 'active_denominator', new_denom, 'recalc_version',
    (select recalc_version from attempts where id = p_attempt_id));
end;
$$;

-- --------------------------------------------------------------------------
-- ranked_result_projection — the future-leaderboard-ready view. Only valid,
-- completed, clean ranked results; NO answers, tokens, integrity reasons, email,
-- or private profile fields. Service-role only (a future leaderboard function
-- will build on this without a schema redesign).
-- --------------------------------------------------------------------------

create or replace view ranked_result_projection as
  select
    a.id                     as attempt_id,
    a.user_id,
    a.username_snapshot,
    a.country_code_snapshot,
    a.ranked_date,
    a.final_score            as brewscore,
    a.completed_at,
    a.integrity_status,
    a.recalc_version         as result_version,
    (select coalesce(sum(extract(epoch from (i.submitted_at - i.opened_at)) * 1000), 0)::bigint
       from attempt_items i join daily_pack_slots s on s.id = i.slot_id
      where i.attempt_id = a.id and i.status = 'submitted' and s.void_status = false) as total_solve_ms
  from attempts a
  where a.is_ranked = true and a.status = 'completed' and a.integrity_status = 'clean';

revoke all on ranked_result_projection from anon, authenticated;
grant select on ranked_result_projection to service_role;

-- --------------------------------------------------------------------------
-- Grants for the eligibility/status functions.
-- --------------------------------------------------------------------------

-- The raw eligibility function takes an arbitrary user id, so it is NOT exposed
-- to clients (that would leak another user's ranked status). Clients call the
-- auth.uid()-scoped get_today_player_status; the ranked flow uses service_role.
revoke all on function check_rank_eligibility(uuid, text, date) from public, anon, authenticated;
revoke all on function get_today_player_status(text) from public, anon;
revoke all on function recalculate_ranked_result(uuid) from public, anon, authenticated;
grant execute on function check_rank_eligibility(uuid, text, date) to service_role;
grant execute on function get_today_player_status(text) to authenticated;
grant execute on function is_rank_eligible(uuid) to authenticated, service_role;
grant execute on function recalculate_ranked_result(uuid) to service_role;
grant execute on function app_version_ok(text) to authenticated, service_role;

-- --------------------------------------------------------------------------
-- Country change: snapshot-safe + a simple cooldown to reduce country-hopping
-- before leaderboards. First set (onboarding) is free; re-setting the SAME code
-- is a no-op; CHANGING to a different code is limited to once per 7 days.
-- --------------------------------------------------------------------------

create or replace function set_country(p_country text, p_display boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); v_code text; cur_code text; changed_at timestamptz; has_username boolean;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  v_code := upper(coalesce(p_country, ''));
  if not exists (select 1 from countries c where c.code = v_code and c.active) then
    raise exception 'invalid_country' using errcode = '22023';
  end if;
  select country_code, country_changed_at, username is not null into cur_code, changed_at, has_username from profiles where id = uid;

  if cur_code is not null and cur_code <> v_code
     and changed_at is not null and now() - changed_at < interval '7 days' then
    raise exception 'country_cooldown' using errcode = '22023';
  end if;

  update profiles
     set country_code = v_code,
         display_country = coalesce(p_display, true),
         country_changed_at = case when cur_code is distinct from v_code then now() else country_changed_at end,
         onboarding_status = case when has_username then 'complete'::onboarding_status else onboarding_status end
   where id = uid;
  return jsonb_build_object('ok', true, 'country_code', v_code);
end;
$$;

-- Username change: record when it happened (for future moderation/rename policy).
create or replace function set_username(p_username text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); err text; norm text; has_country boolean;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  err := validate_username(p_username);
  if err is not null then raise exception '%', err using errcode = '22023'; end if;
  norm := lower(p_username);
  select country_code is not null into has_country from profiles where id = uid;
  begin
    update profiles
       set username = p_username,
           username_normalized = norm,
           username_changed_at = now(),
           onboarding_status = case when has_country then 'complete'::onboarding_status else onboarding_status end
     where id = uid;
  exception when unique_violation then
    raise exception 'username_taken' using errcode = '23505';
  end;
  return jsonb_build_object('ok', true, 'username', p_username);
end;
$$;

grant execute on function set_country(text, boolean) to authenticated;
grant execute on function set_username(text) to authenticated;
