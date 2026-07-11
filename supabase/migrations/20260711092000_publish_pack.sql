-- BrainBrew — pack publication (Phase 4B, Task 5).
--
-- Assigns an approved pack TEMPLATE to a real UTC date and makes it live. This
-- is the one operation that turns an undated, approved template (how content is
-- imported) into a public, dated pack.
--
-- Idempotent and safe: re-publishing the same pack to the same date is a no-op;
-- a pack already live on another date cannot be moved; a date already owned by
-- another pack is refused; only approved packs (which the completeness trigger
-- guarantees have five ordered slots) can be published. Publishing never touches
-- slot membership, so the global no-reuse invariant is untouched.
--
-- Privileged: service_role only. Never callable by anon.

create or replace function publish_pack(p_pack_id text, p_date date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare cur_status pack_status; cur_date date;
begin
  select status, pack_date into cur_status, cur_date from daily_packs where pack_id = p_pack_id;
  if not found then
    raise exception 'pack % does not exist', p_pack_id;
  end if;

  -- Idempotent: already live on exactly this date.
  if cur_status = 'live' and cur_date = p_date then
    return;
  end if;

  -- A live pack is pinned to its date; it can never be moved.
  if cur_status = 'live' and cur_date is distinct from p_date then
    raise exception 'pack % is already live on % and cannot be moved to %', p_pack_id, cur_date, p_date;
  end if;

  -- Only an approved template may be published.
  if cur_status <> 'approved' then
    raise exception 'pack % is % — only an approved pack may be published', p_pack_id, cur_status;
  end if;

  -- One canonical pack per UTC date.
  if exists (select 1 from daily_packs where pack_date = p_date and pack_id <> p_pack_id) then
    raise exception 'date % is already owned by another pack', p_date;
  end if;

  update daily_packs
     set pack_date = p_date, status = 'live', published_at = now()
   where pack_id = p_pack_id;
end;
$$;

comment on function publish_pack(text, date) is
  'Publishes an approved pack template to a UTC date (idempotent). One pack per date; live packs are immutable and cannot be moved.';

revoke all on function publish_pack(text, date) from public, anon, authenticated;
grant execute on function publish_pack(text, date) to service_role;
