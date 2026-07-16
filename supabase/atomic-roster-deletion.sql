-- Big Dog Math: atomic, server-only roster deletion.
--
-- Run this additive migration in the Supabase SQL Editor before deploying the
-- matching teacher roster API. A roster row is deleted only when the row name
-- still matches and every attribution-bearing dependency is empty in the same
-- transaction. Browser roles cannot execute either function.

begin;

create or replace function public.bdm_delete_unused_roster_student(
  p_student_id uuid,
  p_expected_name text
)
returns table (
  outcome text,
  deleted_id uuid,
  deleted_name text,
  dependency_counts jsonb
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_student public.students%rowtype;
  v_dependency record;
  v_count bigint;
  v_dependencies jsonb := '{}'::jsonb;
begin
  select s.*
  into v_student
  from public.students s
  where s.id = p_student_id
  for update;

  if not found then
    return query select 'not_found'::text, null::uuid, null::text, '{}'::jsonb;
    return;
  end if;

  if v_student.full_name is distinct from p_expected_name then
    return query select 'name_conflict'::text, v_student.id, v_student.full_name, '{}'::jsonb;
    return;
  end if;

  if v_student.auth_user_id is not null then
    v_dependencies := v_dependencies || jsonb_build_object('linked identity', 1);
  end if;

  -- recommendations.student_ids is an attribution array rather than a foreign
  -- key. Locking the table closes the insert/update race while it is checked.
  if to_regclass('public.recommendations') is not null then
    execute 'lock table public.recommendations in share row exclusive mode';
  end if;

  for v_dependency in
    select *
    from (values
      ('responses', 'student_id', 'responses', 'scalar'),
      ('mastery', 'student_id', 'mastery records', 'scalar'),
      ('mastery_history', 'student_id', 'mastery history', 'scalar'),
      ('iready_scores', 'student_id', 'i-Ready records', 'scalar'),
      ('session_joins', 'student_id', 'session joins', 'scalar'),
      ('poll_answers', 'student_id', 'poll answers', 'scalar'),
      ('challenge_attempts', 'student_id', 'challenge attempts', 'scalar'),
      ('checkpoint_results', 'student_id', 'checkpoint results', 'scalar'),
      ('practice_assignment_attempts', 'student_id', 'practice attempts', 'scalar'),
      ('exit_ticket_responses', 'student_id', 'exit-ticket responses', 'scalar'),
      ('abbie_questions', 'student_id', 'Abbie questions', 'scalar'),
      ('recommendations', 'student_ids', 'instructional recommendations', 'array')
    ) as dependencies(table_name, column_name, label, match_kind)
  loop
    if to_regclass(format('public.%I', v_dependency.table_name)) is null then
      continue;
    end if;

    if v_dependency.match_kind = 'array' then
      execute format(
        'select count(*) from public.%I where $1 = any(%I)',
        v_dependency.table_name,
        v_dependency.column_name
      ) into v_count using p_student_id;
    else
      execute format(
        'select count(*) from public.%I where %I = $1',
        v_dependency.table_name,
        v_dependency.column_name
      ) into v_count using p_student_id;
    end if;

    if v_count > 0 then
      v_dependencies := v_dependencies || jsonb_build_object(v_dependency.label, v_count);
    end if;
  end loop;

  if jsonb_object_length(v_dependencies) > 0 then
    return query select 'student_has_attribution'::text, v_student.id, v_student.full_name, v_dependencies;
    return;
  end if;

  delete from public.students
  where id = v_student.id;

  return query select 'deleted'::text, v_student.id, v_student.full_name, '{}'::jsonb;
exception
  when foreign_key_violation then
    return query select 'dependency_conflict'::text, v_student.id, v_student.full_name, v_dependencies;
end;
$$;

create or replace function public.bdm_delete_unused_roster_period(
  p_period_id uuid,
  p_expected_name text
)
returns table (
  outcome text,
  deleted_id uuid,
  deleted_name text,
  dependency_counts jsonb
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_period public.periods%rowtype;
  v_dependency record;
  v_count bigint;
  v_dependencies jsonb := '{}'::jsonb;
begin
  select p.*
  into v_period
  from public.periods p
  where p.id = p_period_id
  for update;

  if not found then
    return query select 'not_found'::text, null::uuid, null::text, '{}'::jsonb;
    return;
  end if;

  if v_period.name is distinct from p_expected_name then
    return query select 'name_conflict'::text, v_period.id, v_period.name, '{}'::jsonb;
    return;
  end if;

  for v_dependency in
    select *
    from (values
      ('students', 'period_id', 'students'),
      ('assignments', 'period_id', 'assignments'),
      ('sessions', 'period_id', 'class sessions'),
      ('period_summaries', 'period_id', 'period summaries'),
      ('practice_assignments', 'period_id', 'practice assignments'),
      ('exit_tickets', 'period_id', 'exit tickets'),
      ('checkpoint_runs', 'period_id', 'checkpoint runs'),
      ('recommendations', 'period_id', 'instructional recommendations')
    ) as dependencies(table_name, column_name, label)
  loop
    if to_regclass(format('public.%I', v_dependency.table_name)) is null then
      continue;
    end if;

    execute format(
      'select count(*) from public.%I where %I = $1',
      v_dependency.table_name,
      v_dependency.column_name
    ) into v_count using p_period_id;

    if v_count > 0 then
      v_dependencies := v_dependencies || jsonb_build_object(v_dependency.label, v_count);
    end if;
  end loop;

  if jsonb_object_length(v_dependencies) > 0 then
    return query select 'period_has_dependencies'::text, v_period.id, v_period.name, v_dependencies;
    return;
  end if;

  delete from public.periods
  where id = v_period.id;

  return query select 'deleted'::text, v_period.id, v_period.name, '{}'::jsonb;
exception
  when foreign_key_violation then
    return query select 'dependency_conflict'::text, v_period.id, v_period.name, v_dependencies;
end;
$$;

revoke all on function public.bdm_delete_unused_roster_student(uuid, text)
  from public, anon, authenticated;
grant execute on function public.bdm_delete_unused_roster_student(uuid, text)
  to service_role;

revoke all on function public.bdm_delete_unused_roster_period(uuid, text)
  from public, anon, authenticated;
grant execute on function public.bdm_delete_unused_roster_period(uuid, text)
  to service_role;

commit;

notify pgrst, 'reload schema';
