-- Big Dog Math - City Routes (private differentiated release).
-- Run once in Supabase (SQL Editor -> New query -> paste -> Run). Idempotent.
--
-- Route assignments encode readiness evidence about individual students, so
-- BOTH tables live in the server-only RLS group (like mastery): RLS enabled,
-- zero policies, revoked from anon. They are reachable only through the
-- service-role client in /api/* route handlers. The student card endpoint
-- returns city/destination/materials/first-action only - never the route
-- meaning or the evidence.

-- One prepared or released run per live session. `cities` snapshots the
-- three chosen cities with their (private) route meanings and the
-- student-safe card copy resolved at preparation time.
create table if not exists public.city_route_runs (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions(id) on delete cascade,
  lesson_code  text not null default '',
  salt         int  not null default 0,             -- "Shuffle cities" counter
  cities       jsonb not null default '[]'::jsonb,  -- CityStop[] from src/lib/cityRoutes.ts
  status       text not null default 'draft',       -- 'draft' | 'released'
  released_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists city_route_runs_session_idx on public.city_route_runs(session_id);

-- One row per student per run. `student_key` is the student uuid as text, or
-- 'name:<display_name>' for name-only joins, matching how poll_answers are
-- keyed. `evidence` holds the readiness answers and Fist-to-Five rating and
-- is teacher-only by table posture.
create table if not exists public.city_route_assignments (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references public.city_route_runs(id) on delete cascade,
  student_key    text not null,
  display_name   text not null default '',
  route          text not null,                     -- 'teacher' | 'partner' | 'independent'
  city           text not null,
  source         text not null default 'auto',      -- 'auto' | 'override'
  low_confidence boolean not null default false,
  evidence       jsonb,
  updated_at     timestamptz not null default now(),
  unique (run_id, student_key)
);
create index if not exists city_route_assignments_run_idx on public.city_route_assignments(run_id);

-- Server-only lockdown (deny-by-default: RLS enabled, zero policies, no grants).
do $$
declare t text;
begin
  foreach t in array array['city_route_runs','city_route_assignments']
  loop
    execute format('revoke all on table public.%I from anon, authenticated;', t);
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
