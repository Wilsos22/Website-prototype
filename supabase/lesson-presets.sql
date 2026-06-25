-- Big Dog Math — Lesson Presets (saved control sequences).
-- Run once in Supabase (SQL Editor → New query → paste → Run).
-- Stores a named lesson (code + title) and its sequence: the ordered lineup of
-- class states and each state's minutes, so the teacher can load + start a whole
-- lesson in one click.

create table if not exists public.lesson_presets (
  id uuid primary key default gen_random_uuid(),
  code text not null default '',
  title text not null default '',
  sequence jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.lesson_presets enable row level security;

-- Prototype-wide open policy (matches the rest of this project's setup).
drop policy if exists "lesson_presets_all" on public.lesson_presets;
create policy "lesson_presets_all" on public.lesson_presets
  for all using (true) with check (true);

grant all on public.lesson_presets to anon, authenticated;

-- Refresh PostgREST's schema cache so the app sees the table immediately.
notify pgrst, 'reload schema';
