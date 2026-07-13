-- Emergency rollback for the student-data security cutover.
--
-- This intentionally reopens the prototype browser permissions so the legacy
-- UI can operate. Use only while NEXT_PUBLIC_SECURE_STUDENT_DATA is false and
-- only long enough to correct a failed cutover. It preserves identity columns,
-- indexes, audit records, and student links so no evidence is destroyed.

begin;

do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'periods', 'students', 'problems', 'assignments', 'assignment_problems',
    'sessions', 'responses', 'period_summaries', 'session_joins', 'polls',
    'poll_answers', 'challenges', 'challenge_attempts', 'checkpoint_runs',
    'checkpoint_results', 'practice_assignments', 'practice_assignment_attempts',
    'exit_tickets', 'exit_ticket_responses', 'abbie_questions'
  ]
  loop
    if to_regclass(format('public.%I', t)) is not null then
      for p in
        select policyname
        from pg_policies
        where schemaname = 'public' and tablename = t
      loop
        execute format('drop policy if exists %I on public.%I', p.policyname, t);
      end loop;
      execute format(
        'create policy prototype_all on public.%I for all to anon, authenticated using (true) with check (true)',
        t
      );
      execute format('grant all on table public.%I to anon, authenticated', t);
    end if;
  end loop;
end $$;

do $$
declare
  p record;
begin
  if to_regclass('public.lesson_presets') is not null then
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'lesson_presets'
    loop execute format('drop policy if exists %I on public.lesson_presets', p.policyname); end loop;
    create policy lesson_presets_all on public.lesson_presets for all using (true) with check (true);
    grant all on table public.lesson_presets to anon, authenticated;
  end if;

  if to_regclass('public.nb_scores') is not null then
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'nb_scores'
    loop execute format('drop policy if exists %I on public.nb_scores', p.policyname); end loop;
    create policy nb_scores_select on public.nb_scores for select to anon, authenticated using (true);
    create policy nb_scores_insert on public.nb_scores for insert to anon, authenticated
      with check (
        char_length(class_code) between 1 and 24
        and char_length(initials) between 1 and 3
        and score between 0 and 100000000
        and level between 1 and 999
        and mode in ('classic', 'build')
      );
    grant all on table public.nb_scores to anon, authenticated;
  end if;
end $$;

-- These four tables were read-only before the cutover rather than fully open.
do $$
declare
  t text;
  p record;
begin
  foreach t in array array['standards', 'standard_prereqs', 'misconceptions', 'mastery_config']
  loop
    if to_regclass(format('public.%I', t)) is not null then
      for p in select policyname from pg_policies where schemaname = 'public' and tablename = t
      loop
        execute format('drop policy if exists %I on public.%I', p.policyname, t);
      end loop;
      execute format('create policy read_only on public.%I for select to anon, authenticated using (true)', t);
      execute format('grant all on table public.%I to anon, authenticated', t);
    end if;
  end loop;
end $$;

revoke all on table public.security_audit_events from anon, authenticated;

update storage.buckets
set public = true,
    file_size_limit = null,
    allowed_mime_types = null
where id = 'boards';

drop policy if exists "boards read" on storage.objects;
drop policy if exists "boards upload" on storage.objects;
create policy "boards read" on storage.objects for select to anon using (bucket_id = 'boards');
create policy "boards upload" on storage.objects for insert to anon with check (bucket_id = 'boards');

notify pgrst, 'reload schema';

commit;
