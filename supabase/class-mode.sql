-- Big Dog Math — Class Mode (sync student screens to the teacher).
-- Run once in Supabase (SQL Editor → New query → paste → Run).
-- Adds a "broadcast" field to sessions: when set to a route (e.g. '/lesson'),
-- joined students' screens follow it. null or 'free' = students browse freely.

alter table public.sessions add column if not exists broadcast text;

-- Read-only classroom state snapshot for the Live Class Flow student screen.
-- The teacher control panel writes this only while broadcast = 'live-flow'.
alter table public.sessions add column if not exists live_flow jsonb;

-- Refresh Supabase/PostgREST's schema cache so the web app can see live_flow
-- immediately after this migration runs.
notify pgrst, 'reload schema';
