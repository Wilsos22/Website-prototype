-- Connect live questions and Fist-to-Five checks to their Notion lesson step.
-- Additive and safe to run more than once.

alter table public.polls add column if not exists lesson_code text;
alter table public.polls add column if not exists notion_lesson_id text;
alter table public.polls add column if not exists notion_step_id text;
alter table public.polls add column if not exists standard_id text;
alter table public.polls add column if not exists correct_answer text;

create index if not exists polls_lesson_code_idx on public.polls(lesson_code);
create index if not exists polls_notion_step_idx on public.polls(notion_step_id);

grant select, insert, update on table public.polls to anon, authenticated;
grant select, insert on table public.poll_answers to anon, authenticated;

notify pgrst, 'reload schema';
