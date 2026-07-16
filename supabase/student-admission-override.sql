-- Big Dog Math: teacher-approved warm-up admission override.
--
-- Run this additive migration in the Supabase SQL Editor before deploying the
-- matching API routes. Pending Chromebooks stay unidentified until the teacher
-- chooses a roster email. Browser roles cannot create, read, or change pending
-- rows; all writes use the server-side service role.

begin;

alter table public.session_joins
  add column if not exists auth_user_id uuid,
  add column if not exists request_code text;

alter table public.session_joins
  drop constraint if exists session_joins_auth_user_id_fkey;

alter table public.session_joins
  add constraint session_joins_auth_user_id_fkey
  foreign key (auth_user_id) references auth.users(id) on delete set null;

create unique index if not exists session_joins_session_auth_user_idx
  on public.session_joins(session_id, auth_user_id)
  where auth_user_id is not null;

create index if not exists session_joins_auth_user_idx
  on public.session_joins(auth_user_id)
  where auth_user_id is not null;

create unique index if not exists session_joins_session_request_code_idx
  on public.session_joins(session_id, request_code)
  where request_code is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'session_joins_pending_shape_check'
      and conrelid = 'public.session_joins'::regclass
  ) then
    alter table public.session_joins
      add constraint session_joins_pending_shape_check
      check (
        student_id is not null
        or (
          auth_user_id is not null
          and request_code ~ '^[A-HJ-NP-Z2-9]{6}$'
        )
      ) not valid;
  end if;
end $$;

alter table public.session_joins enable row level security;
drop policy if exists "prototype_all" on public.session_joins;
revoke insert, update, delete on table public.session_joins from anon, authenticated;
grant select, insert, update, delete on table public.session_joins to service_role;

create or replace function public.bdm_cleanup_pending_joins_before_auth_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.session_joins
  where auth_user_id = old.id
    and student_id is null;
  return old;
end;
$$;

revoke all on function public.bdm_cleanup_pending_joins_before_auth_delete()
  from public, anon, authenticated;

drop trigger if exists bdm_cleanup_pending_joins_before_auth_delete on auth.users;
create trigger bdm_cleanup_pending_joins_before_auth_delete
  before delete on auth.users
  for each row execute function public.bdm_cleanup_pending_joins_before_auth_delete();

create or replace function public.bdm_complete_verified_student_join(
  p_session_id uuid,
  p_student_id uuid,
  p_auth_user_id uuid,
  p_display_name text
)
returns table (
  outcome text,
  join_id uuid,
  resolved_student_id uuid,
  resolved_display_name text,
  resolved_joined_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.sessions%rowtype;
  v_student public.students%rowtype;
  v_join public.session_joins%rowtype;
  v_pending public.session_joins%rowtype;
begin
  select s.*
  into v_session
  from public.sessions s
  where s.id = p_session_id
  for update;

  if not found or v_session.status <> 'open' then
    return query select 'session_not_open'::text, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  select s.*
  into v_student
  from public.students s
  where s.id = p_student_id
  for update;

  if not found
    or v_student.period_id <> v_session.period_id
    or v_student.auth_user_id is distinct from p_auth_user_id then
    return query select 'identity_conflict'::text, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  select j.*
  into v_join
  from public.session_joins j
  where j.session_id = p_session_id
    and j.student_id = p_student_id
  for update;

  select j.*
  into v_pending
  from public.session_joins j
  where j.session_id = p_session_id
    and j.auth_user_id = p_auth_user_id
    and j.student_id is null
  for update;

  if v_join.id is not null then
    if v_pending.id is not null and v_pending.id <> v_join.id then
      delete from public.session_joins where id = v_pending.id;
    end if;

    update public.session_joins
    set auth_user_id = p_auth_user_id,
        display_name = p_display_name,
        request_code = null
    where id = v_join.id
    returning * into v_join;
  elsif v_pending.id is not null then
    update public.session_joins
    set student_id = p_student_id,
        display_name = p_display_name,
        request_code = null
    where id = v_pending.id
    returning * into v_join;
  else
    insert into public.session_joins (
      session_id,
      student_id,
      auth_user_id,
      display_name,
      request_code
    ) values (
      p_session_id,
      p_student_id,
      p_auth_user_id,
      p_display_name,
      null
    )
    returning * into v_join;
  end if;

  return query
  select
    'joined'::text,
    v_join.id,
    v_join.student_id,
    v_join.display_name,
    v_join.joined_at;
exception
  when unique_violation then
    return query select 'join_conflict'::text, null::uuid, null::uuid, null::text, null::timestamptz;
end;
$$;

create or replace function public.bdm_admit_student_join_request(
  p_session_id uuid,
  p_request_code text,
  p_student_id uuid,
  p_student_email text,
  p_auth_user_id uuid,
  p_expected_student_auth_user_id uuid,
  p_display_name text
)
returns table (
  outcome text,
  join_id uuid,
  resolved_student_id uuid,
  resolved_display_name text,
  resolved_joined_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.sessions%rowtype;
  v_student public.students%rowtype;
  v_join public.session_joins%rowtype;
  v_pending public.session_joins%rowtype;
  v_auth_student_id uuid;
begin
  select s.*
  into v_session
  from public.sessions s
  where s.id = p_session_id
  for update;

  if not found or v_session.status <> 'open' then
    return query select 'session_not_open'::text, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  select s.*
  into v_student
  from public.students s
  where s.id = p_student_id
  for update;

  if not found
    or v_student.period_id <> v_session.period_id
    or lower(btrim(coalesce(v_student.email, ''))) <> lower(btrim(p_student_email)) then
    return query select 'roster_mismatch'::text, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  select j.*
  into v_join
  from public.session_joins j
  where j.session_id = p_session_id
    and j.student_id = p_student_id
  for update;

  select j.*
  into v_pending
  from public.session_joins j
  where j.session_id = p_session_id
    and j.request_code = upper(btrim(p_request_code))
    and j.student_id is null
  for update;

  if v_pending.id is null then
    return query select 'request_not_found'::text, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if v_pending.auth_user_id is distinct from p_auth_user_id then
    return query select 'request_conflict'::text, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if v_join.id is not null and v_join.id <> v_pending.id then
    return query select 'student_already_joined'::text, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if v_student.auth_user_id is distinct from p_expected_student_auth_user_id then
    return query select 'identity_conflict'::text, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  select s.id
  into v_auth_student_id
  from public.students s
  where s.auth_user_id = p_auth_user_id
    and s.id <> p_student_id
  for update;

  if v_auth_student_id is not null then
    return query select 'auth_conflict'::text, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  update public.students
  set auth_user_id = p_auth_user_id,
      auth_claimed_at = now()
  where id = p_student_id;

  update public.session_joins
  set student_id = p_student_id,
      display_name = p_display_name,
      request_code = null
  where id = v_pending.id
  returning * into v_join;

  return query
  select
    'admitted'::text,
    v_join.id,
    v_join.student_id,
    v_join.display_name,
    v_join.joined_at;
exception
  when unique_violation then
    return query select 'join_conflict'::text, null::uuid, null::uuid, null::text, null::timestamptz;
end;
$$;

revoke all on function public.bdm_complete_verified_student_join(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.bdm_complete_verified_student_join(uuid, uuid, uuid, text)
  to service_role;

revoke all on function public.bdm_admit_student_join_request(uuid, text, uuid, text, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.bdm_admit_student_join_request(uuid, text, uuid, text, uuid, uuid, text)
  to service_role;

commit;

notify pgrst, 'reload schema';
