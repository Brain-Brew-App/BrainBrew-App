-- BrainBrew — Premium Archives backend (Phase 7J).
--
-- Premium players replay PAST daily packs as UNRANKED "Archive Brews". Archives
-- never touch ranked results: an archive attempt is is_ranked=false with an
-- archive_date_snapshot, so it is excluded from every ranked surface (leaderboards,
-- streaks, ranked_result_projection, one-ranked-per-day) exactly as practice is.
-- Entitlement is enforced SERVER-SIDE (never a client isPremium flag). Answers are
-- never returned by the read RPCs. The ranked fairness invariant is untouched:
-- ranked_attempts_per_utc_day stays a hard constant 1 in every state.

-- Archive marker on attempts + the never-ranked guard.
alter table attempts add column if not exists archive_date_snapshot date;
do $$ begin
  alter table attempts add constraint archive_never_ranked check (archive_date_snapshot is null or is_ranked = false);
exception when duplicate_object then null; end $$;

-- Server-derived purpose now recognises archive (unranked + a date snapshot).
create or replace function set_attempt_purpose() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.attempt_purpose := case
    when new.is_ranked then 'ranked'::attempt_purpose
    when new.archive_date_snapshot is not null then 'archive'::attempt_purpose
    when new.user_id is not null and exists (select 1 from profiles p where p.id = new.user_id and p.account_type = 'permanent')
      then 'practice'::attempt_purpose
    else 'guest'::attempt_purpose
  end;
  return new;
end; $$;

-- Effective Archive entitlement for a user (row wins; else policy default). Reuses
-- the canonical premium helper — beta/free never get Archives by default, so the
-- paid feature can be certified.
create or replace function player_can_archive(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select entitlement_has_premium(
    coalesce((select entitlement_state from player_entitlements where user_id = p_user),
             case when current_release_policy() = 'beta_open' then 'beta' else 'free' end));
$$;

-- Turn on the archives capability for real premium subscribers (still false for
-- beta/free). Otherwise identical to the 7E entitlement contract.
create or replace function get_my_entitlements() returns jsonb
language plpgsql security definer set search_path = public, pg_temp stable as $$
declare
  uid uuid := auth.uid(); mode text := current_release_policy();
  pe player_entitlements%rowtype; has_row boolean := false; state text; is_premium boolean; unlimited boolean; src text;
begin
  if uid is null then return jsonb_build_object('entitlement_state','free','locked',true); end if;
  select * into pe from player_entitlements where user_id = uid; has_row := found;
  if has_row then state := pe.entitlement_state;
  elsif mode = 'beta_open' then state := 'beta'; else state := 'free'; end if;
  is_premium := entitlement_has_premium(state);
  if mode = 'beta_open' then unlimited := true; else unlimited := is_premium; end if;
  if has_row then src := 'subscription'; elsif mode = 'beta_open' then src := 'beta_policy'; else src := 'free_policy'; end if;
  return jsonb_build_object(
    'entitlement_state', state, 'entitlement_version', 1, 'policy_mode', mode,
    'capabilities', jsonb_build_object(
      'daily_ranked_brew', true, 'global_leaderboard', true, 'country_leaderboard', true,
      'ranked_streaks', true, 'basic_progress', true, 'share_cards', true, 'practice_access', true,
      'unlimited_practice', unlimited,
      'archives', is_premium,                       -- 7J: real Premium subscribers only
      'category_training', false, 'difficulty_selection', false, 'advanced_practice_stats', false,
      'advanced_ranked_stats', false, 'bonus_packs', false, 'premium_themes', false, 'private_tournaments', false),
    'limits', jsonb_build_object(
      'ranked_attempts_per_utc_day', 1,             -- FAIRNESS INVARIANT: hard constant 1
      'free_practice_brews_per_period', case when unlimited then null else practice_daily_allowance() end),
    'subscription', case when has_row then jsonb_build_object(
      'is_active', pe.is_active, 'will_renew', pe.will_renew, 'period_type', pe.period_type,
      'current_period_end', pe.current_period_end, 'in_grace_period', state = 'grace_period', 'billing_issue', state = 'billing_issue')
      else null end,
    'source', src);
end; $$;
revoke all on function get_my_entitlements() from public, anon;
grant execute on function get_my_entitlements() to authenticated;

-- ---------------------------------------------------------------------------
-- Archive calendar — past published packs + per-caller locked state. No answers.
-- ---------------------------------------------------------------------------
create or replace function get_archive_calendar(p_limit int default 30, p_offset int default 0) returns jsonb
language plpgsql security definer set search_path = public, pg_temp stable as $$
declare uid uuid := auth.uid(); today date := (now() at time zone 'utc')::date; can_play boolean;
begin
  if uid is null then return jsonb_build_object('locked', true, 'dates', '[]'::jsonb); end if;
  can_play := player_can_archive(uid);
  return jsonb_build_object(
    'locked', not can_play,
    'total', (select count(*) from daily_packs where status in ('live','archived') and pack_date is not null and pack_date < today),
    'dates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ranked_date', dp.pack_date, 'difficulty_label', dp.difficulty_label,
        'incident', dp.incident_status <> 'none', 'available', true) order by dp.pack_date desc)
      from (select * from daily_packs where status in ('live','archived') and pack_date is not null and pack_date < today
            order by pack_date desc limit least(greatest(coalesce(p_limit,30),1),90) offset greatest(coalesce(p_offset,0),0)) dp
    ), '[]'::jsonb));
end; $$;
revoke all on function get_archive_calendar(int, int) from public, anon;
grant execute on function get_archive_calendar(int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Archive pack — sanitized five-slot content for a past date. Entitlement-gated.
-- No answers, no future/today pack, void slots represented (excluded from play).
-- ---------------------------------------------------------------------------
create or replace function get_archive_pack(p_date date) returns jsonb
language plpgsql security definer set search_path = public, pg_temp stable as $$
declare uid uuid := auth.uid(); today date := (now() at time zone 'utc')::date; pk daily_packs%rowtype;
begin
  if uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not player_can_archive(uid) then raise exception 'archive_locked' using errcode='42501'; end if;
  if p_date is null or p_date >= today then raise exception 'not_a_past_date' using errcode='22023'; end if;
  select * into pk from daily_packs where pack_date = p_date and status in ('live','archived');
  if not found then raise exception 'archive_pack_unavailable' using errcode='P0001'; end if;
  return jsonb_build_object(
    'ranked_date', pk.pack_date, 'difficulty_label', pk.difficulty_label,
    'slots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', s.position, 'category', s.category, 'engine_id', s.engine_id,
        'puzzle_id', s.puzzle_id, 'public_payload', p.public_payload, 'voided', s.void_status) order by s.position)
      from daily_pack_slots s join puzzles p on p.puzzle_id = s.puzzle_id where s.pack_id = pk.pack_id), '[]'::jsonb));
end; $$;
revoke all on function get_archive_pack(date) from public, anon;
grant execute on function get_archive_pack(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Start an archive attempt — service-role (an Edge Function calls it after
-- verifying the JWT). Entitlement-gated, past published pack, UNRANKED, bound
-- immutably to the historical pack + date. Resumes an active archive attempt.
-- ---------------------------------------------------------------------------
create or replace function start_archive_attempt(p_user_id uuid, p_date date, p_session_id text, p_app_version text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare today date := (now() at time zone 'utc')::date; pk daily_packs%rowtype; v_att uuid; v_denom int; existing uuid;
begin
  if p_user_id is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not player_can_archive(p_user_id) then raise exception 'archive_locked' using errcode='42501'; end if;
  if p_date is null or p_date >= today then raise exception 'not_a_past_date' using errcode='22023'; end if;
  select * into pk from daily_packs where pack_date = p_date and status in ('live','archived');
  if not found then raise exception 'archive_pack_unavailable' using errcode='P0001'; end if;

  -- Resume an in-progress archive attempt for this user + date.
  select id into existing from attempts
    where user_id = p_user_id and attempt_purpose = 'archive' and status = 'active'
      and pack_id = pk.pack_id and archive_date_snapshot = p_date order by created_at desc limit 1;
  if existing is not null then
    return jsonb_build_object('resumed', true, 'attempt_id', existing, 'ranked_date', p_date);
  end if;

  select coalesce(sum(max_score),0) into v_denom from daily_pack_slots where pack_id = pk.pack_id and void_status = false;
  if v_denom <= 0 then raise exception 'archive_pack_fully_voided' using errcode='P0001'; end if;

  insert into attempts (user_id, session_id, pack_id, is_ranked, status, active_denominator, archive_date_snapshot, app_version)
    values (p_user_id, p_session_id, pk.pack_id, false, 'active', v_denom, p_date, p_app_version) returning id into v_att;
  insert into attempt_items (attempt_id, slot_id, position, status)
    select v_att, s.id, s.position, 'opened' from daily_pack_slots s where s.pack_id = pk.pack_id and s.void_status = false;

  return jsonb_build_object('resumed', false, 'attempt_id', v_att, 'ranked_date', p_date, 'denominator', v_denom);
end; $$;
revoke all on function start_archive_attempt(uuid, date, text, text) from public, anon, authenticated;
grant execute on function start_archive_attempt(uuid, date, text, text) to service_role;
