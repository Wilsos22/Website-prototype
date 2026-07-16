-- Big Dog Math - BRUH, the live team review game.
-- Run once in Supabase (SQL Editor -> New query -> paste -> Run). Idempotent.
--
-- The teacher picks a saved question bank, names the teams, and deploys the class
-- to /bruh. Students answer on their laptops; the board shows who is in, who is
-- locked out, and who is right, so the teacher can put the buzzer receiver down.
--
-- This is a review game about teamwork and effort - it deliberately does NOT feed
-- the proficiency spine. Nothing here writes to responses or mastery.
--
-- SECURITY: every table here is SERVER-ONLY (RLS on, zero policies, no grants to
-- anon/authenticated), matching the mastery group in proficiency.sql rather than
-- the older prototype_all pattern. Scores, the correct answer, the reward draw and
-- the lockout are all things a student must not be able to read early or rewrite,
-- so every read and write goes through a service-role API route.

-- ---------------------------------------------------------------------------
-- Reusable question banks. Authored once on /teacher/bruh, launched many times.
create table if not exists bruh_sets (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  questions  jsonb not null,               -- [{ n, topic, q, a }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- One row per game night.
create table if not exists bruh_games (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references sessions(id) on delete cascade,
  set_name        text,
  -- Snapshot of the bank at launch, so editing a set later never rewrites a
  -- game that already happened.
  questions       jsonb not null,          -- [{ n, topic, q, a }]
  answer_seconds  int  not null default 120,
  lockout_seconds int  not null default 20,
  explain_seconds int  not null default 120,
  status          text not null default 'lobby',  -- 'lobby' | 'playing' | 'done'
  created_at      timestamptz not null default now()
);
create index if not exists bruh_games_session_idx on bruh_games(session_id);

create table if not exists bruh_teams (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references bruh_games(id) on delete cascade,
  name       text not null,
  color      text not null,
  score      int  not null default 0,
  sort_order int  not null default 0
);
create index if not exists bruh_teams_game_idx on bruh_teams(game_id);

-- A student picks a team once and is stuck with it. Without this a kid could
-- switch teams and lob wrong answers to lock a rival out.
-- Real unique constraint, not a partial index: PostgREST cannot resolve partial
-- indexes for on_conflict (see upsert-constraint-hardening.sql).
create table if not exists bruh_players (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references bruh_games(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  team_id    uuid not null references bruh_teams(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  constraint bruh_players_game_student_key unique (game_id, student_id)
);
create index if not exists bruh_players_game_idx on bruh_players(game_id);

-- ---------------------------------------------------------------------------
-- One row per question played. ends_at is the whole timer: clients derive
-- secondsLeft from wall-clock against it rather than counting down locally, so a
-- backgrounded teacher tab cannot stall the room and a mid-round joiner is
-- correct for free.
create table if not exists bruh_rounds (
  id             uuid primary key default gen_random_uuid(),
  game_id        uuid not null references bruh_games(id) on delete cascade,
  question_n     int  not null,
  topic          text,
  prompt         text not null,
  correct_answer text not null,            -- never sent to a student while open
  phase          text not null default 'answering',
  -- 'answering' | 'reveal' | 'spotlight' | 'explain' | 'reward' | 'done'
  opened_at      timestamptz not null default now(),
  ends_at        timestamptz not null,
  explain_ends_at timestamptz,
  picked_team_id uuid references bruh_teams(id) on delete set null,
  reward         jsonb,                    -- the drawn card, decided server-side
  vocab          jsonb,                    -- the words the explainer must use
  created_at     timestamptz not null default now()
);
create index if not exists bruh_rounds_game_idx on bruh_rounds(game_id);

-- Append-only. A team can attempt again once its lockout expires, so there may be
-- several rows per (round, team); the team's live state is derived from the latest.
create table if not exists bruh_answers (
  id           uuid primary key default gen_random_uuid(),
  round_id     uuid not null references bruh_rounds(id) on delete cascade,
  team_id      uuid not null references bruh_teams(id) on delete cascade,
  student_id   uuid references students(id) on delete set null,
  answer       text not null,
  is_correct   boolean not null,           -- graded server-side against the round
  locked_until timestamptz,                -- set when wrong; server rejects until then
  submitted_at timestamptz not null default now()
);
create index if not exists bruh_answers_round_idx on bruh_answers(round_id);
create index if not exists bruh_answers_round_team_idx on bruh_answers(round_id, team_id);

-- ---------------------------------------------------------------------------
-- Deny by default: RLS enabled, zero policies, no grants. Only the service role
-- key (used by src/app/api/{teacher,student}/bruh) can touch these.
do $$
declare t text;
begin
  foreach t in array array['bruh_sets','bruh_games','bruh_teams','bruh_players','bruh_rounds','bruh_answers']
  loop
    execute format('revoke all on table public.%I from anon, authenticated;', t);
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
