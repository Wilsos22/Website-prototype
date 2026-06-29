-- Big Dog Math — formative data: practice assignments + daily exit tickets.
-- Run once in Supabase (SQL Editor → New query → paste → Run).
--
-- Builds on the existing live-game tracking (challenges / challenge_attempts).
-- Assignments are the non-live, target-based practice ("do 10 rounds of the
-- Expression Simplifier") that students can do in a lesson OR as homework; each
-- attempt is logged exactly like a game attempt so it feeds the same mastery read.
-- Exit tickets are the end-of-lesson check the teacher authors per lesson.

-- ── Practice assignments ────────────────────────────────────────────────
-- NOTE: named practice_assignments (not "assignments") because a separate
-- manipulative-assignment feature already owns the "assignments" table.
create table if not exists practice_assignments (
  id            uuid primary key default gen_random_uuid(),
  period_id     uuid references periods(id) on delete set null,  -- null = open to any class
  skill         text not null,                 -- challengeSkills key, e.g. 'combine-like-terms'
  title         text not null,
  level         int  not null default 1,       -- 1 easy · 2 medium · 3 hard
  target_rounds int  not null default 10,      -- how many problems to complete
  due_label     text,                          -- free text, e.g. 'Homework — due Fri'
  status        text not null default 'open',  -- 'open' | 'closed'
  created_at    timestamptz not null default now()
);
create index if not exists practice_assignments_period_idx on practice_assignments(period_id);

create table if not exists practice_assignment_attempts (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references practice_assignments(id) on delete cascade,
  student_id     uuid references students(id) on delete set null,
  display_name   text,
  skill          text not null,                 -- copied from the assignment for easy mastery rollups
  prompt         text not null,
  correct_answer text not null,
  answer         text,
  is_correct     boolean not null default false,
  points         int     not null default 0,
  time_ms        int,
  round_index    int,                           -- 0-based position in this student's run
  created_at     timestamptz not null default now()
);
create index if not exists practice_assignment_attempts_assignment_idx on practice_assignment_attempts(assignment_id);
create index if not exists practice_assignment_attempts_student_idx     on practice_assignment_attempts(student_id);
create index if not exists practice_assignment_attempts_skill_idx       on practice_assignment_attempts(skill);

-- ── Daily exit tickets ──────────────────────────────────────────────────
create table if not exists exit_tickets (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid references sessions(id) on delete set null,
  period_id   uuid references periods(id) on delete set null,
  lesson_code text,                             -- ties the ticket to a lesson preset, optional
  prompt      text not null,
  kind        text not null default 'short-answer', -- 'short-answer' | 'multiple-choice' | 'fist-to-five'
  choices     jsonb,                            -- for multiple-choice
  status      text not null default 'open',     -- 'open' | 'closed'
  created_at  timestamptz not null default now()
);
create index if not exists exit_tickets_session_idx on exit_tickets(session_id);

create table if not exists exit_ticket_responses (
  id             uuid primary key default gen_random_uuid(),
  exit_ticket_id uuid not null references exit_tickets(id) on delete cascade,
  session_id     uuid references sessions(id) on delete set null,
  student_id     uuid references students(id) on delete set null,
  display_name   text,
  response       text,
  created_at     timestamptz not null default now()
);
create index if not exists exit_ticket_responses_ticket_idx on exit_ticket_responses(exit_ticket_id);

-- ── Prototype access (matches the rest of this project) ─────────────────
do $$
declare t text;
begin
  foreach t in array array['practice_assignments','practice_assignment_attempts','exit_tickets','exit_ticket_responses']
  loop
    execute format('grant all on table public.%I to anon, authenticated;', t);
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "prototype_all" on public.%I;', t);
    execute format('create policy "prototype_all" on public.%I for all to anon, authenticated using (true) with check (true);', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
