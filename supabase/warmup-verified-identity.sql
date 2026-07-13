-- Big Dog Math: verified warm-up identity support.
-- The student/auth link columns are created by student-google-auth-foundation.sql.
-- This index makes each verified student answer a live question at most once.

create unique index if not exists poll_answers_poll_student_idx
  on public.poll_answers(poll_id, student_id);

notify pgrst, 'reload schema';
