-- Big Dog Math: least-privilege student data boundary.
--
-- DO NOT run this file until the student and teacher API cutover checklist in
-- docs/student-data-security.md is complete. This migration intentionally
-- removes the permissive prototype policies and will block legacy browser
-- writes that have not moved behind an authenticated API route.

begin;

alter table public.students
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists auth_claimed_at timestamptz,
  add column if not exists email_normalized text
    generated always as (lower(btrim(email))) stored;

create unique index if not exists students_auth_user_idx
  on public.students(auth_user_id)
  where auth_user_id is not null;

create unique index if not exists students_normalized_email_idx
  on public.students(email_normalized)
  where email_normalized is not null and email_normalized <> '';

create unique index if not exists session_joins_session_student_idx
  on public.session_joins(session_id, student_id)
  where student_id is not null;

create unique index if not exists poll_answers_poll_student_idx
  on public.poll_answers(poll_id, student_id)
  where student_id is not null;

create unique index if not exists checkpoint_results_run_student_idx
  on public.checkpoint_results(run_id, student_id)
  where student_id is not null;

create unique index if not exists exit_ticket_responses_ticket_student_idx
  on public.exit_ticket_responses(exit_ticket_id, student_id)
  where student_id is not null;

create table if not exists public.security_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  outcome text not null,
  auth_user_id uuid,
  student_id uuid references public.students(id) on delete set null,
  session_id uuid references public.sessions(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists security_audit_events_created_idx
  on public.security_audit_events(created_at desc);

alter table public.security_audit_events enable row level security;
revoke all on table public.security_audit_events from anon, authenticated;
grant select, insert on table public.security_audit_events to service_role;

-- Worked-board snapshots may contain classroom writing. Keep the bucket private
-- and route uploads/downloads through authenticated server APIs.
update storage.buckets
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/png']::text[]
where id = 'boards';

drop policy if exists "boards read" on storage.objects;
drop policy if exists "boards upload" on storage.objects;

-- Remove every prototype policy before installing explicit read policies.
do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'periods',
    'students',
    'problems',
    'assignments',
    'assignment_problems',
    'sessions',
    'responses',
    'period_summaries',
    'session_joins',
    'polls',
    'poll_answers',
    'challenges',
    'challenge_attempts',
    'checkpoint_runs',
    'checkpoint_results',
    'practice_assignments',
    'practice_assignment_attempts',
    'exit_tickets',
    'exit_ticket_responses',
    'lesson_presets',
    'abbie_questions',
    'nb_scores',
    'iready_scores',
    'mastery',
    'mastery_history',
    'recommendations',
    'mastery_config',
    'standards',
    'standard_prereqs',
    'misconceptions'
  ]
  loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('alter table public.%I enable row level security', t);
      for p in
        select policyname
        from pg_policies
        where schemaname = 'public' and tablename = t
      loop
        execute format('drop policy if exists %I on public.%I', p.policyname, t);
      end loop;
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- Curriculum reference data is intentionally public read-only. Removing all
-- mutation grants keeps browser clients from changing standards or tags.
create policy public_read_standards
  on public.standards for select to anon, authenticated using (true);
grant select on public.standards to anon, authenticated;

create policy public_read_standard_prereqs
  on public.standard_prereqs for select to anon, authenticated using (true);
grant select on public.standard_prereqs to anon, authenticated;

create policy public_read_misconceptions
  on public.misconceptions for select to anon, authenticated using (true);
grant select on public.misconceptions to anon, authenticated;

-- Number Blaster keeps a public pseudonymous scoreboard, but its browser role
-- may only read and submit tightly bounded score rows.
create policy nb_scores_select
  on public.nb_scores for select to anon, authenticated using (true);
create policy nb_scores_insert
  on public.nb_scores for insert to anon, authenticated
  with check (
    char_length(class_code) between 1 and 24
    and char_length(initials) between 1 and 3
    and score between 0 and 100000000
    and level between 1 and 999
    and mode in ('classic', 'build')
  );
grant select, insert on public.nb_scores to anon, authenticated;

-- A student may see only the roster row bound to the current Supabase user.
drop policy if exists student_select_own_profile on public.students;
create policy student_select_own_profile
  on public.students
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and auth_user_id = (select auth.uid())
  );

grant select (id, period_id, full_name, email, auth_user_id, auth_claimed_at)
  on public.students to authenticated;

-- Class metadata is visible only for the signed-in student's own period.
drop policy if exists student_select_own_period on public.periods;
create policy student_select_own_period
  on public.periods
  for select
  to authenticated
  using (
    id in (
      select s.period_id
      from public.students s
      where s.auth_user_id = (select auth.uid())
    )
  );

grant select (id, name, sort_order) on public.periods to authenticated;

-- A session becomes readable only after the server has created the student's
-- verified join row. Join-code lookup itself is server-only.
drop policy if exists student_select_joined_session on public.sessions;
create policy student_select_joined_session
  on public.sessions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.session_joins j
      join public.students s on s.id = j.student_id
      where j.session_id = sessions.id
        and s.auth_user_id = (select auth.uid())
    )
  );

grant select (id, period_id, assignment_id, status, started_at, ended_at, broadcast, live_flow, abbie)
  on public.sessions to authenticated;

drop policy if exists student_select_own_join on public.session_joins;
create policy student_select_own_join
  on public.session_joins
  for select
  to authenticated
  using (
    student_id in (
      select s.id
      from public.students s
      where s.auth_user_id = (select auth.uid())
    )
  );

grant select (id, session_id, student_id, display_name, joined_at)
  on public.session_joins to authenticated;

-- Poll prompts are readable for joined sessions. The correct_answer column is
-- deliberately omitted from the column grant.
drop policy if exists student_select_joined_poll on public.polls;
create policy student_select_joined_poll
  on public.polls
  for select
  to authenticated
  using (
    session_id in (select s.id from public.sessions s)
  );

grant select (id, session_id, question, choices, kind, status, created_at,
  lesson_code, notion_lesson_id, notion_step_id, standard_id)
  on public.polls to authenticated;

drop policy if exists student_select_own_poll_answer on public.poll_answers;
create policy student_select_own_poll_answer
  on public.poll_answers
  for select
  to authenticated
  using (
    student_id in (
      select s.id
      from public.students s
      where s.auth_user_id = (select auth.uid())
    )
  );

grant select (id, poll_id, student_id, answer, created_at)
  on public.poll_answers to authenticated;

-- Student evidence is readable only by its owner. All inserts and updates go
-- through server routes that derive student_id from the verified token.
drop policy if exists student_select_own_response on public.responses;
create policy student_select_own_response
  on public.responses
  for select
  to authenticated
  using (
    student_id in (
      select s.id
      from public.students s
      where s.auth_user_id = (select auth.uid())
    )
  );

grant select on public.responses to authenticated;

drop policy if exists student_select_own_challenge_attempt on public.challenge_attempts;
create policy student_select_own_challenge_attempt
  on public.challenge_attempts
  for select
  to authenticated
  using (
    student_id in (
      select s.id from public.students s
      where s.auth_user_id = (select auth.uid())
    )
  );

grant select on public.challenge_attempts to authenticated;

drop policy if exists student_select_own_checkpoint_result on public.checkpoint_results;
create policy student_select_own_checkpoint_result
  on public.checkpoint_results
  for select
  to authenticated
  using (
    student_id in (
      select s.id from public.students s
      where s.auth_user_id = (select auth.uid())
    )
  );

grant select on public.checkpoint_results to authenticated;

drop policy if exists student_select_own_practice_attempt on public.practice_assignment_attempts;
create policy student_select_own_practice_attempt
  on public.practice_assignment_attempts
  for select
  to authenticated
  using (
    student_id in (
      select s.id from public.students s
      where s.auth_user_id = (select auth.uid())
    )
  );

grant select on public.practice_assignment_attempts to authenticated;

drop policy if exists student_select_own_exit_response on public.exit_ticket_responses;
create policy student_select_own_exit_response
  on public.exit_ticket_responses
  for select
  to authenticated
  using (
    student_id in (
      select s.id from public.students s
      where s.auth_user_id = (select auth.uid())
    )
  );

grant select on public.exit_ticket_responses to authenticated;

drop policy if exists student_select_own_abbie_question on public.abbie_questions;
create policy student_select_own_abbie_question
  on public.abbie_questions
  for select
  to authenticated
  using (
    student_id in (
      select s.id from public.students s
      where s.auth_user_id = (select auth.uid())
    )
  );

grant select (id, session_id, student_id, question, status, answer, created_at, answered_at)
  on public.abbie_questions to authenticated;

-- Read-only activity definitions. Answer keys stay server-only.
drop policy if exists student_select_own_assignments on public.assignments;
create policy student_select_own_assignments
  on public.assignments
  for select
  to authenticated
  using (
    period_id in (
      select s.period_id from public.students s
      where s.auth_user_id = (select auth.uid())
    )
  );

grant select (id, title, period_id, manipulative, mode, due_date, created_at)
  on public.assignments to authenticated;

drop policy if exists student_select_assignment_links on public.assignment_problems;
create policy student_select_assignment_links
  on public.assignment_problems
  for select
  to authenticated
  using (
    assignment_id in (select a.id from public.assignments a)
  );

grant select on public.assignment_problems to authenticated;

drop policy if exists student_select_assigned_problems on public.problems;
create policy student_select_assigned_problems
  on public.problems
  for select
  to authenticated
  using (
    id in (
      select ap.problem_id
      from public.assignment_problems ap
    )
  );

grant select (id, prompt, manipulative, created_at)
  on public.problems to authenticated;

drop policy if exists student_select_joined_challenge on public.challenges;
create policy student_select_joined_challenge
  on public.challenges
  for select
  to authenticated
  using (session_id in (select s.id from public.sessions s));

grant select on public.challenges to authenticated;

drop policy if exists student_select_available_practice on public.practice_assignments;
create policy student_select_available_practice
  on public.practice_assignments
  for select
  to authenticated
  using (
    status = 'open'
    and (
      period_id is null
      or period_id in (
        select s.period_id from public.students s
        where s.auth_user_id = (select auth.uid())
      )
    )
  );

grant select on public.practice_assignments to authenticated;

-- Checkpoint answer keys and misconception maps remain server-only. Students
-- receive only prompt metadata from an authenticated API route.
drop policy if exists student_select_joined_checkpoint on public.checkpoint_runs;
create policy student_select_joined_checkpoint
  on public.checkpoint_runs
  for select
  to authenticated
  using (
    (session_id is not null and session_id in (select s.id from public.sessions s))
    or period_id in (
      select s.period_id from public.students s
      where s.auth_user_id = (select auth.uid())
    )
  );

grant select (id, session_id, period_id, lesson_key, checkpoint_id, item_index,
  ccss, prompt, status, created_at, tier, is_sbac)
  on public.checkpoint_runs to authenticated;

drop policy if exists student_select_joined_exit_ticket on public.exit_tickets;
create policy student_select_joined_exit_ticket
  on public.exit_tickets
  for select
  to authenticated
  using (
    (session_id is not null and session_id in (select s.id from public.sessions s))
    or period_id in (
      select s.period_id from public.students s
      where s.auth_user_id = (select auth.uid())
    )
  );

grant select on public.exit_tickets to authenticated;

-- Teacher-authored records, summaries, leaderboards, answer keys, and all
-- mutation privileges remain server-only through the service-role client.

notify pgrst, 'reload schema';

commit;
