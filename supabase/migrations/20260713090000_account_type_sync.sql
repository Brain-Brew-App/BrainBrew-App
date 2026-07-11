-- BrainBrew — server-controlled account_type synchronization (Phase 5C, Task 6).
--
-- After an anonymous user verifies an email identity, `is_anonymous` in the JWT
-- flips to false. This RPC reads that VERIFIED Auth claim (never a client
-- assertion) and sets profiles.account_type accordingly. It is idempotent,
-- derives the user from auth.uid(), and touches only account_type — username,
-- country, onboarding, ownership, and the profile id are untouched, so identity
-- continuity is preserved.
--
-- Setting an email or sending a confirmation does NOT flip account_type — only a
-- confirmed identity does, because only then is the JWT's is_anonymous false.

create or replace function sync_account_type() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  is_anon boolean;
  new_type account_type;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

  -- Auth state is the source of truth. `is_anonymous` is false only after a real
  -- identity has been CONFIRMED; a client cannot forge a signed JWT claim.
  is_anon := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  new_type := case when is_anon then 'anonymous' else 'permanent' end::account_type;

  update profiles set account_type = new_type where id = uid;

  return jsonb_build_object('account_type', new_type);
end;
$$;

comment on function sync_account_type() is
  'Idempotently sets the caller''s profiles.account_type from the verified JWT is_anonymous claim. Never trusts a client-supplied value.';

revoke all on function sync_account_type() from public, anon;
grant execute on function sync_account_type() to authenticated;
