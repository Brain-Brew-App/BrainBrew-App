-- BrainBrew — Puzzle revision creation + lineage (Phase 7I.2D).
--
-- Immutable canonical content is NEVER edited in place. A "revision" creates a new
-- authoring draft that copies the source seed, links to its parent, and must be
-- rebuilt + revalidated + reviewed + promoted independently (yielding a NEW stable
-- puzzle id). The original puzzle/answer/hash are untouched. Lineage is derived
-- from authoring_drafts.parent_puzzle_id (+ proposed_puzzle_id once promoted).
-- Service-role only.

create or replace function admin_create_revision(p_source_puzzle_id text, p_by uuid, p_role text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare src puzzles%rowtype; v_seed jsonb; v_new text; v_draft uuid;
begin
  select * into src from puzzles where puzzle_id = p_source_puzzle_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'source_not_found'); end if;

  -- Copy the canonical seed as the revision's starting point.
  select payload into v_seed from puzzle_seeds where seed_id = src.seed_id;
  v_seed := coalesce(v_seed, '{}'::jsonb);

  v_new := 'rev-' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 12);
  if exists (select 1 from puzzles where puzzle_id = v_new)
     or exists (select 1 from authoring_drafts where proposed_puzzle_id = v_new) then
    return jsonb_build_object('ok', false, 'reason', 'id_collision');
  end if;

  -- A fresh draft: parent linked, NO approval/validation/build copied.
  insert into authoring_drafts (engine_id, category, difficulty, seed, parent_puzzle_id, status, proposed_puzzle_id, author, validation)
    values (src.engine_id, src.category::text, src.difficulty, v_seed, p_source_puzzle_id, 'draft', v_new, p_by, '{}'::jsonb)
    returning id into v_draft;

  perform admin_log(p_by, p_role::admin_role, 'create_revision', 'puzzle', p_source_puzzle_id,
    jsonb_build_object('draft', v_draft, 'new_id', v_new), 'revise immutable content', null, null, true, null);
  return jsonb_build_object('ok', true, 'draft_id', v_draft, 'proposed_puzzle_id', v_new);
end; $$;

-- Lineage for a canonical puzzle: the source + every revision draft (with the
-- canonical id it became, if promoted). No circular parents possible — a draft is
-- never a puzzle, and a promoted revision gets a brand-new stable id.
create or replace function admin_puzzle_lineage(p_puzzle_id text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'puzzle_id', p_puzzle_id,
    'revisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'draft_id', d.id, 'proposed_puzzle_id', d.proposed_puzzle_id, 'status', d.status::text,
        'draft_version', d.draft_version, 'updated_at', d.updated_at,
        'promoted', d.status = 'promoted') order by d.updated_at desc)
      from authoring_drafts d where d.parent_puzzle_id = p_puzzle_id), '[]'::jsonb));
$$;

do $$ declare fn text; begin
  foreach fn in array array['admin_create_revision(text, uuid, text)', 'admin_puzzle_lineage(text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated;', fn);
    execute format('grant execute on function %s to service_role;', fn);
  end loop;
end $$;
