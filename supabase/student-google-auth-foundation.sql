-- Big Dog Math: additive student identity link.
-- Safe to run before Google Auth is enabled. It does not change existing RLS.

alter table public.students
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists auth_claimed_at timestamptz;

create unique index if not exists students_auth_user_idx
  on public.students(auth_user_id)
  where auth_user_id is not null;

create unique index if not exists students_normalized_email_idx
  on public.students(lower(btrim(email)))
  where email is not null and btrim(email) <> '';

create unique index if not exists session_joins_session_student_idx
  on public.session_joins(session_id, student_id);

notify pgrst, 'reload schema';
