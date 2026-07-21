# Big Dog Math - project instructions

Standing instructions for any agent doing work in this repo. Read this before touching code.
Deeper, always-current context lives in the `abbies-classroom` plugin skills (`classroom-os-context`,
`lesson-database-builder`) and in `ROADMAP.md`. When something here conflicts with a stale comment or
an older doc, this file wins.

## What this is

Big Dog Math is a 6th-grade math classroom operating system - not just a homework site. It runs class
start to finish: guided manipulatives, a front-of-room control panel with timed states, a student
homepage and daily lesson page fed from Notion, live sessions (rosters, join-by-code, polls, class-mode
screen sync) on Supabase, and a proficiency spine (warm-up + tool + checkpoint evidence to EWMA mastery
bars and live misconception grouping).

- Stack: Next.js (App Router) + TypeScript, deployed on Vercel.
- Live: https://bigdogmath.com (also website-prototype-three.vercel.app).
- Repo: https://github.com/Wilsos22/Website-prototype (default branch `main`).
- Local working folder: `/Users/steelewilson/Documents/Website prototype`.
- Teacher/owner: Steele Wilson. Mascot: Abbie (Steele's dog).

## Hard rules (non-negotiable)

1. NO EMOJIS ANYWHERE. Not in UI copy, component text, button labels, nav labels, headings, console
   logs, code comments, commit messages, docs, or the Apps Script files. Use plain words or, where a
   glyph is truly needed, a clean text/SVG affordance - not a pictograph, dingbat, or emoji checkmark
   or arrow. The existing codebase currently violates this heavily (roughly 440 emoji across ~70 files,
   pre-dating this rule); do not add more, and strip emoji from any file you edit as you go.
2. Never `git add .` or `git add -A`. A Google AI Studio agent and cloud Claude sessions commit to this
   same repo concurrently - stage only the explicit paths you changed. Always `git fetch` and merge (or
   fast-forward) before pushing; local `main` goes stale fast.
3. Agents commit locally; Steele pushes (GitHub Desktop). Only push when he asks. A push is what
   deploys - Vercel auto-builds `main`.
4. Never import `src/lib/supabaseServer.ts` (the service-role client / `SUPABASE_SERVICE_ROLE_KEY`) into
   a client component or any browser-reachable code. Server-only tables are touched only through
   `src/app/api/*` route handlers.
5. Secrets live in Vercel env vars only - never paste a key into chat, code, or a commit. Do not commit
   `.env*.local`, `.next`, `.data`, `.tmp-mastery/`, or anything under `aistudio_*`.
6. The control panel (`/control`) stays DARK for projector contrast. Do not carry the cream theme onto
   it.
7. Verify the build before reporting "done" (`npm run typecheck` at minimum, `npm run build` for
   anything non-trivial). Do not rely on file edits alone.
8. Do not store real student PII until RLS is tightened. Mock/test identities must be fully fictional.
9. KEEP THIS FILE TRUE, IMMEDIATELY. The moment you discover something that would have prevented a bug
   - a stale reference, a silent failure mode, an undocumented constraint - correct this file in the
   same turn you discovered it, as its own small commit, and get that commit onto `main` without
   waiting for the feature you were working on. This file is the shared brain: `AGENTS.md` points Codex
   here, Claude Code loads it automatically, and the Claude Project reads it from `main`. A correction
   parked on a feature branch is a correction nobody has. Two real bugs in July 2026 came from stale
   lines here - a `middleware.ts` reference that had moved to `src/proxy.ts`, which sent an agent to
   build a student endpoint in a teacher-gated namespace. Corollary: anything another agent would need
   goes HERE, not in a Claude-only memory note, because Codex cannot read those.

## Repo layout

- `src/app/**` - App Router pages and API routes (one folder per route, direct `page.tsx`/`route.ts`;
  no route groups, no per-segment layouts except the root `layout.tsx`).
- `src/components/**` - shared React components (SiteNav, ToolNav, AbbieTalk, the manipulatives, etc.).
- `src/lib/**` - non-UI logic: `supabase.ts`, `supabaseServer.ts`, `notionLessons.ts`, `mastery.ts`,
  `grouping.ts`, `toolEvidence.ts`, `teacherToken.ts`, `classStates.ts`, `liveClassFlow.ts`.
- `src/proxy.ts` - the real access-control gate (see Auth).
- `supabase/*.sql` - hand-run, idempotent migrations (no migration runner; run them in the Supabase SQL
  Editor). `supabase/SETUP.md` documents env setup.
- `warmup-*.gs` (repo root) - Google Apps Script warm-up pipeline (generator, Notion sync, evidence
  poster, week builder, pools). Steele pastes these into the Apps Script editor.
- `scripts/` - golden-file tests + fixtures for the mastery/grouping engines.
- `public/` - assets. Inline square mark: `big-dog-mark.png`; wordmark/banner: `big-dog-logo.svg` /
  `big-dog-logo.png`.
- `ROADMAP.md` - mirror of the Notion "Big Dog Math - Feature Tracker"; update BOTH when a feature ships.

## Routes (as of this writing)

- Student / public flow: `/` (landing, join-by-code), `/join`, `/explore`, `/lesson`, `/today`,
  `/lessons`, `/practice`, `/challenge`, `/checkpoint`, `/exit-ticket`, `/assignment/[id]`, `/spinner`.
- Manipulative tools (public, no session): `/whiteboard`, `/number-line-plus`, `/number-line`,
  `/fraction-bars`, `/group-bars`, `/percent-bar`, `/algebra-tiles`, `/equation-builder`,
  `/order-of-operations` (GEMS), `/combine-like-terms`, `/proportions`, `/area-model`,
  `/coordinate-grid`, `/ladder-method`, `/multiplication-fluency`, `/term-identifier`, `/timer`.
- Room/display surfaces (public): `/board` + `/ipad` (pen-to-board), `/warmup`, `/live-flow`.
- Teacher (gated): `/teacher` and `/teacher/*` (analytics, assignments, challenges, checkpoint-upload,
  checkpoints, exit-tickets, mastery, rightnow), `/control`, `/session`, `/roster`, `/start-question`.
  `/teacher/growth` redirects to `/teacher/rightnow`. Note: `/builder` and `/abbie` are teacher-ish but
  NOT gated.
- API: gated - `/api/form-responses`, `/api/mastery` (+`/history`,`/recompute`), `/api/live/*`,
  `/api/roster/sync`, `/api/checkpoints/upload`. Public - `/api/today`, `/api/lessons`,
  `/api/warmup-summaries`, `/api/abbie` (+`/voice`), `/api/session/*`, `/api/auth/login`,
  `/api/evidence` (authed separately by header, see Notion pipeline).

Adding a tool: also add a lowercase entry to `TOOL_ROUTES` in `src/app/lesson/page.tsx` or the Notion
`Tool:` name renders as a dead pill. SiteNav link sets are hardcoded arrays - add nav entries manually.

## Auth

The only enforced gate is `src/proxy.ts` (formerly `middleware.ts` at the repo root - update stale
references on sight). Without `TEACHER_PASSWORD` set, protected APIs return 503 and protected pages
redirect to `/teacher-login?error=configuration`. It gates a request when the path matches
`PROTECTED_PREFIXES` (`/teacher`, `/control`, `/session`, `/roster`, `/ipad`, `/board`,
`/start-question`, `/api/form-responses`, `/api/mastery`, `/api/live`, `/api/roster`,
`/api/checkpoints`, `/api/outreach`, `/api/submissions`, `/api/teacher`, `/api/control-remote`,
`/api/iready`, `/api/warmup-summaries`) - plus, when `NEXT_PUBLIC_SECURE_STUDENT_DATA=true`
(production has this ON), `SECURE_ROLLOUT_PREFIXES` `/api/session` and `/api/warmup`. Student-facing
endpoints therefore live under `/api/student/*` (never gated here) and are dual-mode: secure rollout
authenticates via `requireVerifiedStudent()` in `src/lib/studentIdentity.ts`; transitional mode
accepts the claimed id at the server boundary. Copy `/api/student/session-state` when adding one.
It authorizes via,
in order: (1) the `bdm_teacher` device cookie (value = lowercase SHA-256 of `bdm-teacher-cookie-v1|<TEACHER_PASSWORD>`,
`teacherToken()` in `src/lib/teacherToken.ts`, ~6-month expiry); (2) `Authorization: Bearer <CRON_SECRET>`
(Vercel cron); (3) HTTP Basic (user `TEACHER_USERNAME` or `teacher`, pass `TEACHER_PASSWORD`, which also
sets the cookie). Unauth: `/api/*` gets JSON 401; pages redirect to `/teacher-login?next=...`.

- Adding a protected route requires editing BOTH the `PROTECTED_PREFIXES` array AND the `config.matcher`
  in `src/proxy.ts` (Next.js needs static-analyzable literals). Keep them in sync.
- A shell `curl` that returns 401 on `/api/live/*` or `/teacher/*` is EXPECTED, not a bug - those need
  the cookie, Basic auth, or a Bearer cron token. In-browser fetches from a logged-in teacher tab carry
  the cookie automatically.
- `src/lib/teacherAuth.ts` / `NEXT_PUBLIC_TEACHER_PIN` / `TeacherGate.tsx` is LEGACY client-only soft
  auth, not wired into any page. Do not confuse it with the real gate.
- Student "session" is unauthenticated trust: `localStorage['bdm-student-session'] = {sessionId,
  studentId, name}` written client-side. Never rely on it for authorization.

## Data layer (Supabase)

- Browser client: `getSupabase()` in `src/lib/supabase.ts` (`NEXT_PUBLIC_SUPABASE_URL` +
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Server client: `getSupabaseAdmin()` in `src/lib/supabaseServer.ts`
  (`+ SUPABASE_SERVICE_ROLE_KEY`). Both return `null` when env is missing - null-check every call.
- RLS posture, three groups:
  - Permissive prototype (`prototype_all`, anon read+write): `periods`, `students`, `problems`,
    `assignments`, `assignment_problems`, `sessions`, `responses`, `period_summaries`, `session_joins`,
    `polls`, `poll_answers`, `challenges`, `challenge_attempts`, `checkpoint_runs`, `checkpoint_results`,
    `practice_assignments`, `practice_assignment_attempts`, `exit_tickets`, `exit_ticket_responses`,
    `lesson_presets`. Not safe for real PII.
  - Server-only (RLS on, zero policies, revoked from anon - reachable only via service-role API):
    `mastery`, `mastery_history`, `recommendations`, `iready_scores`. Anon reads return EMPTY silently.
  - Read-only reference (anon SELECT only): `standards`, `standard_prereqs`, `misconceptions`,
    `mastery_config`.
- Migrations are idempotent and hand-run; each schema-changing file ends with
  `notify pgrst, 'reload schema';`. Adding a table means writing a new `.sql`, choosing its RLS group
  deliberately, and running it in the SQL Editor. Order matters: `schema.sql` -> `proficiency.sql` ->
  `evidence.sql` (which makes `responses.problem_id` nullable and adds `source/domain/standard_id/
  item_ref/dedupe_key`).
- Two distinct "assignment" concepts: `assignments` (manipulative) vs `practice_assignments` (targeted
  practice) - do not conflate.

## Notion + warm-up pipeline

- `src/lib/notionLessons.ts` reads the "Math 6 Lessons" DB via the Notion data_sources API
  (`NOTION_VERSION = 2025-09-03`, `POST /v1/data_sources/{id}/query`, three `DATA_SOURCE_IDS`), auth
  `NOTION_TOKEN` (server-side; the literal `const NOTION_TOKEN = "secret"` on line ~13 is dead code -
  ignore it, never put a real token there).
- `/api/today` returns the lesson whose `Publish Workflow` select equals `Published` AND `Date` equals
  today in `America/Los_Angeles` (not UTC). Renaming those properties or assuming UTC silently returns
  nothing.
- Warm-up shape: 5 multiple-choice (exactly 4 choices, one correct, no duplicate choice values) + 1
  short-answer bonus. Q1 fluency, Q2-Q3 spiral review, Q4-Q5 the focus topic. Q4/Q5 are RETENTION - they
  check the PREVIOUS taught day's lesson, drawn from the lesson's `Retention Q4`/`Retention Q5` fields
  (teacher text wins) else the curated pool, pulling BACKWARD only (never un-taught material).
- One page per teaching day (locked convention) - never a Notion Date range. Ranges are only a
  fallback; single dates are what make `/api/today` and the day-to-day retention chain work.
- Evidence ingest: `POST /api/evidence` is the single write path for warm-up + tool events (rows into
  `responses`; follow with `POST /api/mastery/recompute`). It auths on the `x-bdm-key` header:
  Vercel env `EVIDENCE_INGEST_KEY` must equal the Apps Script Script Property `BDM_EVIDENCE_KEY` (same
  value, two names) or it 401s.
- Apps Script: exactly ONE spreadsheet-level `onFormSubmit` trigger (per-form triggers double-fire and
  hit Google's 20-trigger cap). Run `repairAllWarmupTriggers()` once to clean up.

## Proficiency spine

Design is locked (Steele's "Independent Proficiency System") - build it, do not redesign it.
- Mastery = per-domain EWMA bars (Number and Operations, Algebra and Algebraic Thinking, Measurement and
  Data, Geometry): `m = (1-alpha)*m + alpha*score%`, alpha 0.40 Tier-2 checkpoint / 0.20 Tier-1 / 0.30
  warm-up; init from i-Ready Fall `clamp((scale-480)/180*100, 5, 98)`. Weights/cuts live in the
  `mastery_config` table, not as magic numbers. Engine: `src/lib/mastery.ts`.
- Stage gates per standard: accuracy-only caps at `approaching`; a Tier-2 checkpoint >=80% (produced
  work) reaches `mastered`; two such checkpoints >=3 weeks apart plus the SBAC-modeled item reach
  `complete`; a later <50% regresses.
- Misconceptions are a FINITE exact-match vocabulary (13 tags, no NLP); clustering keys on exact string
  match. Unmatched wrong choices map to `other`. Engine: `src/lib/grouping.ts`; archetype-templated next
  moves, optionally Claude-sharpened via `/api/live/next-move`.

## Design system

- Font: `--bdb-font` = Albert Sans (Google Fonts, weights 400-800), NOT Georgia. Headings are weight
  700 in the sans font. Georgia only survives on ~7 legacy teacher/admin pages (roster, session,
  builder, teacher-login, teacher/mastery, teacher/rightnow, teacher/checkpoint-upload) - treat as
  legacy, do not spread it.
- Palette: CSS variables `--bdb-*` in `src/app/globals.css` `:root`. Canonical tokens: ground (page)
  `#faf6ee`, ground-2 `#f3ecdd`, card `#ffffff`, ink `#201e1a`, ink-soft `#6f675c`, ink-faint `#a59c8d`,
  line `#ece4d4`, amber `#fcaf38`, teal `#50a3a4`, brown `#674a40`, coral `#f95335`, green `#2f9e6f`.
  Prefer `var(--bdb-ground)`; a legacy hardcoded cream `#fbf7ef` exists on the older pages - do not
  introduce a third.
- Pages self-style with a per-page inline `<style>` block using a unique class prefix (`.ls-` lesson,
  `.cx-` control, `.rs-` roster, `.se-` session, `.bx-` builder) reading `var(--bdb-*)`. Follow that
  pattern; there is no shared CSS module beyond `globals.css`.
- `SiteNav` has `teacher` and `student` variants (hardcoded link arrays). Per-class-state accent colors
  live in `src/lib/classStates.ts`.
- Manipulative layout convention: when a tool pairs a reference set (rules, steps, vocabulary) with a
  workspace, put the reference in a LARGE LEFT RAIL, the thing being acted on in the center, and the
  product the student is building on the right. Never stack reference material under the workspace or
  pile it into the middle - repeated classroom feedback is "too much stuff in the center, I don't know
  where to look." `/divisibility` is the reference implementation; `/ladder-method` and `/area-model`
  are queued to follow it.
- Copy tone: friendly, playful, second person ("Hey {firstName}!", "Today's plan", "Start the warm-up").
  Teach how to think, not what to think. Still: no emojis.

## Build, deploy, test

- `npm run dev` (webpack), `npm run build`, `npm run typecheck` (`tsc --noEmit`).
- Golden tests: `npm run test:mastery` and `npm run test:grouping` compile `src/lib/mastery.ts` /
  `grouping.ts` in isolation (`tsc --ignoreConfig`) against Python-prototype fixtures - so do NOT add
  tsconfig path aliases or new imports to those two files, and regenerate `scripts/fixtures/*.json` if
  you change algorithm behavior.
- Deploy: edit -> commit (explicit paths) -> Steele pushes -> Vercel builds `main`. Env-var changes need
  a redeploy to take effect. `vercel.json` has one cron: `/api/roster/sync` at 13:00 UTC daily.
- `.next` `ENOTEMPTY` build errors are a Google Drive cloud-sync artifact (`rm -rf .next` and rebuild),
  not a code bug. Ignore `aistudio_*` and ` 2`-suffixed sync duplicates; never stage them.
