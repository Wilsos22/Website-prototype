-- Big Dog Math — access policies (PROTOTYPE / permissive)
-- Run this in Supabase (SQL Editor → New query → paste → Run) ONLY IF the
-- roster page shows "permission denied" or no data saves.
--
-- ⚠️ This allows the app's public key to read & write these tables. That's fine
-- for setup and fake data. BEFORE you store real student info, we'll lock this
-- down behind a teacher login. (Ask me to "secure the database" when ready.)

do $$
declare t text;
begin
  foreach t in array array['periods','students','problems','assignments','assignment_problems','sessions','responses','period_summaries']
  loop
    execute format('grant all on table public.%I to anon, authenticated;', t);
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "prototype_all" on public.%I;', t);
    execute format('create policy "prototype_all" on public.%I for all to anon, authenticated using (true) with check (true);', t);
  end loop;
end $$;
