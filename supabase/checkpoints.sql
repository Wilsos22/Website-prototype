-- Big Dog Math — SBAC checkpoint delivery + capture.
-- Run once in Supabase (SQL Editor → New query → paste → Run).
--
-- The teacher launches one SBAC-modeled item (from the bundled bank in
-- src/lib/sbacCheckpoints.ts) during a lesson. Students answer on /checkpoint;
-- the answer is auto-graded against correct_answer and, when wrong, matched to a
-- known misconception. Results feed the checkpoint dashboard + Notion roll-up.

create table if not exists checkpoint_runs (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid references sessions(id) on delete set null,
  period_id      uuid references periods(id) on delete set null,
  lesson_key     text,
  checkpoint_id  text not null,
  item_index     int  not null default 0,
  ccss           text,
  prompt         text not null,
  correct_answer text not null,
  misses         jsonb,
  status         text not null default 'open',
  notion_summary_url text,                  -- set by the daily Notion sync (summary page)
  created_at     timestamptz not null default now()
);
create index if not exists checkpoint_runs_session_idx on checkpoint_runs(session_id);

create table if not exists checkpoint_results (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references checkpoint_runs(id) on delete cascade,
  session_id    uuid references sessions(id) on delete set null,
  student_id    uuid references students(id) on delete set null,
  display_name  text,
  answer        text,
  is_correct    boolean not null default false,
  misconception text,
  ccss          text,
  notion_synced boolean not null default false,  -- daily Notion sync marks rows as pushed
  created_at    timestamptz not null default now()
);
create index if not exists checkpoint_results_run_idx on checkpoint_results(run_id);
create index if not exists checkpoint_results_ccss_idx on checkpoint_results(ccss);

do $$
declare t text;
begin
  foreach t in array array['checkpoint_runs','checkpoint_results']
  loop
    execute format('grant all on table public.%I to anon, authenticated;', t);
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "prototype_all" on public.%I;', t);
    execute format('create policy "prototype_all" on public.%I for all to anon, authenticated using (true) with check (true);', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
