-- Big Dog Math: one warm-up completion receipt per student auth identity and class session.
-- Server routes are the only access path; browser roles receive no table privileges.
-- Prerequisite: student-admission-override.sql, which defines
-- public.bdm_admit_student_join_request.

begin;

create table if not exists public.student_warmup_sessions (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  verification_token uuid not null default gen_random_uuid(),
  warmup_resource_key text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (auth_user_id, session_id)
);

-- These steps also upgrade an environment where an earlier pilot draft created
-- the receipt table before verification tokens were introduced.
alter table public.student_warmup_sessions
  add column if not exists verification_token uuid,
  add column if not exists warmup_resource_key text;

update public.student_warmup_sessions
set verification_token = gen_random_uuid()
where verification_token is null;

alter table public.student_warmup_sessions
  alter column verification_token set default gen_random_uuid(),
  alter column verification_token set not null;

create unique index if not exists student_warmup_sessions_verification_token_idx
  on public.student_warmup_sessions(verification_token);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'student_warmup_sessions_completion_order'
      and conrelid = 'public.student_warmup_sessions'::regclass
  ) then
    alter table public.student_warmup_sessions
      add constraint student_warmup_sessions_completion_order
      check (completed_at is null or completed_at >= started_at)
      not valid;
  end if;
end $$;

alter table public.student_warmup_sessions
  validate constraint student_warmup_sessions_completion_order;

create index if not exists student_warmup_sessions_pending_idx
  on public.student_warmup_sessions(auth_user_id, started_at desc)
  where completed_at is null;

create index if not exists student_warmup_sessions_session_idx
  on public.student_warmup_sessions(session_id);

alter table public.student_warmup_sessions enable row level security;

revoke all on table public.student_warmup_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.student_warmup_sessions to service_role;

create or replace function public.bdm_canonical_google_form_resource(p_url text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select 'https://docs.google.com' || matched[1] || '/viewform'
  from regexp_match(
    btrim(p_url),
    '^https://docs\.google\.com(/forms/d/(e/)?[^/?#]+)/(viewform|formResponse)/?([?#].*)?$',
    'i'
  ) as matched;
$$;

revoke all on function public.bdm_canonical_google_form_resource(text)
  from public, anon, authenticated;
grant execute on function public.bdm_canonical_google_form_resource(text)
  to service_role;

-- Consume a Form receipt and claim the roster identity in one transaction.
-- The row lock makes the token strictly one-time even if duplicate triggers
-- arrive together.
drop function if exists public.bdm_complete_warmup_identity(
  uuid, uuid, text, uuid, uuid, uuid
);

create or replace function public.bdm_complete_warmup_identity(
  p_verification_token uuid,
  p_session_id uuid,
  p_warmup_resource_key text,
  p_student_id uuid,
  p_student_email text,
  p_auth_user_id uuid,
  p_expected_student_auth_user_id uuid
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_receipt public.student_warmup_sessions%rowtype;
  v_live_flow jsonb;
  v_current_warmup_url text;
  v_session_period_id uuid;
  v_student_period_id uuid;
  v_student_email text;
  v_student_auth_user_id uuid;
begin
  -- Match the teacher-recovery lock order: session before receipt. This avoids
  -- a cycle when a Form submit and explicit teacher recovery arrive together.
  select live_flow, period_id
  into v_live_flow, v_session_period_id
  from public.sessions
  where id = p_session_id and status = 'open'
  for share;

  if not found then
    return 'session_not_open';
  end if;

  select receipt.*
  into v_receipt
  from public.student_warmup_sessions as receipt
  where receipt.verification_token = p_verification_token
    and receipt.session_id = p_session_id
    and receipt.auth_user_id = p_auth_user_id
  for update;

  if not found then return 'receipt_not_found'; end if;
  if v_receipt.completed_at is not null then return 'receipt_already_completed'; end if;
  if v_receipt.warmup_resource_key is null
    or v_receipt.warmup_resource_key <> p_warmup_resource_key then
    return 'warmup_resource_mismatch';
  end if;

  if v_live_flow -> 'state' ->> 'id' = 'warmup'
    and coalesce(v_live_flow -> 'resource' ->> 'url', '') <> '' then
    v_current_warmup_url := v_live_flow -> 'resource' ->> 'url';
  else
    select step ->> 'resourceUrl'
    into v_current_warmup_url
    from jsonb_array_elements(coalesce(v_live_flow -> 'sequence' -> 'steps', '[]'::jsonb)) as step
    where step ->> 'stateId' = 'warmup'
    limit 1;
  end if;

  if public.bdm_canonical_google_form_resource(v_current_warmup_url)
    is distinct from p_warmup_resource_key then
    return 'warmup_resource_mismatch';
  end if;

  select period_id, email, auth_user_id
  into v_student_period_id, v_student_email, v_student_auth_user_id
  from public.students
  where id = p_student_id
  for update;

  if not found then
    return 'roster_mismatch';
  end if;
  if v_student_period_id is distinct from v_session_period_id
    or lower(btrim(coalesce(v_student_email, ''))) <> lower(btrim(coalesce(p_student_email, ''))) then
    return 'roster_mismatch';
  end if;
  if v_student_auth_user_id is distinct from p_expected_student_auth_user_id then
    return 'claim_conflict';
  end if;

  update public.students
  set auth_user_id = p_auth_user_id,
      auth_claimed_at = now()
  where id = p_student_id
    and period_id = v_session_period_id
    and lower(btrim(email)) = lower(btrim(p_student_email))
    and auth_user_id is not distinct from p_expected_student_auth_user_id;

  if not found then return 'claim_conflict'; end if;

  update public.student_warmup_sessions
  set completed_at = now()
  where verification_token = p_verification_token;

  return 'completed';
end;
$$;

revoke all on function public.bdm_complete_warmup_identity(
  uuid, uuid, text, uuid, text, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.bdm_complete_warmup_identity(
  uuid, uuid, text, uuid, text, uuid, uuid
) to service_role;

-- The join boundary rechecks the completed receipt against the session's
-- current Form while holding the session row. A sleeping or backgrounded
-- Chromebook therefore cannot join from a stale completed receipt.
create or replace function public.bdm_complete_verified_student_join_with_warmup(
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
  v_receipt public.student_warmup_sessions%rowtype;
  v_live_flow jsonb;
  v_current_warmup_url text;
begin
  -- The base join resolver also locks this session for update. Taking the same
  -- lock first serializes a class of simultaneous joins without lock upgrades.
  select live_flow
  into v_live_flow
  from public.sessions
  where id = p_session_id and status = 'open'
  for update;

  if not found then
    return query select 'session_not_open'::text, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  select receipt.*
  into v_receipt
  from public.student_warmup_sessions as receipt
  where receipt.auth_user_id = p_auth_user_id
    and receipt.session_id = p_session_id
  for share;

  if not found then
    return query select 'warmup_not_complete'::text, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;
  if v_receipt.completed_at is null then
    return query select 'warmup_not_complete'::text, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if v_live_flow -> 'state' ->> 'id' = 'warmup'
    and coalesce(v_live_flow -> 'resource' ->> 'url', '') <> '' then
    v_current_warmup_url := v_live_flow -> 'resource' ->> 'url';
  else
    select step ->> 'resourceUrl'
    into v_current_warmup_url
    from jsonb_array_elements(coalesce(v_live_flow -> 'sequence' -> 'steps', '[]'::jsonb)) as step
    where step ->> 'stateId' = 'warmup'
    limit 1;
  end if;

  if v_receipt.warmup_resource_key is null
    or public.bdm_canonical_google_form_resource(v_current_warmup_url)
      is distinct from v_receipt.warmup_resource_key then
    return query select 'warmup_resource_mismatch'::text, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  return query
  select
    result.outcome,
    result.join_id,
    result.resolved_student_id,
    result.resolved_display_name,
    result.resolved_joined_at
  from public.bdm_complete_verified_student_join(
    p_session_id,
    p_student_id,
    p_auth_user_id,
    p_display_name
  ) as result;
end;
$$;

revoke all on function public.bdm_complete_verified_student_join_with_warmup(
  uuid, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.bdm_complete_verified_student_join_with_warmup(
  uuid, uuid, uuid, text
) to service_role;

-- Keep the explicit teacher recovery atomic. If the receipt cannot be
-- completed, raising inside this wrapper rolls back the identity and attendance
-- changes performed by the existing admission function in the same statement.
create or replace function public.bdm_admit_student_join_request_with_warmup(
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
  v_outcome text;
  v_join_id uuid;
  v_student_id uuid;
  v_display_name text;
  v_joined_at timestamptz;
begin
  select
    result.outcome,
    result.join_id,
    result.resolved_student_id,
    result.resolved_display_name,
    result.resolved_joined_at
  into
    v_outcome,
    v_join_id,
    v_student_id,
    v_display_name,
    v_joined_at
  from public.bdm_admit_student_join_request(
    p_session_id,
    p_request_code,
    p_student_id,
    p_student_email,
    p_auth_user_id,
    p_expected_student_auth_user_id,
    p_display_name
  ) as result;

  if v_outcome = 'admitted' then
    update public.student_warmup_sessions
    set completed_at = coalesce(completed_at, now())
    where auth_user_id = p_auth_user_id
      and session_id = p_session_id;

    if not found then
      raise exception 'warm-up receipt missing for teacher admission'
        using errcode = 'P0001';
    end if;
  end if;

  return query
  select v_outcome, v_join_id, v_student_id, v_display_name, v_joined_at;
end;
$$;

revoke all on function public.bdm_admit_student_join_request_with_warmup(
  uuid, text, uuid, text, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.bdm_admit_student_join_request_with_warmup(
  uuid, text, uuid, text, uuid, uuid, text
) to service_role;

commit;

notify pgrst, 'reload schema';
