-- BrainBrew — profile lifecycle functions (Phase 5B, Tasks 6, 7, 15, 16).
--
-- All SECURITY DEFINER with a pinned search_path. The profile is created by an
-- auth.users trigger (lowest race risk); username/country are set through
-- validated RPCs that derive the user from auth.uid() — never from an argument —
-- and rely on the DB uniqueness constraint (not just a prior check) to settle
-- races. Rank eligibility is defined but always false this phase.

-- --------------------------------------------------------------------------
-- Blocked usernames — reserved, impersonation-sensitive, and a first-pass
-- profanity list. A table (not a constant) so moderation can extend it later
-- without a code change. This is a FIRST PASS; it does not catch all abuse.
-- --------------------------------------------------------------------------

create table blocked_usernames (
  normalized text primary key,
  reason     text not null
);

insert into blocked_usernames (normalized, reason) values
  ('brainbrew', 'reserved'), ('brain_brew', 'reserved'), ('brewbot', 'reserved'),
  ('admin', 'reserved'), ('administrator', 'reserved'), ('support', 'reserved'),
  ('moderator', 'reserved'), ('mod', 'reserved'), ('staff', 'reserved'),
  ('official', 'reserved'), ('help', 'reserved'), ('system', 'reserved'),
  ('root', 'reserved'), ('superuser', 'reserved'), ('owner', 'reserved'),
  ('null', 'reserved'), ('undefined', 'reserved'), ('anonymous', 'reserved'),
  ('guest', 'reserved'), ('me', 'reserved'), ('you', 'reserved'), ('api', 'reserved'),
  ('team', 'reserved'), ('everyone', 'reserved'), ('nobody', 'reserved'),
  ('fuck', 'profanity'), ('shit', 'profanity'), ('bitch', 'profanity'),
  ('cunt', 'profanity'), ('asshole', 'profanity'), ('bastard', 'profanity'),
  ('nigger', 'slur'), ('faggot', 'slur'), ('retard', 'slur'), ('rape', 'unsafe')
on conflict (normalized) do nothing;

-- --------------------------------------------------------------------------
-- handle_new_user — create the minimal profile when an auth user is created.
-- Kept tiny and idempotent so it can never corrupt Auth signup.
-- --------------------------------------------------------------------------

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, account_type, onboarding_status)
  values (
    new.id,
    case when coalesce(new.is_anonymous, false) then 'anonymous'::account_type else 'permanent'::account_type end,
    'username_required'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- --------------------------------------------------------------------------
-- Username validation (shared). Returns null if OK, else a stable error code.
-- --------------------------------------------------------------------------

create or replace function validate_username(p_username text) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare norm text;
begin
  if p_username is null then return 'username_required'; end if;
  if p_username <> btrim(p_username) then return 'invalid_username'; end if;      -- misleading whitespace
  if length(p_username) < 3 or length(p_username) > 20 then return 'invalid_length'; end if;
  -- ASCII letters/digits/underscore only, no leading/trailing/consecutive underscore.
  -- (Non-ASCII, control, and invisible characters are rejected by this class.)
  if p_username !~ '^[A-Za-z0-9]+(_[A-Za-z0-9]+)*$' then return 'invalid_username'; end if;
  norm := lower(p_username);
  if exists (select 1 from blocked_usernames where normalized = norm) then return 'username_not_allowed'; end if;
  return null;
end;
$$;

-- --------------------------------------------------------------------------
-- check_username_available — advisory only (the constraint is authoritative).
-- --------------------------------------------------------------------------

create or replace function check_username_available(p_username text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare err text; norm text;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  err := validate_username(p_username);
  if err is not null then return jsonb_build_object('available', false, 'reason', err); end if;
  norm := lower(p_username);
  if exists (select 1 from profiles where username_normalized = norm and id <> auth.uid()) then
    return jsonb_build_object('available', false, 'reason', 'username_taken');
  end if;
  return jsonb_build_object('available', true);
end;
$$;

-- --------------------------------------------------------------------------
-- set_username — validate, normalize, and claim (constraint settles the race).
-- --------------------------------------------------------------------------

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
          onboarding_status = case when has_country then 'complete'::onboarding_status else onboarding_status end
      where id = uid;
  exception when unique_violation then
    raise exception 'username_taken' using errcode = '23505';
  end;

  return jsonb_build_object('ok', true, 'username', p_username);
end;
$$;

-- --------------------------------------------------------------------------
-- set_country — validate against the canonical list.
-- --------------------------------------------------------------------------

create or replace function set_country(p_country text, p_display boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); v_code text; has_username boolean;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  v_code := upper(coalesce(p_country, ''));
  if not exists (select 1 from countries c where c.code = v_code and c.active) then
    raise exception 'invalid_country' using errcode = '22023';
  end if;
  select username is not null into has_username from profiles where id = uid;
  update profiles
    set country_code = v_code,
        display_country = coalesce(p_display, true),
        onboarding_status = case when has_username then 'complete'::onboarding_status else onboarding_status end
    where id = uid;
  return jsonb_build_object('ok', true, 'country_code', v_code);
end;
$$;

-- --------------------------------------------------------------------------
-- get_my_profile — the current user's private profile, explicit allowlist.
-- No tokens, email, phone, moderation flags, or internal fields.
-- --------------------------------------------------------------------------

create or replace function get_my_profile() returns jsonb
language sql security definer set search_path = public, pg_temp stable as $$
  select case when auth.uid() is null then null else (
    select jsonb_build_object(
      'id', p.id,
      'username', p.username,
      'country_code', p.country_code,
      'display_country', p.display_country,
      'onboarding_status', p.onboarding_status,
      'account_type', p.account_type,
      'created_at', p.created_at
    )
    from profiles p where p.id = auth.uid()
  ) end;
$$;

-- --------------------------------------------------------------------------
-- is_rank_eligible — the ranked-play boundary. ALWAYS false this phase.
--
-- Future rules (documented, not enforced yet): permanent verified identity,
-- complete profile, valid country, supported app version, no integrity flags,
-- one ranked attempt per UTC day. No client can set eligibility — it is a pure
-- server function, and the attempts.is_ranked=false CHECK stays authoritative.
-- --------------------------------------------------------------------------

create or replace function is_rank_eligible(p_user uuid default auth.uid()) returns boolean
language sql security definer set search_path = public, pg_temp stable as $$
  select false;  -- Phase 5B: nobody is rank-eligible. Anonymous AND permanent.
$$;

-- --------------------------------------------------------------------------
-- Grants: authenticated may call the profile RPCs. anon may not.
-- --------------------------------------------------------------------------

revoke all on function check_username_available(text) from public;
revoke all on function set_username(text) from public;
revoke all on function set_country(text, boolean) from public;
revoke all on function get_my_profile() from public;
revoke all on function is_rank_eligible(uuid) from public;

grant execute on function check_username_available(text) to authenticated;
grant execute on function set_username(text) to authenticated;
grant execute on function set_country(text, boolean) to authenticated;
grant execute on function get_my_profile() to authenticated;
grant execute on function is_rank_eligible(uuid) to authenticated, service_role;
