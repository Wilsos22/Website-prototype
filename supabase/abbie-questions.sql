-- Big Dog Math - moderated "Ask Abbie" queue.
-- Run this once in Supabase (SQL Editor, New query, paste, Run).
-- Students submit written questions for Abbie from their screen; each lands as a
-- pending row. The teacher approves (Abbie answers for the class) or dismisses.
-- The teacher is always the gate, so nobody can trigger Abbie by yelling.

create table if not exists abbie_questions (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions(id) on delete cascade,
  student_id   uuid references students(id) on delete set null,
  display_name text,
  question     text not null,
  status       text not null default 'pending',  -- pending | answered | dismissed
  answer       text,
  created_at   timestamptz not null default now(),
  answered_at  timestamptz
);
create index if not exists abbie_questions_session_idx on abbie_questions(session_id, status);

-- Prototype access (matches policies.sql). Lock down with the rest later.
grant all on table public.abbie_questions to anon, authenticated;
alter table public.abbie_questions enable row level security;
drop policy if exists "prototype_all" on public.abbie_questions;
create policy "prototype_all" on public.abbie_questions for all to anon, authenticated using (true) with check (true);

notify pgrst, 'reload schema';
