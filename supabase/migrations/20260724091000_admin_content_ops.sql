-- BrainBrew — Admin content-operations read RPCs (Phase 7H). Service-role only,
-- server-side paginated, hard row caps, validated inputs. Answer keys are a
-- SEPARATE, authorized RPC (the app gates it to Founder/Content/authorized Eng and
-- audits). All read-only — no approval/publish/void actions here.

-- Paginated puzzle library. Reserve = approved & not scheduled into any daily pack.
create or replace function admin_puzzles(
  p_category text default null, p_engine text default null, p_status text default null,
  p_reserve text default null,  -- 'reserve' | 'scheduled' | null(any)
  p_limit int default 25, p_offset int default 0
) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with lim as (select least(greatest(coalesce(p_limit,25),1),100) l, greatest(coalesce(p_offset,0),0) o),
  base as (
    select p.puzzle_id, p.category::text cat, p.engine_id, p.difficulty, p.status::text status,
      not exists (select 1 from daily_pack_slots ds where ds.puzzle_id = p.puzzle_id) as is_reserve,
      exists (select 1 from puzzle_validation_results v where v.puzzle_id = p.puzzle_id and v.passed) as validated,
      (select count(*) from daily_pack_slots ds where ds.puzzle_id = p.puzzle_id) as ranked_appearances,
      (select count(*) from practice_pack_slots ps where ps.puzzle_id = p.puzzle_id) as practice_appearances,
      substr(p.content_hash,1,10) as hash,
      p.updated_at
    from puzzles p
    where (p_category is null or p.category::text = p_category)
      and (p_engine is null or p.engine_id = p_engine)
      and (p_status is null or p.status::text = p_status)
  ),
  filtered as (
    select * from base
    where (p_reserve is null
           or (p_reserve = 'reserve' and is_reserve)
           or (p_reserve = 'scheduled' and not is_reserve))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'limit', (select l from lim), 'offset', (select o from lim),
    'rows', coalesce((select jsonb_agg(row_to_json(t)) from (
      select * from filtered order by puzzle_id limit (select l from lim) offset (select o from lim)
    ) t), '[]'::jsonb)
  );
$$;
revoke all on function admin_puzzles(text, text, text, text, int, int) from public, anon, authenticated;
grant execute on function admin_puzzles(text, text, text, text, int, int) to service_role;

-- Safe puzzle detail — NEVER the answer payload. Includes validation, review,
-- scheduled usage, and score/solve distributions from ranked play.
create or replace function admin_puzzle_detail(p_puzzle_id text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when p.puzzle_id is null then null else jsonb_build_object(
    'puzzle_id', p.puzzle_id, 'category', p.category, 'engine_id', p.engine_id,
    'difficulty', p.difficulty, 'status', p.status, 'prompt', p.prompt,
    'public_payload', p.public_payload,   -- render-safe, no answer
    'builder_version', p.builder_version, 'validator_version', p.validator_version,
    'content_hash', substr(p.content_hash,1,16), 'approved_at', p.approved_at, 'retired_at', p.retired_at,
    'is_reserve', not exists (select 1 from daily_pack_slots ds where ds.puzzle_id = p.puzzle_id),
    'validation', (select coalesce(jsonb_agg(jsonb_build_object('passed',v.passed,'findings',v.findings,'validator_version',v.validator_version,'validated_at',v.validated_at) order by v.validated_at desc),'[]'::jsonb) from puzzle_validation_results v where v.puzzle_id = p.puzzle_id),
    'scheduled_in', (select coalesce(jsonb_agg(jsonb_build_object('pack_date',dp.pack_date,'position',ds.position) order by dp.pack_date),'[]'::jsonb) from daily_pack_slots ds join daily_packs dp on dp.pack_id = ds.pack_id where ds.puzzle_id = p.puzzle_id),
    'stats', (select jsonb_build_object(
        'plays', count(*), 'avg_points', round(avg(ai.awarded_score)::numeric,2),
        'avg_solve_ms', round(avg(extract(epoch from (ai.submitted_at - ai.opened_at))*1000)::numeric,0),
        'correct_rate', round((count(*) filter (where ai.verdict='correct')::numeric/nullif(count(*),0)),4))
      from attempt_items ai join daily_pack_slots ds on ds.id = ai.slot_id where ds.puzzle_id = p.puzzle_id and ai.status='submitted')
  ) end
  from (select * from puzzles where puzzle_id = p_puzzle_id) p;
$$;
revoke all on function admin_puzzle_detail(text) from public, anon, authenticated;
grant execute on function admin_puzzle_detail(text) to service_role;

-- Private answer payload — the app calls this ONLY for authorized roles and audits it.
create or replace function admin_puzzle_answer(p_puzzle_id text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('puzzle_id', p_puzzle_id,
    'answer_payload', (select answer_payload from puzzle_answers where puzzle_id = p_puzzle_id),
    'explanation', (select explanation from puzzle_answers where puzzle_id = p_puzzle_id));
$$;
revoke all on function admin_puzzle_answer(text) from public, anon, authenticated;
grant execute on function admin_puzzle_answer(text) to service_role;

-- Daily packs with participation/completion/score (paginated by date range).
create or replace function admin_packs(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.pack_date desc nulls last),'[]'::jsonb) from (
    select dp.pack_date, dp.status::text status, dp.difficulty_label, dp.incident_status::text incident,
      substr(dp.content_hash,1,10) hash, dp.published_at,
      (select count(*) from attempts a where a.pack_id = dp.pack_id and a.is_ranked and a.status='completed') completions,
      (select count(distinct a.user_id) from attempts a where a.pack_id = dp.pack_id and a.is_ranked) participants,
      (select round(avg(a.final_score)::numeric,1) from attempts a where a.pack_id = dp.pack_id and a.is_ranked and a.status='completed') avg_score
    from daily_packs dp
    where (dp.pack_date is null or (dp.pack_date >= p_from and dp.pack_date <= p_to))
  ) t;
$$;
revoke all on function admin_packs(date, date) from public, anon, authenticated;
grant execute on function admin_packs(date, date) to service_role;

-- Content review queue — puzzles grouped by lifecycle status with validation findings.
create or replace function admin_content_queue(p_status text default null, p_limit int default 25, p_offset int default 0) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with lim as (select least(greatest(coalesce(p_limit,25),1),100) l, greatest(coalesce(p_offset,0),0) o),
  base as (
    select p.puzzle_id, p.category::text cat, p.engine_id, p.difficulty, p.status::text status,
      (select v.passed from puzzle_validation_results v where v.puzzle_id=p.puzzle_id order by v.validated_at desc limit 1) validated,
      (select v.findings from puzzle_validation_results v where v.puzzle_id=p.puzzle_id order by v.validated_at desc limit 1) findings,
      p.updated_at
    from puzzles p where (p_status is null or p.status::text = p_status)
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'by_status', (select coalesce(jsonb_object_agg(status,c),'{}'::jsonb) from (select status, count(*) c from base group by status) s),
    'rows', coalesce((select jsonb_agg(row_to_json(t)) from (select * from base order by updated_at desc limit (select l from lim) offset (select o from lim)) t),'[]'::jsonb)
  );
$$;
revoke all on function admin_content_queue(text, int, int) from public, anon, authenticated;
grant execute on function admin_content_queue(text, int, int) to service_role;

-- Engine registry (config + reserve coverage + exposure).
create or replace function admin_engine_registry() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.category, t.engine_id),'[]'::jsonb) from (
    select e.engine_id, e.category::text category, e.name, e.active, e.build_status::text build_status,
      e.min_difficulty, e.max_difficulty, e.rotation_weight, e.weekly_cap, e.min_days_between,
      (select count(*) from puzzles p where p.engine_id=e.engine_id and p.status='approved') approved_puzzles,
      (select count(*) from puzzles p where p.engine_id=e.engine_id and p.status='approved' and not exists (select 1 from daily_pack_slots ds where ds.puzzle_id=p.puzzle_id)) reserve_puzzles,
      (select count(*) from daily_pack_slots ds where ds.engine_id=e.engine_id) scheduled_slots
    from puzzle_engines e
  ) t;
$$;
revoke all on function admin_engine_registry() from public, anon, authenticated;
grant execute on function admin_engine_registry() to service_role;
