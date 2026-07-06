-- Big Dog Math — proficiency spine step 2: evidence ingestion columns.
-- Run once in Supabase (SQL Editor → New query → paste → Run), AFTER proficiency.sql.
--
-- Extends the existing raw logs so mastery can be replayed from them:
--  · responses gains source/domain/standard tags (and problem_id becomes optional,
--    so warm-up Form answers + tool events can log without a problems row)
--  · checkpoint_runs gains tier (1|2) and is_sbac (the SBAC-modeled item flag)
--  · iready_scores stores diagnostic baselines (Fall initializes the mastery bars)

alter table responses alter column problem_id drop not null;
alter table responses add column if not exists source      text;  -- 'warmup' | 'tool' (null = legacy rows)
alter table responses add column if not exists domain      text;  -- i-Ready domain (else derived from problem topic)
alter table responses add column if not exists standard_id text;  -- CCSS code when known
alter table responses add column if not exists item_ref    text;  -- form question id / tool problem id
alter table responses add column if not exists dedupe_key  text;  -- idempotent ingestion
create unique index if not exists responses_dedupe_idx on responses(dedupe_key) where dedupe_key is not null;
create index if not exists responses_student_time_idx on responses(student_id, submitted_at);

alter table checkpoint_runs add column if not exists tier    int     not null default 2;
alter table checkpoint_runs add column if not exists is_sbac boolean not null default false;

create table if not exists iready_scores (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references students(id) on delete cascade,
  "window"    text not null,            -- 'Fall' | 'Winter' | 'Spring'
  domain      text not null,            -- i-Ready domain name
  scale_score numeric,
  created_at  timestamptz not null default now(),
  unique (student_id, "window", domain)
);

-- iready_scores is server-only, like mastery (reads/writes via service-role API routes).
do $$
begin
  execute 'revoke all on table public.iready_scores from anon, authenticated';
  execute 'alter table public.iready_scores enable row level security';
end $$;

notify pgrst, 'reload schema';
