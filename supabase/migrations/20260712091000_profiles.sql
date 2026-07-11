-- BrainBrew — player profiles (Phase 5B, Task 4 & 8).
--
-- One private profile per authenticated user (anonymous OR, later, permanent).
-- The profile id IS the auth.users id, so identity survives an account upgrade
-- (the UUID never changes). No sensitive fields — no birth date, gender, legal
-- name, address, or phone. Country is self-reported and validated against the
-- canonical `countries` table.
--
-- Security model: RLS lets an authenticated user READ ONLY their own row and
-- nothing else; there is NO direct write grant. All mutations go through the
-- validated SECURITY DEFINER RPCs (next migration), which is what enforces
-- "update only permitted fields, never id/timestamps/moderation". A future
-- PUBLIC profile surface must be a sanitized view/RPC, never this table.

create type onboarding_status as enum ('username_required', 'complete');
create type account_type      as enum ('anonymous', 'permanent');

create table profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,

  -- NULL until the player chooses one (onboarding_status stays 'username_required').
  username           text
                       constraint username_format check (
                         username is null or (
                           length(username) between 3 and 20
                           and username ~ '^[A-Za-z0-9]+(_[A-Za-z0-9]+)*$'  -- no leading/trailing/consecutive underscore
                         )
                       ),
  -- Case-folded form; the uniqueness key. Display casing is preserved in `username`.
  username_normalized text
                       constraint username_normalized_lower check (username_normalized = lower(username_normalized)),

  country_code       text references countries(code),
  display_country    boolean not null default true,

  onboarding_status  onboarding_status not null default 'username_required',
  account_type       account_type not null default 'anonymous',

  -- Reserved for future moderation / forced rename — never client-writable.
  moderation_flags   jsonb not null default '[]'::jsonb,
  forced_rename      boolean not null default false,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- A profile marked complete must actually have a username + country.
  constraint complete_has_username_country check (
    onboarding_status <> 'complete' or (username is not null and country_code is not null)
  )
);

-- Case-insensitive global uniqueness. NULLs are distinct, so many un-onboarded
-- profiles can coexist with a null username.
create unique index profiles_username_normalized_key on profiles(username_normalized);

create index profiles_country_idx on profiles(country_code);

create trigger profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

-- --------------------------------------------------------------------------
-- RLS: an authenticated user reads ONLY their own profile. No direct writes —
-- mutations go through the validated RPCs. Public (unauthenticated `anon`) has
-- no access at all.
-- --------------------------------------------------------------------------

alter table profiles enable row level security;

revoke all on profiles from anon, authenticated;
grant select on profiles to authenticated;

-- Restricted to the `authenticated` role so a bare `auth.uid()` can never match
-- for the public anon role (Task 8).
create policy profiles_select_own
  on profiles for select
  to authenticated
  using (auth.uid() = id);

-- service_role (Edge Functions / tooling) bypasses RLS for the trigger + admin.
grant all on profiles to service_role;
