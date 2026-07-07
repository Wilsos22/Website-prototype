-- Big Dog Math — Abbie broadcast (pop Abbie's line onto student screens).
-- Run once in Supabase (SQL Editor → New query → paste → Run).
-- Adds an "abbie" field to sessions: when the teacher summons Abbie from the
-- control panel, her line is written here as { nonce, text, at }. Joined
-- students show a short-lived speech bubble on whatever screen they're on
-- (lesson, a tool, or Live Flow). Independent of "broadcast" mode, so she can
-- appear whenever. Cleared back to null a few seconds after she speaks.

alter table public.sessions add column if not exists abbie jsonb;

-- Refresh Supabase/PostgREST's schema cache so the web app can see the column
-- immediately after this migration runs.
notify pgrst, 'reload schema';
