-- Latest teacher-only remote command for the active classroom session.
-- Additive and safe to run more than once.

alter table public.sessions add column if not exists remote_command jsonb;

notify pgrst, 'reload schema';
