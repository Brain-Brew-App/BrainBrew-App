-- BrainBrew — canonical country reference (Phase 5B, Task 5).
--
-- A stable, controlled list so a profile's self-reported country is validated
-- against real ISO 3166-1 alpha-2 codes (never an arbitrary client string), and
-- a future country leaderboard has a canonical key to group by. Country is a
-- low-stakes, self-reported profile field — NOT geolocation or IP enforcement.
--
-- No emoji flags in the database (a client concern). English display names only;
-- localization is deferred. The seed is a curated but comprehensive set covering
-- every region and all GCC states; it is idempotent and easily extended by
-- re-running with more rows.

create table countries (
  code         text primary key
                 constraint country_code_alpha2 check (code ~ '^[A-Z]{2}$'),
  name         text not null constraint country_name_present check (length(trim(name)) > 0),
  active       boolean not null default true,
  display_order int not null default 1000,
  created_at   timestamptz not null default now()
);

comment on table countries is
  'Canonical ISO 3166-1 alpha-2 reference for the self-reported profile country. Not geolocation.';

insert into countries (code, name, display_order) values
  ('AE', 'United Arab Emirates', 10),
  ('SA', 'Saudi Arabia', 20),
  ('QA', 'Qatar', 30),
  ('KW', 'Kuwait', 40),
  ('BH', 'Bahrain', 50),
  ('OM', 'Oman', 60),
  ('EG', 'Egypt', 70),
  ('JO', 'Jordan', 80),
  ('LB', 'Lebanon', 90),
  ('IQ', 'Iraq', 100),
  ('MA', 'Morocco', 110),
  ('DZ', 'Algeria', 120),
  ('TN', 'Tunisia', 130),
  ('US', 'United States', 200),
  ('GB', 'United Kingdom', 210),
  ('CA', 'Canada', 220),
  ('AU', 'Australia', 230),
  ('NZ', 'New Zealand', 240),
  ('IE', 'Ireland', 250),
  ('DE', 'Germany', 300),
  ('FR', 'France', 310),
  ('ES', 'Spain', 320),
  ('IT', 'Italy', 330),
  ('PT', 'Portugal', 340),
  ('NL', 'Netherlands', 350),
  ('BE', 'Belgium', 360),
  ('CH', 'Switzerland', 370),
  ('AT', 'Austria', 380),
  ('SE', 'Sweden', 390),
  ('NO', 'Norway', 400),
  ('DK', 'Denmark', 410),
  ('FI', 'Finland', 420),
  ('PL', 'Poland', 430),
  ('CZ', 'Czechia', 440),
  ('GR', 'Greece', 450),
  ('RO', 'Romania', 460),
  ('HU', 'Hungary', 470),
  ('UA', 'Ukraine', 480),
  ('RU', 'Russia', 490),
  ('TR', 'Türkiye', 500),
  ('IN', 'India', 600),
  ('PK', 'Pakistan', 610),
  ('BD', 'Bangladesh', 620),
  ('LK', 'Sri Lanka', 630),
  ('CN', 'China', 640),
  ('JP', 'Japan', 650),
  ('KR', 'South Korea', 660),
  ('ID', 'Indonesia', 670),
  ('MY', 'Malaysia', 680),
  ('SG', 'Singapore', 690),
  ('PH', 'Philippines', 700),
  ('TH', 'Thailand', 710),
  ('VN', 'Vietnam', 720),
  ('HK', 'Hong Kong', 730),
  ('TW', 'Taiwan', 740),
  ('BR', 'Brazil', 800),
  ('MX', 'Mexico', 810),
  ('AR', 'Argentina', 820),
  ('CL', 'Chile', 830),
  ('CO', 'Colombia', 840),
  ('PE', 'Peru', 850),
  ('ZA', 'South Africa', 900),
  ('NG', 'Nigeria', 910),
  ('KE', 'Kenya', 920),
  ('GH', 'Ghana', 930),
  ('ET', 'Ethiopia', 940),
  ('IL', 'Israel', 950),
  ('IR', 'Iran', 960)
on conflict (code) do update set name = excluded.name, display_order = excluded.display_order;

-- Public read of the country list (it is reference data, no PII). Writes stay
-- owner-only. RLS on with a read policy for everyone.
alter table countries enable row level security;
create policy countries_readable on countries for select using (true);
grant select on countries to anon, authenticated;
