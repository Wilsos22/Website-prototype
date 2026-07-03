-- Big Dog Math — Independent Proficiency System: data spine (step 1).
-- Run once in Supabase (SQL Editor → New query → paste → Run).
--
-- Adds the standards taxonomy + prerequisite graph, the finite misconception
-- vocabulary, EWMA mastery state (+ history for the year-long growth view), the
-- tunable weight config, and cached next-move recommendations.
-- Spec: FABLE_WORKORDER_data_spine.md (v2) — built to match the validated
-- prototype in "Big Dog Math - Mock Data" (build_dashboard.py, AI_Next_Moves_POC.md).
--
-- SECURITY: unlike the prototype tables, mastery/history/recommendations are
-- SERVER-ONLY (service role via API routes). No anon/authenticated access at all.
-- Reference tables (standards, prereqs, misconceptions, config) are read-only.

-- ---------------------------------------------------------------------------
-- Standards taxonomy (Semester 1 scope, M1–M2; extend for Sem 2 later)
create table if not exists standards (
  id     text primary key,          -- CCSS code, e.g. '6.NS.B.4'
  title  text not null,
  strand text not null,             -- 'RP' | 'NS' | 'EE' | 'G' | 'NF' | 'NBT'
  domain text not null,             -- i-Ready domain the standard's items feed
  grade  int  not null default 6,
  sort   int
);

create table if not exists standard_prereqs (
  standard_id text not null references standards(id) on delete cascade,
  requires_id text not null references standards(id) on delete cascade,
  primary key (standard_id, requires_id)
);

-- Finite misconception vocabulary (exact-match tags; label is the key used in
-- responses.misconception / checkpoint_results.misconception — no NLP).
create table if not exists misconceptions (
  label       text primary key,
  standard_id text references standards(id) on delete set null,
  description text
);

-- ---------------------------------------------------------------------------
-- EWMA mastery state. One row per student × domain (the four bars), plus one
-- row per student × standard (stage gates). Domain-level rows use standard_id ''.
create table if not exists mastery (
  student_id  uuid not null references students(id) on delete cascade,
  domain      text not null,        -- i-Ready domain name
  standard_id text not null default '',   -- '' = domain-level bar row
  percent     numeric not null default 0, -- 0..100 EWMA
  stage       text not null default 'not_started',
  -- not_started | developing | approaching | mastered | complete
  updated_at  timestamptz not null default now(),
  primary key (student_id, domain, standard_id)
);

-- Append-only history → growth-over-the-year charts.
create table if not exists mastery_history (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references students(id) on delete cascade,
  domain      text not null,
  standard_id text not null default '',
  percent     numeric not null,
  stage       text not null,
  source      text,                 -- 'warmup' | 'tier1' | 'tier2' | 'tool' | 'iready_init'
  at          timestamptz not null default now()
);
create index if not exists mastery_history_student_idx
  on mastery_history(student_id, standard_id, at);

-- Tunable weights/cuts — mirrors build_dashboard.py; no magic numbers in code.
create table if not exists mastery_config (
  key   text primary key,
  value numeric not null
);
insert into mastery_config (key, value) values
  ('alpha_tier2', 0.40),            -- Tier-2 checkpoint moves the bar
  ('alpha_tier1', 0.20),            -- Tier-1 practice day nudges it
  ('alpha_warmup', 0.30),           -- daily warm-up / tool work, modest weight
  ('cut_got_it', 80),               -- checkpoint ≥80% = Got It (mastery moment)
  ('cut_almost', 50),               -- 50–79 Almost · <50 Intervention
  ('init_scale_min', 480),          -- i-Ready Fall init: clamp((scale-480)/180*100, 5, 98)
  ('init_scale_max', 660),
  ('init_floor', 5),
  ('init_ceiling', 98),
  ('complete_min_checkpoints', 2),  -- 'complete' needs ≥2 Tier-2 ≥80…
  ('complete_min_span_days', 21)    -- …spanning ≥3 weeks (+ SBAC-modeled item correct)
on conflict (key) do nothing;

-- Cached (misconception × archetype) next moves for the live "Right now" view.
create table if not exists recommendations (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid references sessions(id) on delete set null,
  period_id     uuid references periods(id) on delete set null,
  misconception text references misconceptions(label) on delete cascade,
  archetype     text,               -- high_steady | strong_recurring | leaper | plateau | chronically_low | non_submitter
  student_ids   uuid[] not null default '{}',
  type          text not null,      -- new_problem | new_explanation | connected_skill | extension | parent_contact
  content       jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index if not exists recommendations_period_idx on recommendations(period_id, created_at);

-- ---------------------------------------------------------------------------
-- Seeds — Semester 1 standards (M1–M2), prerequisite graph, misconception vocab.
insert into standards (id, title, strand, domain, grade, sort) values
  ('6.EE.A.3',  'Distributive property & equivalent expressions', 'EE',  'Algebra and Algebraic Thinking', 6, 10),
  ('6.EE.A.1',  'Whole-number exponents',                         'EE',  'Algebra and Algebraic Thinking', 6, 20),
  ('6.NS.B.4',  'GCF and LCM',                                    'NS',  'Number and Operations',          6, 30),
  ('5.NF.B.4',  'Multiply fractions',                             'NF',  'Number and Operations',          5, 40),
  ('6.NS.A.1',  'Divide fractions by fractions',                  'NS',  'Number and Operations',          6, 50),
  ('6.G.A.1',   'Area of triangles & special quadrilaterals',     'G',   'Geometry',                       6, 60),
  ('6.G.A.2',   'Volume with fractional edge lengths',            'G',   'Geometry',                       6, 70),
  ('6.G.A.3',   'Polygons in the coordinate plane',               'G',   'Geometry',                       6, 80),
  ('6.G.A.4',   'Nets and surface area',                          'G',   'Geometry',                       6, 90),
  ('5.NBT.A.3b','Compare decimals',                               'NBT', 'Number and Operations',          5, 100),
  ('6.NS.B.3',  'Decimal operations',                             'NS',  'Number and Operations',          6, 110),
  ('6.RP.A.1',  'Ratio concept & language',                       'RP',  'Number and Operations',          6, 120),
  ('6.RP.A.3',  'Ratio reasoning (tables & scaling)',             'RP',  'Number and Operations',          6, 130),
  ('6.RP.A.3a', 'Ratio tables & graphs',                          'RP',  'Number and Operations',          6, 140),
  ('6.RP.A.3b', 'Unit rate problems',                             'RP',  'Number and Operations',          6, 150),
  ('6.RP.A.2',  'Unit rates a/b',                                 'RP',  'Number and Operations',          6, 160),
  ('6.RP.A.3c', 'Percent of a quantity',                          'RP',  'Number and Operations',          6, 170),
  ('6.RP.A.3d', 'Unit conversions',                               'RP',  'Number and Operations',          6, 180)
on conflict (id) do nothing;

insert into standard_prereqs (standard_id, requires_id) values
  ('6.NS.A.1', '5.NF.B.4'),
  ('6.NS.B.3', '5.NBT.A.3b'),
  ('6.EE.A.3', '6.NS.B.4'),
  ('6.G.A.2',  '6.G.A.1'),
  ('6.G.A.4',  '6.G.A.1'),
  ('6.RP.A.3', '6.RP.A.1'),
  ('6.RP.A.2', '6.RP.A.1'),
  ('6.RP.A.3a','6.RP.A.3'),
  ('6.RP.A.3b','6.RP.A.2'),
  ('6.RP.A.3c','6.RP.A.3'),
  ('6.RP.A.3d','6.RP.A.3')
on conflict do nothing;

insert into misconceptions (label, standard_id, description) values
  ('treats ratio as additive',                        '6.RP.A.3',  'Adds the same number to both quantities instead of scaling (2:3 → 6:7).'),
  ('reverses part and whole in percent',              '6.RP.A.3c', 'Swaps which value is the part vs the whole when computing percents.'),
  ('adds denominators when adding fractions',         null,        'Computes a/b + c/d as (a+c)/(b+d).'),
  ('misplaces decimal in division',                   '6.NS.B.3',  'Correct digits, wrong magnitude when dividing decimals.'),
  ('ignores order of operations',                     '6.EE.A.1',  'Evaluates strictly left-to-right, ignoring GEMS/PEMDAS structure.'),
  ('confuses coefficient with exponent',              '6.EE.A.1',  'Reads 3x as x^3 (or vice versa).'),
  ('sign errors with negatives',                      null,        'Drops or flips signs when operating with negative numbers.'),
  ('reverses inequality symbol',                      null,        'Points the inequality the wrong way after comparing or solving.'),
  ('confuses area vs perimeter',                      '6.G.A.1',   'Adds side lengths for area, or multiplies for perimeter.'),
  ('forgets to halve base × height for triangle area','6.G.A.1',   'Uses b×h for triangles without the ×1/2.'),
  ('confuses mean and median',                        null,        'Reports the middle value as the mean or vice versa.'),
  ('miscounts frequencies in a data display',         null,        'Misreads dot plots/histograms when tallying frequencies.'),
  ('distributes to first term only',                  '6.EE.A.3',  'Writes a(b + c) = ab + c, distributing to the first term only.')
on conflict (label) do nothing;

-- ---------------------------------------------------------------------------
-- Security. Reference tables: readable by clients, writable only via service
-- role. Mastery/history/recommendations: SERVER-ONLY — RLS on, no policies, no
-- grants → anon/authenticated get nothing; API routes use the service role key.
do $$
declare t text;
begin
  -- read-only reference tables
  foreach t in array array['standards','standard_prereqs','misconceptions','mastery_config']
  loop
    execute format('grant select on table public.%I to anon, authenticated;', t);
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "read_only" on public.%I;', t);
    execute format('create policy "read_only" on public.%I for select to anon, authenticated using (true);', t);
  end loop;
  -- server-only tables (deny-by-default: RLS enabled, zero policies, no grants)
  foreach t in array array['mastery','mastery_history','recommendations']
  loop
    execute format('revoke all on table public.%I from anon, authenticated;', t);
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
