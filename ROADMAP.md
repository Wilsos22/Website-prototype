# Big Dog Math — Feature Roadmap

**The live tracker is in Notion:** "Big Dog Math — Feature Tracker"
(https://app.notion.com/p/f248b4164504427d896087e9b98aa2f4 · data source
`56ee55bb-c067-4613-8f3b-6d5810a82ced`). Steele checks things off there; agents
should update BOTH that database and this mirror when a feature ships.

Snapshot (2026-07-04):

## Live ✅
Student home/join · Lesson page (Notion-fed) · Manipulative tools suite ·
Live polls (stuck-poll trap fixed) · Class mode broadcast · Challenge games ·
Today's boards · Control panel · Session controls · Rosters ·
**Notion roster sync** (needs `NOTION_ROSTER_DB_ID` + `CRON_SECRET` envs) ·
Teacher login (6-month device cookie; PIN gate removed) · Warm-up analytics ·
Checkpoint delivery · iPad ink → board · Abbiliathan 3000 (voice + Stream Deck) ·
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
**Growth view** (Right Now is now "🌱 Growth", linked from teacher nav + home;
/teacher/growth redirects) · **Claude-sharpened next moves** (7/6 —
/api/live/next-move + per-archetype "Sharpen this move" button on each Growth
cluster; archetype-aware, tool-grounded, reuses ANTHROPIC_API_KEY, template fallback) ·
**Abbie Console** (7/7 — summon the Abbiliathan from the control panel: 6
quick-tap moods + type-to-say, no open student mic; context-aware (current
state + lesson intention); teal projector bubble the class sees + her real
voice, voice/text-only toggle; /api/abbie takes a `context` field; roast
material loaded — Kendrick, tight pants, Legos, dog-park small talk, etc.) ·
**Abbie on student screens** (7/7 — her line broadcasts to a dedicated
sessions.abbie column and pops a teal bubble on every joined student's screen,
any mode; global AbbieStudentBubble in the layout; needs abbie-broadcast.sql) ·
**Moderated Ask-Abbie queue** (7/7 — students type a question from an "Ask
Abbie" button; lands in the control-panel queue with a count badge; teacher
edits/approves and she answers the room, or dismisses; one pending per student;
abbie_questions table, needs abbie-questions.sql)

## In progress 🔨
- **Week builder** — code shipped (warmup-pools-data.gs + warmup-week-builder.gs +
  sidebar button); waiting on Steele's Apps Script paste-in. Builds the week from
  published Notion lessons: pool-backed Q4/Q5 (verified tags), AI openers only.
- Warm-up → spine bridge — live and verified (Evidence post 200, 7/4)

## Planned 🧭
- **Abbie everywhere** (queued in tracker, Area=Abbie): student-screen
  broadcast + moderated "Ask Abbie" queue both shipped 7/7; still to do:
  contextual reactions (poll results, spinner pick), bits (Red Bull counter,
  cross-day memory)
- Claude enrichment: score short-answer reasoning (next-move sharpening now Live)
- RLS tightening on legacy tables (required before real student data)
- Reskin remaining tools; vertical draggable control sequence
- Abbie lesson-sequence phases 2–5 (auto-built spinner/misconception/flashback/exit)

## Parked ⏸
Infinite Campus push · Scan/OCR checkpoint pipeline · Google student sign-in
(CCSD OAuth question first)

## Steele's open setup items
1. Reseed mock fixtures (`seed2_part_1…4`, `iready_seed2`) → verify colored bars.
2. Add `Misconception Plans` text property to the Lessons DB; author `tag :: move` lines.
3. Vercel envs: `NOTION_ROSTER_DB_ID`, `CRON_SECRET`, later `EVIDENCE_INGEST_KEY`;
   delete unused `NEXT_PUBLIC_TEACHER_PIN`.
4. Share the roster Notion DB with the integration.
5. Run `supabase/abbie-broadcast.sql` (done) and `supabase/abbie-questions.sql`
   once each so Abbie's student bubble and the Ask-Abbie queue work in class.
5. Run `supabase/abbie-broadcast.sql` once (adds the `abbie` column so her line
   pops on student screens in class mode).
