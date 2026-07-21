-- Multiple Choice + Explain: students tap one of the authored choices AND
-- type a short written explanation. The choice stays in poll_answers.answer
-- (so tallies, correctness checks, and City Routes exact-matching are
-- untouched); the explanation lives beside it in this new nullable column.
--
-- Hand-run in the Supabase SQL Editor, like every migration in this folder.
-- Idempotent: safe to run more than once.
--
-- RLS group: poll_answers is already in the permissive prototype group;
-- adding a column changes no policies.

alter table poll_answers add column if not exists explanation text;

notify pgrst, 'reload schema';
