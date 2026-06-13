-- Big Dog Math — "join with a code" support.
-- Run this once in Supabase (SQL Editor → New query → paste → Run).
-- Records which students joined a live session (the teacher's join code).

create table if not exists session_joins (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions(id) on delete cascade,
  student_id   uuid references students(id) on delete set null,
  display_name text,
  joined_at    timestamptz not null default now()
);
create index if not exists session_joins_session_idx on session_joins(session_id);

-- Prototype access (matches policies.sql). Lock down with the rest later.
grant all on table public.session_joins to anon, authenticated;
alter table public.session_joins enable row level security;
drop policy if exists "prototype_all" on public.session_joins;
create policy "prototype_all" on public.session_joins for all to anon, authenticated using (true) with check (true);
