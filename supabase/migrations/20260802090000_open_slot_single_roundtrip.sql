-- RC1.1 perf — open a slot in ONE database round trip.
--
-- WHY
-- ---
-- The Edge Function measured 400–600 ms of SERVER time per "Continue" tap (reported
-- by x-bb-timing: authorizeSlot=200ms, getItem+slotPublic=120ms, openItem=100ms).
-- Postgres itself is not slow — these are simple indexed selects. The cost is that
-- EVERY supabase-js call from the isolate is a separate HTTPS request to PostgREST,
-- ~100 ms each, and openPuzzle made about six of them:
--
--   getAttempt → resolveSlot → getItem → daily_packs → get_public_pack → openItem
--
-- One RPC does all of it in a single round trip.
--
-- WHAT IS **NOT** CHANGED
-- -----------------------
-- • The Edge Function still verifies the player's JWT and the HMAC attempt token
--   BEFORE calling this. Nothing here replaces that; this is defence in depth.
-- • Every check that existed still exists, in the same order, and now runs ATOMICALLY:
--   attempt exists → belongs to this user → same session → same pack the token is
--   bound to → attempt active → slot exists → slot not void → not already submitted.
--   Any failure raises, and NO item is opened.
-- • The TIMER is unchanged: `opened_at` is written only after every check passes, and
--   re-opening an already-open slot KEEPS the original opened_at — so the clock can
--   still never be reset by re-calling open.
-- • The payload is the same sanitized projection get_public_pack serves. The answer
--   key and explanation live in `puzzle_answers` and are NOT touched here.

create or replace function open_slot_for_attempt(
  p_user uuid,
  p_attempt uuid,
  p_session text,
  p_pack_ref text,
  p_position int
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  att attempts%rowtype;
  v_slot_id uuid; v_slot_puzzle text; v_slot_engine text; v_slot_max int; v_slot_void boolean;
  pack_ref text;
  itm attempt_items%rowtype;
  pub jsonb;
  cat text;
begin
  -- 1. The attempt, and the ownership/session/pack bindings the token asserts.
  select * into att from attempts where id = p_attempt;
  if not found then raise exception 'attempt_not_found' using errcode = 'P0002'; end if;
  if att.user_id is distinct from p_user then raise exception 'wrong_user' using errcode = '42501'; end if;
  if att.session_id is distinct from p_session then raise exception 'wrong_session' using errcode = '42501'; end if;

  pack_ref := coalesce(att.practice_pack_id::text, att.pack_id::text);
  if pack_ref is distinct from p_pack_ref then raise exception 'wrong_pack' using errcode = '42501'; end if;
  if att.status <> 'active' then raise exception 'attempt_not_active' using errcode = 'P0001'; end if;

  -- 2. The slot — from the practice pack or the daily pack, whichever this attempt uses.
  --    `category` comes from the SLOT, exactly as get_public_pack does (the slot's
  --    slot_category enum is the authority, not the puzzle row).
  if att.practice_pack_id is not null then
    select s.id, s.puzzle_id, s.engine_id, s.max_score, false, s.category::text
      into v_slot_id, v_slot_puzzle, v_slot_engine, v_slot_max, v_slot_void, cat
      from practice_pack_slots s
     where s.practice_pack_id = att.practice_pack_id and s.position = p_position;
  else
    select s.id, s.puzzle_id, s.engine_id, s.max_score, s.void_status, s.category::text
      into v_slot_id, v_slot_puzzle, v_slot_engine, v_slot_max, v_slot_void, cat
      from daily_pack_slots s
     where s.pack_id = att.pack_id and s.position = p_position;
  end if;
  if v_slot_id is null then raise exception 'slot_not_found' using errcode = 'P0002'; end if;
  if v_slot_void then raise exception 'slot_voided' using errcode = 'P0001'; end if;

  -- 3. The item. Idempotent: an already-open slot KEEPS its original opened_at, so a
  --    re-open can never reset the timer. Already-submitted is rejected.
  select * into itm from attempt_items ai where ai.attempt_id = p_attempt and ai.slot_id = v_slot_id;
  if found and itm.status = 'submitted' then
    raise exception 'already_submitted' using errcode = 'P0001';
  end if;
  if not found then
    insert into attempt_items (attempt_id, slot_id, position, status)
    values (p_attempt, v_slot_id, p_position, 'opened')
    returning * into itm;
  end if;

  -- 4. The render-safe payload — the SAME projection get_public_pack serves, including
  --    its `status = 'approved'` requirement. No answer, no explanation: those live in
  --    puzzle_answers, which this function never reads.
  select jsonb_build_object(
      'position',       p_position,
      'category',       cat,
      'engine_id',      v_slot_engine,
      'puzzle_id',      v_slot_puzzle,
      'difficulty',     z.difficulty,
      'prompt',         z.prompt,
      'public_payload', z.public_payload,
      'max_score',      v_slot_max
    )
    into pub
    from puzzles z
   where z.puzzle_id = v_slot_puzzle
     and z.status = 'approved';
  if pub is null then raise exception 'slot_not_found' using errcode = 'P0002'; end if;

  return jsonb_build_object(
    'attempt', jsonb_build_object(
      'id', att.id, 'session_id', att.session_id, 'pack_id', att.pack_id,
      'practice_pack_id', att.practice_pack_id, 'status', att.status,
      'user_id', att.user_id, 'is_ranked', att.is_ranked,
      'ranked_date', att.ranked_date, 'active_denominator', att.active_denominator
    ),
    'slot', jsonb_build_object(
      'id', v_slot_id, 'position', p_position, 'puzzle_id', v_slot_puzzle,
      'engine_id', v_slot_engine, 'max_score', v_slot_max, 'void_status', v_slot_void
    ),
    'opened_at', itm.opened_at,
    'public', pub
  );
end; $$;

-- Service role only: an Edge Function calls this AFTER verifying the JWT and the HMAC
-- attempt token. A player must never be able to open a slot directly.
revoke all on function open_slot_for_attempt(uuid, uuid, text, text, int) from public, anon, authenticated;
grant execute on function open_slot_for_attempt(uuid, uuid, text, text, int) to service_role;
