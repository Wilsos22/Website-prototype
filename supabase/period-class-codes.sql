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
-- Default codes come from strict "Period N" names only (DOG2 for Period 2,
-- and so on). Deriving from sort_order double-assigned a code the first time
-- this ran, because test periods share sort_order values. Test/utility
-- periods get no code; set one manually when wanted:
--   update periods set class_code = 'MOCK' where name = 'BDM Mock Class';
--
-- Hand-run in the Supabase SQL Editor. Idempotent.

begin;

alter table periods add column if not exists class_code text;

update periods
set class_code = 'DOG' || substring(name from '^Period ([0-9]+)$')
where class_code is null
  and name ~ '^Period [0-9]+$';

create unique index if not exists periods_class_code_idx
  on periods (upper(class_code))
  where class_code is not null;

alter table sessions drop constraint if exists sessions_join_code_key;

create unique index if not exists sessions_open_join_code_idx
  on sessions (join_code)
  where status = 'open';

commit;

notify pgrst, 'reload schema';
