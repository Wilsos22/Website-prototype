-- Big Dog Math — Gradebook schema (Phase 0)
-- Run this in your Supabase project: SQL Editor → New query → paste → Run.
-- Safe to re-run: it only creates tables if they don't already exist.

-- ── Class periods (e.g., "Period 1", "Period 2") ─────────────────────────────
create table if not exists periods (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

-- ── Students, each belonging to one period (your fixed rosters) ───────────────
create table if not exists students (
  id          uuid primary key default gen_random_uuid(),
  period_id   uuid not null references periods(id) on delete cascade,
  full_name   text not null,
  email       text unique,          -- school Google email, auto-filled on sign-in
                                     -- (null is fine for hand-entered/test students)
  created_at  timestamptz not null default now()
);
create index if not exists students_period_idx on students(period_id);
create index if not exists students_email_idx on students(email);

-- ── Problems = your answer key. One row per problem you want students to do. ──
-- manipulative: which tool the student uses ('whiteboard','algebra_tiles',
--   'fraction_bars','number_line', etc.)
create table if not exists problems (
  id             uuid primary key default gen_random_uuid(),
  prompt         text not null,
  correct_answer text,                 -- left null if you'll grade it manually
  manipulative   text not null,
  created_at     timestamptz not null default now()
);

-- ── Assignments = a manipulative + a set of problems for a period ─────────────
-- mode: 'live' (done in a class session), 'async' (students do on their own),
--   or 'both'
create table if not exists assignments (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  period_id    uuid not null references periods(id) on delete cascade,
  manipulative text not null,
  mode         text not null default 'both',
  due_date     date,
  created_at   timestamptz not null default now()
);

-- Which problems belong to an assignment, and in what order
create table if not exists assignment_problems (
  assignment_id uuid not null references assignments(id) on delete cascade,
  problem_id    uuid not null references problems(id) on delete cascade,
  position      int  not null default 0,
  primary key (assignment_id, problem_id)
);

-- ── Sessions = a live class run of a period (optionally tied to an assignment) ─
create table if not exists sessions (
  id            uuid primary key default gen_random_uuid(),
  period_id     uuid not null references periods(id) on delete cascade,
  assignment_id uuid references assignments(id) on delete set null,
  join_code     text unique,           -- code students type to join live
  status        text not null default 'open',  -- 'open' | 'closed'
  started_at    timestamptz not null default now(),
  ended_at      timestamptz
);

-- ── Responses = one student's answer to one problem ──────────────────────────
-- work_snapshot: JSON capture of what they built with the manipulative
-- graded_by: null | 'teacher' | 'ai'   ·   confirmed: you signed off on the grade
create table if not exists responses (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students(id) on delete cascade,
  problem_id    uuid not null references problems(id) on delete cascade,
  session_id    uuid references sessions(id) on delete set null,
  assignment_id uuid references assignments(id) on delete set null,
  answer        text,
  work_snapshot jsonb,
  is_correct    boolean,
  score         numeric,
  misconception text,                  -- short note on the misunderstanding
  graded_by     text,
  confirmed     boolean not null default false,
  submitted_at  timestamptz not null default now()
);
create index if not exists responses_student_idx on responses(student_id);
create index if not exists responses_session_idx on responses(session_id);
create index if not exists responses_assignment_idx on responses(assignment_id);

-- ── Period summaries = the after-session "where understanding broke down" note ─
create table if not exists period_summaries (
  id           uuid primary key default gen_random_uuid(),
  period_id    uuid not null references periods(id) on delete cascade,
  session_id   uuid references sessions(id) on delete set null,
  summary_text text not null,
  created_by   text not null default 'teacher',  -- 'teacher' | 'ai'
  created_at   timestamptz not null default now()
);
