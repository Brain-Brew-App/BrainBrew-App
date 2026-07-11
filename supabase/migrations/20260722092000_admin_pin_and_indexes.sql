-- Phase 7F follow-up: pin the audit trigger function's search_path (advisor
-- function_search_path_mutable) and add covering indexes for the incident FKs.
-- Matches the (now-patched) original for fresh DBs; applies to the live schema.

alter function admin_audit_immutable() set search_path = pg_catalog, pg_temp;

create index if not exists admin_incident_events_incident_idx on admin_incident_events (incident_id);
create index if not exists admin_incidents_status_idx on admin_incidents (status, severity);
create index if not exists admin_audit_log_created_idx on admin_audit_log (created_at desc);
create index if not exists admin_audit_log_target_idx on admin_audit_log (target_type, target_id);
