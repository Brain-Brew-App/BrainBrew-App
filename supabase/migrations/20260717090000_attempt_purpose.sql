-- BrainBrew — attempt purpose (Phase 7A, Practice foundation).
--
-- Distinguishes ranked / practice / guest attempts EXPLICITLY, rather than
-- inferring "practice" from is_ranked=false (which also covers guest and any
-- future unranked type). This is server-derived on insert — the client can never
-- claim a purpose — and is purely additive: every ranked surface (leaderboards,
-- streaks, progress, ranked_result_projection) already filters on `is_ranked`, so
-- practice/guest remain fully excluded exactly as before. The purpose field just
-- lets future entitlements and analytics tell practice from guest.
--
--   • is_ranked = true                         → 'ranked'
--   • unranked, owner is a PERMANENT account    → 'practice'
--   • unranked, anonymous/absent owner          → 'guest'

create type attempt_purpose as enum ('ranked', 'practice', 'guest');

alter table attempts add column attempt_purpose attempt_purpose;

comment on column attempts.attempt_purpose is
  'Server-derived on insert (ranked / practice / guest). Practice never enters ranked surfaces; is_ranked stays the authority for ranked isolation.';

-- Backfill existing rows from the same rule.
update attempts a
   set attempt_purpose = case
     when a.is_ranked then 'ranked'::attempt_purpose
     when a.user_id is not null and exists (select 1 from profiles p where p.id = a.user_id and p.account_type = 'permanent')
       then 'practice'::attempt_purpose
     else 'guest'::attempt_purpose
   end
 where a.attempt_purpose is null;

-- Derive on insert so no Edge Function change is needed. The client cannot set a
-- purpose (any supplied value is overwritten) — it is decided server-side from the
-- authoritative is_ranked flag and the verified profile.
create or replace function set_attempt_purpose() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.attempt_purpose := case
    when new.is_ranked then 'ranked'::attempt_purpose
    when new.user_id is not null and exists (select 1 from profiles p where p.id = new.user_id and p.account_type = 'permanent')
      then 'practice'::attempt_purpose
    else 'guest'::attempt_purpose
  end;
  return new;
end;
$$;

create trigger attempt_purpose_derive
  before insert on attempts
  for each row execute function set_attempt_purpose();

alter table attempts alter column attempt_purpose set not null;
