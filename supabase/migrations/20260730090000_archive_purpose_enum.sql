-- BrainBrew — Archive attempt purpose (Phase 7J, Premium Archives).
--
-- Adds the 'archive' attempt purpose in its OWN migration so the new enum value is
-- committed before any later migration/function uses it (Postgres forbids using a
-- freshly-added enum value in the same transaction). Archive attempts replay a past
-- daily pack UNRANKED; is_ranked stays the authority for ranked isolation, and the
-- purpose lets analytics + stats separate archive from ordinary practice.

alter type attempt_purpose add value if not exists 'archive';
