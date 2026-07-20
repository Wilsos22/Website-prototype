# Big Dog Math — Feature Roadmap

**The live tracker is in Notion:** "Big Dog Math — Feature Tracker"
(https://app.notion.com/p/f248b4164504427d896087e9b98aa2f4 · data source
`56ee55bb-c067-4613-8f3b-6d5810a82ced`). Steele checks things off there; agents
should update BOTH that database and this mirror when a feature ships.

Snapshot (2026-07-16):

## Live
Student home/join · Lesson page (Notion-fed) · Manipulative tools suite ·
Live polls (stuck-poll trap fixed) · Class mode broadcast · Challenge games ·
Today's boards · Control panel · Session controls · Rosters ·
**BRUH, the live team review game** (7/16 — ran in class and ran well. Replaces
the 46-slide Canva deck + buzzer receiver: the board itself shows who is in, who
is locked out and who is right. Teacher tool only; students arrive by broadcast.
`/teacher/bruh` setup with saved banks + 9 presets (270 questions, each
double-verified), `/teacher/bruh/board` projector, `/teacher/bruh/remote` iPad,
`/teacher/bruh/scoreboard` second screen, `/bruh` student. Server-authoritative
round clock and grading; units are required when the answer names one. Tables are
server-only. Deliberately does NOT feed the proficiency spine — it is about
teamwork and effort, not assessment) ·
**Weekly classroom display** (7/16 — separately launched projector display with
five weekday themes and four 20-second screens: Notion-fed learning intention,
success criteria, weekly topics with the current day highlighted, and the bell
schedule) ·
**Lesson Screen Studio** (7/15 — one private editing surface for every lesson
state with synchronized Main, Pace + Support, Student Chromebook, and iPad
Remote previews; guarded Notion saves with revision conflicts; no active-session
mutation) ·
**Notion roster sync** (needs `NOTION_ROSTER_DB_ID` + `CRON_SECRET` envs) ·
Teacher login (6-month device cookie; PIN gate removed) · Warm-up analytics ·
Checkpoint delivery · iPad ink → board · Abbie³ (voice + Stream Deck) ·
**Proficiency spine**: schema/seeds, EWMA engine (golden-tested 25/25),
mastery board + growth charts, /api/evidence, clustering + archetypes
(golden-tested 25/25), Right-now view w/ Notion Misconception Plans merge ·
**Checkpoint CSV upload** (/teacher/checkpoint-upload — tier + SBAC flags,
idempotent, auto-recompute) · **Tool evidence emitters** (EB/GEMS/CLT → mastery, session-gated) · Figma lesson-flow template ·
**Equation Builder redesign** (7/6 — auto-generated one-step equations incl.
÷ form, Albert Sans font one ink color, goal popup w/ sticky-red
wrong picks + Level Up! short answer, "Identify the variable" w/ named wrong
taps + persistent highlight, first-move question, inverse-drop animation, zero
pair "= 0" pop that vanishes, term auto-drops, student computes the other
side, inverse-ops key, level-switch fanfare, x on either side in Level Up!,
celebration + in-a-row counter; Regular/Level Up! naming here + GEMS) ·
**Growth view** (Right Now is now "Growth", linked from teacher nav + home;
/teacher/growth redirects) · **Claude-sharpened next moves** (7/6 —
/api/live/next-move + per-archetype "Sharpen this move" button on each Growth
cluster; archetype-aware, tool-grounded, reuses ANTHROPIC_API_KEY, template fallback) ·
**Abbie Console** (7/7 — summon Abbie³ from the control panel:
hold-to-talk mic (Web Speech STT + Stream Deck F8/?ptt=) for free-form live
conversation with running history, plus 6 quick-tap moods and a type/ask box;
context-aware (current state + lesson intention); teal projector bubble the
class sees + her real voice, voice/text-only toggle; /api/abbie takes a
`context` field; roast material loaded — Kendrick, tight pants, Legos, dog-park
small talk, etc.) ·
**Abbie on student screens** (7/7 — her line broadcasts to a dedicated
sessions.abbie column and pops a teal bubble on every joined student's screen,
any mode; global AbbieStudentBubble in the layout; needs abbie-broadcast.sql) ·
**Moderated Ask-Abbie queue** (7/7 — students type a question from an "Ask
Abbie" button; lands in the control-panel queue with a count badge; teacher
edits/approves and she answers the room, or dismisses; one pending per student;
abbie_questions table, needs abbie-questions.sql) ·
**Abbie contextual reactions** (7/7 — teacher-triggered: "Have Abbie react" on
poll results hands her the tally for a one-line take; "Have Abbie announce it"
on the spinner has her call the pick; shared abbieBus, no new setup) ·
**Abbie bits** (7/7 — Red Bull counter chip that roasts dad's hypocrisy on tap;
cross-day memory note in the console woven into her context; personality tuned
to complaining-teen, less Red Bull, shorter replies)

## In progress
- **Grudge Ball** — second live team review game, forked from BRUH's engine (shares
  the question loop, grading, and `bruh_sets` banks; separate `grudge_*` tables so
  BRUH cannot regress). Same answer/reveal/explain, then the reward beat becomes
  shoot + steal: the teacher taps a correct team, they explain, shoot a real hoop
  for ~30s (a teammate taps MAKE per basket), then walk to the panel and knock X's
  off rivals by hand. Erase model (anti-snowball); zero X's = out of the shooting
  but still answering + immune; "back with a grudge" revives after 2 wilds-while-out
  wins, taking 3 from the nemesis. `/teacher/grudge` (+`/board`,`/scoreboard`,
  `/remote`), `/grudge` student. Code + migration done; waiting on Steele to run
  `supabase/grudge.sql` and a live run. Deliberately not on the proficiency spine.
- **Week builder** — code shipped (warmup-pools-data.gs + warmup-week-builder.gs +
  sidebar button); waiting on Steele's Apps Script paste-in. Builds the week from
  published Notion lessons: pool-backed Q4/Q5 (verified tags), AI openers only.
- Warm-up → spine bridge — live and verified (Evidence post 200, 7/4)

## Planned
- **Abbie everywhere** — DONE (Area=Abbie): console + mic, student-screen
  broadcast, Ask-Abbie queue, contextual reactions, and bits all shipped 7/7-8.
  Later, optional: server-side cross-day memory (auto-summarized) instead of the
  device-local note.
- Claude enrichment: score short-answer reasoning (next-move sharpening now Live)
- RLS tightening on legacy tables (required before real student data)
- Reskin remaining tools; vertical draggable control sequence
- Abbie lesson-sequence phases 2–5 (auto-built spinner/misconception/flashback/exit)

## Parked
Infinite Campus push · Scan/OCR checkpoint pipeline · Google student sign-in
(CCSD OAuth question first)

## Steele's open setup items
0. (done) supabase/bruh.sql has been applied - BRUH is live.
1. Reseed mock fixtures (`seed2_part_1…4`, `iready_seed2`) → verify colored bars.
2. Add `Misconception Plans` text property to the Lessons DB; author `tag :: move` lines.
3. Vercel envs: `NOTION_ROSTER_DB_ID`, `CRON_SECRET`, later `EVIDENCE_INGEST_KEY`;
   delete unused `NEXT_PUBLIC_TEACHER_PIN`.
4. Share the roster Notion DB with the integration.
5. Run `supabase/abbie-broadcast.sql` (done) and `supabase/abbie-questions.sql`
   once each so Abbie's student bubble and the Ask-Abbie queue work in class.
