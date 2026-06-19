-- Big Dog Math — live poll / question support.
-- Run once in Supabase (SQL Editor → New query → paste → Run).

create table if not exists polls (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  question    text not null,
  choices     jsonb,                 -- array of strings for multiple choice; null = open response
  kind        text not null default 'short-answer', -- short-answer | multiple-choice | fist-to-five
  status      text not null default 'open',  -- 'open' | 'closed'
  created_at  timestamptz not null default now()
);
create index if not exists polls_session_idx on polls(session_id);

-- Existing projects already have the table, so add the typed poll column safely.
alter table public.polls add column if not exists kind text not null default 'short-answer';

create table if not exists poll_answers (
  id            uuid primary key default gen_random_uuid(),
  poll_id       uuid not null references polls(id) on delete cascade,
  student_id    uuid references students(id) on delete set null,
  display_name  text,
  answer        text,
  created_at    timestamptz not null default now()
);
create index if not exists poll_answers_poll_idx on poll_answers(poll_id);

-- Prototype access (matches policies.sql). Lock down later.
do $$
declare t text;
begin
  foreach t in array array['polls','poll_answers']
  loop
    execute format('grant all on table public.%I to anon, authenticated;', t);
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "prototype_all" on public.%I;', t);
    execute format('create policy "prototype_all" on public.%I for all to anon, authenticated using (true) with check (true);', t);
  end loop;
end $$;
