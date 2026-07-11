-- BrainBrew — attempt ownership by authenticated user (Phase 5B, Task 9).
--
-- `attempts.user_id` existed (nullable, reserved). Now it references the auth
-- user. Edge Functions derive the user from the verified Auth JWT and set it;
-- the client can never supply it as authority. The HMAC attempt token ALSO binds
-- the user id — Auth proves the session, the token authorizes the specific
-- attempt/slot. Both layers stay.
--
-- `user_id` remains NULLABLE for now: pre-5B historical attempts (created before
-- Auth) have no owner and stay unowned rather than being claimable by a guessed
-- id (see docs/PLAYER_IDENTITY_AND_PROFILES.md §migration). Every NEW attempt
-- created by start-attempt carries a user_id. When no legacy rows remain, a
-- follow-up migration can SET NOT NULL.

alter table attempts
  add constraint attempts_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;

create index if not exists attempts_user_idx on attempts(user_id);

comment on column attempts.user_id is
  'The authenticated auth.users id that owns this attempt. Set server-side from the verified JWT, never from the request body. Nullable only for pre-5B historical rows.';
