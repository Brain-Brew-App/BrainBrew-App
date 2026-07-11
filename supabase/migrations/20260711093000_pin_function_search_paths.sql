-- BrainBrew — pin search_path on trigger/helper functions (Phase 4B, Step 4).
--
-- The Supabase Security Advisor flags every function with a role-mutable
-- search_path (`function_search_path_mutable`). `get_public_pack` and
-- `publish_pack` already pin theirs; the Phase 4A integrity triggers, the
-- `updated_at` helper, and the Phase 4B attempt triggers did not.
--
-- A mutable search_path lets a caller's session settings influence which schema
-- an unqualified name resolves to. Pinning it to `public, pg_temp` makes
-- resolution deterministic and clears the finding, without changing behaviour:
-- every one of these functions already references only `public` objects by
-- unqualified name. This is an ALTER (no redefinition), so the trigger bodies
-- and their bindings are untouched.

alter function public.set_updated_at()                     set search_path = public, pg_temp;
alter function public.enforce_puzzle_engine_category()     set search_path = public, pg_temp;
alter function public.enforce_puzzle_approval()            set search_path = public, pg_temp;
alter function public.enforce_slot_puzzle_agreement()      set search_path = public, pg_temp;
alter function public.enforce_pack_completeness()          set search_path = public, pg_temp;
alter function public.enforce_published_pack_immutable()   set search_path = public, pg_temp;
alter function public.enforce_void_no_substitution()       set search_path = public, pg_temp;
alter function public.enforce_item_slot_not_void()         set search_path = public, pg_temp;
alter function public.enforce_item_immutable_once_submitted() set search_path = public, pg_temp;
alter function public.enforce_attempt_terminal()           set search_path = public, pg_temp;
