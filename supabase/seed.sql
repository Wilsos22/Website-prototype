-- Big Dog Math — SAMPLE test data (safe to delete later)
-- Run this AFTER schema.sql, in Supabase: SQL Editor → New query → paste → Run.
-- It creates one fake period, a fake roster, and a few sample fraction-bar
-- problems so you have something to try a live session with.
-- To wipe this test data later, see the very bottom of this file.

-- One fake class period
insert into periods (name, sort_order)
values ('Period 1 — TEST', 1);

-- A fake roster for that period (totally made-up names)
insert into students (period_id, full_name)
select p.id, name
from periods p,
     (values
        ('Ada Lovelace'),
        ('Blake Rivera'),
        ('Carmen Soto'),
        ('Diego Martin'),
        ('Evelyn Tran'),
        ('Frank Okafor'),
        ('Grace Kim'),
        ('Hassan Ali')
     ) as roster(name)
where p.name = 'Period 1 — TEST';

-- A few sample problems on the fraction-bars manipulative (with answer key)
insert into problems (prompt, correct_answer, manipulative)
values
  ('Build 1/2 + 1/4. What is the sum?', '3/4', 'fraction_bars'),
  ('Build 2/3 + 1/6. What is the sum?', '5/6', 'fraction_bars'),
  ('Show 3/4 - 1/4. What is left?', '1/2', 'fraction_bars'),
  ('Build two fractions equal to 1/2.', 'e.g. 2/4, 3/6', 'fraction_bars');

-- ── To remove this test data later, run these three lines: ───────────────────
-- delete from problems where manipulative = 'fraction_bars';
-- delete from students  where period_id in (select id from periods where name = 'Period 1 — TEST');
-- delete from periods   where name = 'Period 1 — TEST';
