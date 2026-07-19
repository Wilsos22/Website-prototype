-- Big Dog Math - Grudge Ball, the second live team review game.
-- Run once in Supabase (SQL Editor -> New query -> paste -> Run). Idempotent.
--
-- Same question loop as BRUH (answer / reveal / explain), but the reward beat is
-- replaced by two new beats: the winning team shoots a real basketball hoop, then
-- walks to the panel and takes X's off other teams. Score means X's ("lives"),
-- not points.
--
-- Rules that shape the schema:
--   - Start with 10 X's. Zero = out of the SHOOTING, not out of the game: an out
--     team still answers every question and is IMMUNE (nobody can steal from a
--     team at 0).
--   - Back with a grudge: win 2 questions while out (cumulative) to revive,
--     returning with 3 X's taken from the team that zeroed you (nemesis) or a pick.
--
-- SECURITY: server-only, exactly like bruh_*. RLS on, zero policies, no grants to
-- anon/authenticated. Scores, the answer key, the shoot count and the steal are all
-- things a student must not read early or rewrite; every read and write goes through
-- a service-role API route. Question banks are SHARED with BRUH via bruh_sets - a
-- set authored once works in either game - so there is no grudge_sets table.

-- ---------------------------------------------------------------------------
create table if not exists grudge_games (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references sessions(id) on delete cascade,
  set_name        text,
  questions       jsonb not null,          -- [{ n, topic, q, a }] snapshot at launch
  answer_seconds  int  not null default 120,
  lockout_seconds int  not null default 20,
  explain_seconds int  not null default 120,
  shoot_seconds   int  not null default 30,
  starting_lives  int  not null default 10,
  revive_wins     int  not null default 2, -- correct answers while out, to revive
  revive_lives    int  not null default 3, -- X's you come back with
  status          text not null default 'lobby',  -- 'lobby' | 'playing' | 'done'
  created_at      timestamptz not null default now()
);
create index if not exists grudge_games_session_idx on grudge_games(session_id);

create table if not exists grudge_teams (
  id              uuid primary key default gen_random_uuid(),
  game_id         uuid not null references grudge_games(id) on delete cascade,
  name            text not null,
  color           text not null,
  lives           int  not null default 10,       -- X's remaining
  out             boolean not null default false, -- reached 0; still answering
  wins_while_out  int  not null default 0,         -- progress toward a revive
  nemesis_team_id uuid references grudge_teams(id) on delete set null, -- who zeroed us
  sort_order      int  not null default 0
);
create index if not exists grudge_teams_game_idx on grudge_teams(game_id);

-- A student picks a team once. Real unique constraint, not a partial index:
-- PostgREST cannot resolve partial indexes for on_conflict.
create table if not exists grudge_players (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references grudge_games(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  team_id    uuid not null references grudge_teams(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  constraint grudge_players_game_student_key unique (game_id, student_id)
);
create index if not exists grudge_players_game_idx on grudge_players(game_id);

-- One row per question played. ends_at / shoot_ends_at are the timers; clients
-- diff against a serverNow the API returns rather than counting down locally.
create table if not exists grudge_rounds (
  id               uuid primary key default gen_random_uuid(),
  game_id          uuid not null references grudge_games(id) on delete cascade,
  question_n       int  not null,
  topic            text,
  prompt           text not null,
  correct_answer   text not null,           -- never sent to a student while open
  phase            text not null default 'answering',
  -- 'answering' | 'reveal' | 'explain' | 'shoot' | 'steal' | 'done'
  opened_at        timestamptz not null default now(),
  ends_at          timestamptz not null,
  explain_ends_at  timestamptz,
  shoot_ends_at    timestamptz,
  champion_team_id uuid references grudge_teams(id) on delete set null,
  makes            int  not null default 0,  -- baskets made in the shoot window
  makes_spent      int  not null default 0,  -- X's already taken this round
  steals           jsonb,                    -- ledger for display: [{from,to,at}]
  is_revive        boolean not null default false, -- this round's steal is a comeback
  vocab            jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists grudge_rounds_game_idx on grudge_rounds(game_id);

-- Append-only. A team may attempt again once its lockout expires; live state is
-- derived from the latest, except a correct answer sticks.
create table if not exists grudge_answers (
  id           uuid primary key default gen_random_uuid(),
  round_id     uuid not null references grudge_rounds(id) on delete cascade,
  team_id      uuid not null references grudge_teams(id) on delete cascade,
  student_id   uuid references students(id) on delete set null,
  answer       text not null,
  is_correct   boolean not null,
  locked_until timestamptz,
  submitted_at timestamptz not null default now()
);
create index if not exists grudge_answers_round_idx on grudge_answers(round_id);
create index if not exists grudge_answers_round_team_idx on grudge_answers(round_id, team_id);

-- ---------------------------------------------------------------------------
-- Deny by default: RLS on, zero policies, no grants. Only the service role key
-- (used by src/app/api/{teacher,student}/grudge) can touch these.
do $$
declare t text;
begin
  foreach t in array array['grudge_games','grudge_teams','grudge_players','grudge_rounds','grudge_answers']
  loop
    execute format('revoke all on table public.%I from anon, authenticated;', t);
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
