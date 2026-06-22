-- Big Dog Math — live "Challenge" game + formative data capture.
-- Run once in Supabase (SQL Editor → New query → paste → Run).
--
-- A challenge is a live competitive round the teacher launches during a session.
-- Students race through auto-generated problems on a chosen skill; every answer
-- is recorded in challenge_attempts (that's the formative data) and rolled up
-- into a live leaderboard.

create table if not exists challenges (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references sessions(id) on delete cascade,
  skill            text not null,                 -- skill key, e.g. 'order-of-operations'
  title            text not null,                 -- friendly label shown to students
  level            int  not null default 1,       -- 1 easy · 2 medium · 3 hard
  duration_seconds int  not null default 180,
  status           text not null default 'open',  -- 'open' | 'closed'
  started_at       timestamptz not null default now(),
  ended_at         timestamptz
);
create index if not exists challenges_session_idx on challenges(session_id);

create table if not exists challenge_attempts (
  id             uuid primary key default gen_random_uuid(),
  challenge_id   uuid not null references challenges(id) on delete cascade,
  session_id     uuid not null references sessions(id) on delete cascade,
  student_id     uuid references students(id) on delete set null,
  display_name   text,
  prompt         text not null,                   -- the exact problem shown
  correct_answer text not null,
  answer         text,                            -- what the student submitted
  is_correct     boolean not null default false,
  points         int     not null default 0,      -- base + speed bonus
  time_ms        int,                             -- ms from problem shown to answer
  created_at     timestamptz not null default now()
);
create index if not exists challenge_attempts_challenge_idx on challenge_attempts(challenge_id);
create index if not exists challenge_attempts_session_idx   on challenge_attempts(session_id);
create index if not exists challenge_attempts_student_idx   on challenge_attempts(student_id);

-- Prototype access (matches policies.sql). Lock down later behind teacher auth.
do $$
declare t text;
begin
  foreach t in array array['challenges','challenge_attempts']
  loop
    execute format('grant all on table public.%I to anon, authenticated;', t);
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "prototype_all" on public.%I;', t);
    execute format('create policy "prototype_all" on public.%I for all to anon, authenticated using (true) with check (true);', t);
  end loop;
end $$;
