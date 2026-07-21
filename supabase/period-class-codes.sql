-- Instant warm-up access: stable per-period class codes.
--
-- Students type one permanent code all year. If no session is open yet, the
-- first student's code entry auto-creates the day's session server-side
-- (join_code = the class code), so the warm-up opens before the teacher has
-- touched anything. The teacher's /session page later finds and inherits that
-- open session; the receipt/verification chain is unchanged because a real
-- session row exists from the first moment.
--
-- Also frees join codes for reuse across days: the old table-wide UNIQUE on
-- sessions.join_code meant yesterday's closed session held the code forever.
-- Uniqueness now applies only among OPEN sessions, which is what code lookup
-- actually needs.
--
-- Hand-run in the Supabase SQL Editor. Idempotent.

begin;

alter table periods add column if not exists class_code text;

create unique index if not exists periods_class_code_idx
  on periods (upper(class_code))
  where class_code is not null;

-- Default codes so the feature works immediately; rename anytime with
-- update periods set class_code = 'YOURCODE' where name = 'Period 1';
update periods
set class_code = 'DOG' || sort_order::text
where class_code is null;

alter table sessions drop constraint if exists sessions_join_code_key;

create unique index if not exists sessions_open_join_code_idx
  on sessions (join_code)
  where status = 'open';

commit;

notify pgrst, 'reload schema';
