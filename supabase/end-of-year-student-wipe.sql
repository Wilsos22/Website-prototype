-- End-of-year student data wipe
--
-- Removes every student record and every row of student work from the site.
-- Keeps everything that is NOT student data: periods (and their permanent
-- class codes), sessions, lesson presets, question banks, BRUH/Grudge sets,
-- standards, misconception vocabulary, and mastery_config.
--
-- ORDER MATTERS - clear the Notion roster FIRST.
-- /api/roster/sync runs daily at 13:00 UTC (6am Pacific) and is an UPSERT
-- that never deletes: any student still listed in the Notion roster database
-- is recreated here the next morning, name and district email included.
-- Running this script while last year's roster is still in Notion silently
-- undoes itself overnight.
--
-- Deletes are explicit rather than relying on cascade: several child tables
-- use ON DELETE SET NULL, which would strand rows that still carry
-- display_name - real names left behind after the students table was empty.

begin;

-- Audit, routing, and identity receipts
delete from security_audit_events;
delete from city_route_assignments;
delete from recommendations;
delete from student_warmup_sessions;

-- Student work and participation
delete from abbie_questions;
delete from challenge_attempts;
delete from checkpoint_results;
delete from exit_ticket_responses;
delete from poll_answers;
delete from practice_assignment_attempts;
delete from responses;
delete from session_joins;

-- Game participation (sets and questions are kept)
delete from bruh_answers;
delete from bruh_players;
delete from grudge_answers;
delete from grudge_players;

-- Proficiency spine
delete from iready_scores;
delete from mastery_history;
delete from mastery;

-- The roster itself, last
delete from students;

commit;

-- Verification: every count below must be 0.
select 'students' as table_name, count(*) as remaining from students
union all select 'responses', count(*) from responses
union all select 'mastery', count(*) from mastery
union all select 'mastery_history', count(*) from mastery_history
union all select 'iready_scores', count(*) from iready_scores
union all select 'checkpoint_results', count(*) from checkpoint_results
union all select 'exit_ticket_responses', count(*) from exit_ticket_responses
union all select 'poll_answers', count(*) from poll_answers
union all select 'challenge_attempts', count(*) from challenge_attempts
union all select 'practice_assignment_attempts', count(*) from practice_assignment_attempts
union all select 'session_joins', count(*) from session_joins
union all select 'student_warmup_sessions', count(*) from student_warmup_sessions
union all select 'security_audit_events', count(*) from security_audit_events
union all select 'city_route_assignments', count(*) from city_route_assignments
union all select 'abbie_questions', count(*) from abbie_questions
union all select 'bruh_players', count(*) from bruh_players
union all select 'bruh_answers', count(*) from bruh_answers
union all select 'grudge_players', count(*) from grudge_players
union all select 'grudge_answers', count(*) from grudge_answers
order by 1;

-- Optional: the anonymous Supabase auth accounts students signed in with.
-- They hold no email or name, so they are not PII, but clearing them keeps
-- the auth list honest. Run from the Supabase dashboard (Authentication >
-- Users) or:
--   delete from auth.users where email is null;
