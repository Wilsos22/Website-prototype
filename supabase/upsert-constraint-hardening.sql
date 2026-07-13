-- PostgREST upsert targets must be backed by real UNIQUE constraints.
-- The older partial indexes enforced non-null uniqueness in Postgres, but
-- PostgREST could not resolve them for on_conflict requests.

alter table public.responses
  add constraint responses_dedupe_key_unique unique (dedupe_key);

alter table public.checkpoint_results
  add constraint checkpoint_results_run_student_unique unique (run_id, student_id);

alter table public.exit_ticket_responses
  add constraint exit_ticket_responses_ticket_student_unique unique (exit_ticket_id, student_id);
