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
- Local working folder: `/Users/steelewilson/Website prototype` (moved OUT of Documents on
  2026-07-21 - Documents is Google Drive-synced, and Drive sync corrupted `.git`, `.next`, and
  `node_modules` with ` 2`-suffixed duplicate files at least six separate times. Never move this
  repo back inside a cloud-synced folder).
- Teacher/owner: Steele Wilson. Mascot: Abbie (Steele's dog).

## Hard rules (non-negotiable)

1. NO EMOJIS ANYWHERE. Not in UI copy, component text, button labels, nav labels, headings, console
   logs, code comments, commit messages, docs, or the Apps Script files. Use plain words or, where a
   glyph is truly needed, a clean text/SVG affordance - not a pictograph, dingbat, or emoji checkmark
   or arrow. The existing codebase currently violates this heavily (roughly 440 emoji across ~70 files,
   pre-dating this rule); do not add more, and strip emoji from any file you edit as you go.
2. Never `git add .` or `git add -A`. A Google AI Studio agent and cloud Claude sessions commit to this
   same repo concurrently - stage only the explicit paths you changed. Always `git fetch` and merge (or
   fast-forward) before pushing; local `main` goes stale fast. Corollary: when a brief cites a commit as
   already done, confirm it is actually in YOUR history (`git merge-base --is-ancestor <sha> HEAD`)
   before building on it - it may still be sitting on another agent's unmerged branch, and
   `git branch -a --contains <sha>` finds it. On 2026-07-21 the live tool banner's cream-surface
   restyle was one such commit; wiring eleven more cream pages to the un-restyled banner would have
   shipped pale-on-pale text no student could read.
3. Verified work ships without waiting for Steele (his standing request, 2026-07-21 - routing
   merges through him twice stranded finished work). A push to `main` is what deploys - Vercel
   auto-builds it. Flow: push the feature branch first (a local-only branch is invisible to
   Steele's github.com flow - never hand him a merge as an action item), then fetch, merge into
   `main` in a clean worktree, resolve conflicts, typecheck AND build the MERGED tree, push, and
   verify the live route actually changed. Still ask him first: curriculum/Notion content,
   classroom-orchestration core, locked designs, schema/RLS migrations, anything destructive, and
   anything you could not verify.
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
   Two mechanisms back this rule up; do not rebuild them. `.claude/hooks/brain-sync-check.sh` runs on
   Claude Code's Stop event and prints one advisory per session when a branch changed files under
   `src/` and never touched this file - it never blocks, and silence means the check passed. `/sync`
   (`.claude/commands/sync.md`) is the manual pass: read the diff, sort each finding into this file,
   `ROADMAP.md`, auto-memory, or nothing, then land the `CLAUDE.md` edit on its own path to `main`.

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
  `/coordinate-grid`, `/ladder-method`, `/multiplication-fluency`, `/term-identifier`,
  `/divisibility`, `/distributive-area`, `/area-explorer`, `/balance-beam`, `/long-division`,
  `/place-value`, `/place-value-mirror`, `/timer`.
- Room/display surfaces (public): `/board` + `/ipad` (pen-to-board), `/warmup`, `/live-flow`.
- Teacher (gated): `/teacher` and `/teacher/*` (analytics, assignments, challenges, checkpoint-upload,
  checkpoints, exit-tickets, mastery, rightnow), `/control`, `/session`, `/roster`, `/start-question`.
  `/teacher/growth` redirects to `/teacher/rightnow`. Note: `/builder` and `/abbie` are teacher-ish but
  NOT gated. The lesson flow does NOT require `/control` to run: `/api/control-remote` executes
  everything server-side - POST `start-lesson` (sessionId + lessonCode) builds the flow from Notion and
  enters step 0 through the same navigateFlow as Next, POST next/previous/toggle-timer drive it, and
  GET applies the lazy automatic-pacing transition, so pacing advances as long as ANY surface (Remote,
  /session's toolbar) is polling. `/control` remains the full host; `/session` carries a minimal
  Start / Back / Pause / Next toolbar for rush days.
- API: gated - `/api/form-responses`, `/api/mastery` (+`/history`,`/recompute`), `/api/live/*`,
  `/api/roster/sync`, `/api/checkpoints/upload`. Public - `/api/today`, `/api/lessons`,
  `/api/warmup-summaries`, `/api/abbie` (+`/voice`), `/api/session/*`, `/api/auth/login`,
  `/api/evidence` (authed separately by header, see Notion pipeline).

Adding a tool: also add a lowercase entry to `TOOL_ROUTES` in `src/app/lesson/page.tsx` or the Notion
`Tool:` name renders as a dead pill. SiteNav link sets are hardcoded arrays - add nav entries manually.

Same trap on the live-session side: listing a route in `LiveToolRoute` (`src/lib/liveClassFlow.ts`)
only lets the teacher PUBLISH a task to it. The tool component must also call
`useLiveToolConfig("/route")` and render `<LiveToolBanner tool={...} />`, or the published directions
are silently dropped and students see nothing. All 18 tool routes are wired as of 2026-07-20 - a NEW
route is the case to watch, so wire the component in the same change that extends `LiveToolRoute`.
Where a route's `LiveToolConfig` arm carries a typed payload (`/number-line-plus`, `/percent-bar`,
`/equation-builder`, `/order-of-operations`, `/algebra-tiles`, plus two teacher-set sequence arms:
`/distributive-area` `{ set }` - "24x7,16x8" via `src/lib/distributiveProblems.ts` - and
`/ladder-method` `{ set }` - "24,36,60" for Factor Trees via `src/lib/factorTreeSet.ts`) the tool
also applies `tool.config` to its own state - always in an effect keyed on `tool.id`, never on the
tool object (`useLiveToolConfig` re-reads every second, so object identity churns and an
object-keyed effect restarts the student's problem mid-answer; `PercentBar` is the pattern). Both
sequence tools also take the same string as a `?set=` URL param, resume progress per device from
localStorage, and treat an empty set as free play. The remaining arms are `Record<string, never>`,
where the prompt is all there is - do not invent config behavior for them.

Counting those arms, `LiveToolRoute` has 21, not 18: `/challenge`, `/exit-ticket` and `/checkpoint`
ride the same union so `/control` can publish them, but they deliberately do NOT call
`useLiveToolConfig` - do not "fix" them by wiring the banner. Each has its own launch path
(`launchChallenge`, `launchExitTicket`, `launchCheckpoint`) writing the real content to `challenges` /
`exit_tickets` / `checkpoint_runs`, and the student surface polls that table instead (`/exit-ticket`
reads `getOpenExitTicket`). Their `buildLiveToolConfig` result is only a marker for the control
panel's own published-state UI, and the teacher's question comes from a dedicated field
(`toolSetup.exitPrompt`), not the generic tool prompt - so nothing is dropped.

`LiveToolBanner` styles itself from `--bdb-*` tokens; it is shared, so do not hardcode a hex into it.
Every tool page it renders on is a light surface - cream (`--bdb-ground`) except
`/multiplication-fluency`, which is white, where the amber rail and hairline border carry the
separation. Its optional `style` prop is for PLACEMENT only (it merges last): `/area-model` and
`/coordinate-grid` pass `gridColumn: "1 / -1"` because their main container is a two-column grid.
Watch for a root with a fixed `grid-template-rows` - adding the banner as a new direct child shifts
every row (`.mf-root` on `/multiplication-fluency` is why the banner shares a wrapper with the mode
tabs there).

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
- RLS posture: PRODUCTION IS LOCKED DOWN (verified live 2026-07-21 - anon gets 401/permission-denied
  on `periods`, `students`, `sessions`, `responses`, `practice_assignments`, and the rest of the old
  permissive group). `supabase/student-data-security.sql` removed the `prototype_all` policies, so
  every student read/write goes through an authenticated `/api/*` route (`requireVerifiedStudent`
  for `/api/student/*`, teacher gate for the rest); browser-side `getSupabase()` calls against those
  tables silently fail in production and survive only in un-hardened dev environments.
  `supabase/student-data-security-rollback.sql` restores the old posture if ever needed. Still true:
  server-only spine tables (`mastery`, `mastery_history`, `recommendations`, `iready_scores`) are
  service-role only, and the read-only reference group (`standards`, `standard_prereqs`,
  `misconceptions`, `mastery_config`) allows anon SELECT.
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
- Entering an agreed lesson into Notion is TRANSCRIPTION, not authoring. Enter only what was
  agreed; a field the agreement does not dictate stays EMPTY - never fill it from an earlier
  draft or with plausible content, because empty renders as nothing but wrong renders on a
  classroom screen. In July 2026 the L2-D1 build (agreed state by state with Steele) was entered
  with Day-2 GCF/LCM material in four steps' support fields - teacher notes, vocabulary, stems,
  and the base64 BDM_ROUTINE_CONFIG - that was in nobody's agreement. The transcription miss hid
  in exactly the fields no one re-read. After any lesson entry, audit every step text field
  against the lesson page's scope contract ("Held for Day 2: ...") with a case-SENSITIVE sweep
  (SQLite GLOB, not LIKE - base64 blobs false-positive case-insensitive matches).
- One page per teaching day (locked convention) - never a Notion Date range. Ranges are only a
  fallback; single dates are what make `/api/today` and the day-to-day retention chain work.
- Evidence ingest: `POST /api/evidence` is the single write path for warm-up + tool events (rows into
  `responses`; follow with `POST /api/mastery/recompute`). It auths on the `x-bdm-key` header:
  Vercel env `EVIDENCE_INGEST_KEY` must equal the Apps Script Script Property `BDM_EVIDENCE_KEY` (same
  value, two names) or it 401s.
- Apps Script: exactly ONE spreadsheet-level `onFormSubmit` trigger (per-form triggers double-fire and
  hit Google's 20-trigger cap). Run `repairAllWarmupTriggers()` once to clean up.
- Instant warm-up access (2026-07-21): `periods.class_code` is a permanent per-period student code
  (`supabase/period-class-codes.sql`, defaults DOG1..DOGn). In `/api/student/warmup-start`, a code
  that matches no open session falls back to the period: it reuses the period's open session or
  AUTO-CREATES the day's session (join_code = class code, broadcast "free") seeded with a minimal
  live_flow whose warmup step carries today's published lesson's form URL - the shape
  `bdm_complete_warmup_identity` verifies against, so the receipt chain is unchanged. The teacher's
  `/session` page finds and inherits that open session. A teacher-assigned lesson always wins once
  loaded (the landing page polls and swaps forms without refresh). `sessions.join_code` uniqueness
  is now a partial index over OPEN sessions only, so codes are reusable across days. Once the
  student opens the form (tracked per warm-up token in `sessionStorage['bdm-warmup-opened']`) or
  their response verifies, the landing swaps to a home-base view: lesson card plus /lesson,
  /practice, /explore links that stay LOCKED until verification. That lock is load-bearing - the
  warmup-status -> join polling that writes the verified student session lives only in
  `src/app/page.tsx`, so the origin tab must stay on `/` until `identityReady`; navigating
  students elsewhere first strands them outside the live-flow join and receipt chain.

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

- Classroom-surface look (DECIDED 2026-07-20): the WARM NOTEBOOK temperature from the Claude Design
  "Lesson Frame Wireframes" canvas. Turn 11 made the choice; TURN 12 is canonical - it standardizes
  the look across all four surfaces (12a main, 12b support, 12c Chromebook, 12d Remote) and all
  eleven lesson states (12e). Warm dotted paper, system-font content, handwritten voice for teacher
  asides ONLY - anything a student must read uses the system font. The Remote (12d) is dark - it is
  the private teacher surface, consistent with the dark `/control` rule. The Blueprint temperature
  was rejected: fine graph grids moire on a projector at room distance, and its navy/orange chrome
  collides with the semantic per-state accent colors students learn. Source of truth lives in-repo:
  `Claude Design Wireframe/Lesson Frame Wireframes.dc.html` plus the `_ds` token set (cream/ink
  "warm edition" - hexes match `--bdb-*`); `scripts/extract-lesson-frames.mjs` regenerates
  `public/frame-preview.html` (`?solo=<id>` shows one frame full-page for the projector).
- Screen kit (`public/screens/`): one projector-ready HTML file per lesson state in the Warm
  Notebook look, plus `_blank.html` and a rich exemplar. OWNERSHIP CONTRACT: the `*.html` screens
  are HAND-OWNED - Steele edits them directly; no script may regenerate or overwrite them.
  `_system/frame.css` is GENERATED (`node scripts/build-screen-kit.mjs`) from the canvas +
  `_ds` tokens - never hand-edit it. `_system/frame.js` scales the fixed 1440x810 stage to any
  display. Slot contract: `data-slot="..."` text is fillable from Notion Lesson Step fields
  (the same fields `/teacher/studio` edits); deleting the attribute locks hand-written content.
  Two rules hold on every screen regardless of author: student-required text uses the system
  font (`.nbaside` handwriting is teacher-asides only), and no student names or results appear.
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
  where to look." `/divisibility` is the reference implementation; `/ladder-method` followed it
  2026-07-21 (rule rail + Ladder/Factor Trees modes); `/area-model` is still queued.
- Copy tone: friendly, playful, second person ("Hey {firstName}!", "Today's plan", "Start the warm-up").
  Teach how to think, not what to think. Still: no emojis.

## Build, deploy, test

- `npm run dev` (webpack), `npm run build`, `npm run typecheck` (`tsc --noEmit`).
- Scratch worktrees: `npm run build` (Turbopack) panics if the `node_modules` symlink points outside
  what it takes as the project root - "Symlink [project]/node_modules is invalid". Put worktrees that
  need a BUILD under `.claude/worktrees/` inside the repo; a tmp-dir worktree with the symlink is
  fine for `typecheck` only.
- Golden tests: `npm run test:mastery` and `npm run test:grouping` compile `src/lib/mastery.ts` /
  `grouping.ts` in isolation (`tsc --ignoreConfig`) against Python-prototype fixtures - so do NOT add
  tsconfig path aliases or new imports to those two files, and regenerate `scripts/fixtures/*.json` if
  you change algorithm behavior.
- Deploy: edit -> commit (explicit paths) -> Steele pushes -> Vercel builds `main`. Env-var changes need
  a redeploy to take effect. `vercel.json` has one cron: `/api/roster/sync` at 13:00 UTC daily.
- `.next` `ENOTEMPTY` build errors are a Google Drive cloud-sync artifact (`rm -rf .next` and rebuild),
  not a code bug. Ignore `aistudio_*` and ` 2`-suffixed sync duplicates; never stage them. The same
  sync artifact also lands INSIDE `.git` and `.next/types`: duplicated files like
  `refs/remotes/origin/HEAD 2`, `index 2`, or `routes.d 3.ts` cause
  `fatal: bad object refs/remotes/origin/HEAD 2` on fetch and duplicate-identifier typecheck errors.
  Fix: delete the ` 2`/` 3`-suffixed files (`find .git .next -name "* 2" -o -name "* 3"`), then retry.
  A `node_modules 2` duplicate makes `npm run build` fail on a spurious type error deep in a
  third-party `.d.ts` (a webauthn package, nothing you touched) - same artifact, same fix: delete
  the duplicate and rebuild. Drive also re-applies DELETES late: a file git just restored can
  vanish seconds afterward because your earlier `rm` only now synced - if a freshly checked-out
  file is missing, `git checkout -- <path>` again and re-verify before concluding anything.
- Verifying in the in-app Browser pane: the preview throttles rendering, so CSS animations sit at
  their first frame and screenshots wait for motion to settle - prove motion with
  `el.getAnimations()` or keyed-remount node identity instead of watching. `ResizeObserver`
  callbacks may never fire there (dispatch a synthetic window `resize` after resizing), and
  synthetic `dispatchEvent` clicks BATCH under React 18 - one state-advancing synthetic click per
  `javascript_tool` call is the reliable rhythm. `window.innerWidth` can report the pane frame
  rather than the emulated viewport (and misreports under real browser zoom), so in tool code size
  from the measured container (`clientWidth` on a ref), not `window.innerWidth`. Route changes in
  the pane are FULL document loads even through next/link and `window.next.router.push`, and
  parent-page intervals are throttled - so a `window.fetch` override cannot survive navigation and
  loses the race against mount effects. To exercise a data-backed page without Supabase/Notion env,
  register a temporary same-origin Service Worker that answers the `/api/*` calls (write it under
  `public/`, register from `javascript_tool`, reload; unregister and DELETE the file before
  committing - it survives page loads because it intercepts at the network layer, and the real
  page logic runs untouched). Caveat: the pane's loader sometimes fails SW-controlled NAVIGATIONS
  outright ("This page couldn't load" while curl serves the route in milliseconds) - if that hits,
  unregister the SW, verify what you can through `?preview=` params plus `getAnimations()`, and
  treat the SW technique as page-load-dependent, not guaranteed.
- Student digital responses: Response Mode on a Lesson Step drives the Chromebook input.
  "Multiple Choice + Explain" (added 2026-07-21) shows tappable choices plus a required written
  explanation; the choice stays in `poll_answers.answer` (tallies, correctness, and City Routes
  exact-match it) and the explanation lives in `poll_answers.explanation`
  (`supabase/poll-explanations.sql`). An unknown/blank Response Mode falls back to `Poll Kind`, then
  to state-id defaults (`question` short-answer, `learning-check` fist-to-five); `exit` has NO
  fallback, so exit steps must always carry an explicit Response Mode.
