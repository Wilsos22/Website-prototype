-- Parent outreach: guardian contacts + a draft queue for concern/praise emails.
-- BOTH tables are SERVER-ONLY (they hold parent PII): RLS on, no policies,
-- revoked from anon/authenticated. Reached ONLY via the service-role
-- /api/outreach route (teacher-gated in middleware). Never expose these to the
-- browser anon client. Guardian emails intentionally live here, NOT on the
-- permissive `students` table, so the public anon key can never read them.

create table if not exists student_guardians (
  student_id  uuid primary key references students(id) on delete cascade,
  email       text,
  name        text,
  updated_at  timestamptz not null default now()
);

create table if not exists parent_outreach (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references students(id) on delete cascade,
  kind        text not null,                  -- 'concern' | 'praise'
  to_email    text,
  to_name     text,
  subject     text not null,
  body        text not null,
  reason      text,                           -- why the student was surfaced
  status      text not null default 'draft',  -- 'draft' | 'sent' | 'dismissed'
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index if not exists parent_outreach_status_idx on parent_outreach(status, created_at);

do $$
begin
  execute 'revoke all on table public.student_guardians from anon, authenticated';
  execute 'revoke all on table public.parent_outreach from anon, authenticated';
  execute 'alter table public.student_guardians enable row level security';
  execute 'alter table public.parent_outreach enable row level security';
end $$;

notify pgrst, 'reload schema';
