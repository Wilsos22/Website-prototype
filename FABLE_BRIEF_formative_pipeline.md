# Fable work-order — Grade-from-manipulatives + instant-feedback pipeline

> Build order-of-magnitude: this is the big cross-cutting build. Ship it in phases (§9),
> each independently useful. Read the repo before trusting anything asserted here — where
> this doc says "verify," confirm against the actual code. Another agent (Google AI Studio)
> also commits to this repo, so pull/merge carefully and `git add` explicit paths only.

## 0. Mission
Turn student work — **warm-up Google Forms** and **manipulative tool activity** — into a live
formative-feedback system that (1) **groups students by the specific misconception they're
showing**, (2) **generates the right next step** for each group — a *new problem*, a *new way to
explain it*, or a *missing connected/prerequisite skill*, and (3) tracks **each student's growth
toward mastery of each standard over the year**, shown as an evidence-based mastery bar that moves
**Not started → Developing → Approaching → Mastered → Complete** based on the work they actually
produce.

The teacher is Steele Wilson (6th-grade math). Philosophy: *how to think, not what to think* —
"confused is step one." Feedback must be **actionable in 30 seconds during live class**, not a report.

## 1. What exists today (verify in code)
- **Stack:** Next.js App Router + TypeScript on Vercel (deploy = commit → the teacher pushes → Vercel).
  **Supabase** (`getSupabase()`, tables `periods`, `students`, `sessions`, `session_joins`, `polls`,
  `poll_answers`; RLS is permissive `prototype_all` — **must be secured**, see §11). **Notion** "Math 6
  Lessons" DB (id `e367e541-c0c7-4613-8066-d2e61b6fee64`) read via `NOTION_TOKEN` through `/api/today`.
- **Warm-up analytics** already exist (read pre-computed "Warm-Up Weekly Summaries" + "Warm up Links"
  Notion DBs) under `src/app/teacher/analytics`. There is a **Google Apps Script** sync layer.
- **Manipulative tools** live under `src/app/<tool>` + `src/components/*` (Equation Builder, GEMS /
  order-of-operations, Combine Like Terms, Fraction Bars, Number Line, Proportions, Percent Bar,
  Area Model, Ladder Method, Term Identifier, Multiplication Fluency, etc.). Verify which emit any
  structured events today (most do **not** yet — you'll add an evidence emitter).
- **Class mode / liveTool:** `ClassSync.tsx` + `useLiveToolConfig.tsx` push students to a tool/lesson
  via `sessions.broadcast`. Reuse this to push a problem at a chosen level (see IDEAS.md).
- **AI pattern:** the repo calls Claude via raw `fetch` server-side (see `src/app/api/abbie/route.ts`
  and `src/app/api/abbie/voice/route.ts`) — keys stay in Vercel env. Match that pattern; never expose
  keys to the browser.
- **Design system:** cream / Albert Sans / retro accents for student + teacher pages; the **control
  panel stays dark** (projector contrast) — do not recolor it.

## 2. Hard constraints
- **Secure the data layer as part of this work.** You are about to store real 6th-graders'
  performance data. Tighten RLS off the `prototype_all` policies and gate teacher surfaces behind auth
  (the repo has a teacher PIN gate today; a real login is better). Minimize PII; this is effectively
  FERPA-adjacent. **Do not ship the mastery/feedback data on open RLS.**
- Don't break existing session/lesson/control/tool flows. Keep the control panel dark; cream elsewhere.
- Never touch `PROTECTED BACKUP`. Verify the build before declaring done. Commit explicit paths only.

## 3. The four pillars

### Pillar A — Warm-up Google Forms (2 / 3 / 1) → Notion + Supabase
The warm-up template is fixed: **2 fluency** (quick computation) + **3 topic** questions (the ones
whose *wrong answers are the point* — each is designed to surface a specific misconception) + **1
stretch** (a harder transfer problem). Deliver:
- **Auto-generate the Google Form per lesson** from the lesson's warm-up spec in Notion via Apps Script
  (`FormApp`): the 6 questions, with each topic question's **distractors mapped to named
  misconceptions**, and every question tagged with the **standard(s)** it assesses. Attach an
  `onFormSubmit` trigger. *(Fallback if generation is too big for Phase 1: a Form template + a small
  per-lesson config the script reads; still auto-sync responses.)*
- **Fix the broken sync:** the submit trigger calls `syncSubmissionToNotion`, which does not exist (the
  real handler is `syncSubmissionToNotionSafely_`). Add a public wrapper / repoint the trigger and
  remove duplicate triggers. Share the "Weekly Summaries" + "Warm up Links" Notion DBs with the
  integration.
- **Sync per-student, per-question responses** (not just summaries) into **Supabase** as evidence
  (§4) — answer, correct?, chosen distractor, standard, mapped misconception — AND keep the Notion
  mirror the teacher already uses. Supabase is the system-of-record for the pipeline; Notion is the
  human-facing view + lesson/standard authoring.

### Pillar B — Evidence capture from manipulatives
Add a small, uniform **evidence emitter** the tools call (e.g. `logEvidence({studentId, standard,
source:'tool', tool, kind, correct, misconception?, payload})`). Instrument the guided tools
(Equation Builder, GEMS, Combine Like Terms first — they already have step engines) to emit:
- **answer** events (attempt correct/incorrect), and
- **process** events (they showed the reasoning: picked the right inverse op, arranged like terms,
  ordered operations correctly, explained a step). Process events are the depth signal mastery needs.
Map tool error patterns to the **same named misconceptions** used by the warm-ups so both sources feed
one model. Only capture during a live session (respect class mode) unless told otherwise.

### Pillar C — Standard mastery model (the mastery bar)
Per **student × standard**, accumulate evidence into a **percent + stage**, shown as a bar:
- **Not started** (no evidence) → **Developing** (a few correct, no reasoning yet, ~30%) →
  **Approaching** (correct across ≥2 contexts, still no reasoning — accuracy alone caps here, ~60%) →
  **Mastered** (correct **plus** at least one quality *process/explanation* showing the reasoning,
  ~85%) → **Complete** (sustained: correct + reasoning across multiple days **and** a correct **stretch/
  transfer** item — locked, ~100%).
- **Key rule the teacher asked for:** getting answers right can only get you to *Approaching*. Crossing
  into *Mastered* **requires produced reasoning/process work**; *Complete* **requires consistency over
  time + transfer**. Depth and durability gate the top, not volume of right answers.
- Make the weights/thresholds a **config object** (tunable), not magic numbers. Support gentle
  **regression** if later evidence contradicts (a standard can drop from Mastered if they stop showing
  it). Retain history so growth-over-the-year is queryable.

### Pillar D — Instant-feedback engine
From the current lesson's live evidence:
1. **Detect misconception** per student — from warm-up distractor→misconception maps, tool error
   patterns, and (for open/short responses + the stretch problem) a **Claude classification** call that
   labels the response as correct-reasoning vs a specific named misconception.
2. **Group** students who share the same active misconception (or the same prerequisite gap) for the
   current standard → small groups.
3. **Generate the next step** for each group (Claude), choosing the *type* from the evidence:
   - **New problem** — when they're close / inconsistent: targeted practice at the right level.
   - **New explanation / representation** — when they're consistently confused the same way: a
     different way to explain (e.g. switch to the number line, a visual, a story).
   - **Connected/prerequisite skill** — when a **missing upstream skill** is detected (e.g. failing GCF
     because multiplication facts aren't fluent → drop to fact families). Use a standards
     **prerequisite graph** (§8) to find the gap.
   Cache recommendations; regenerate as evidence changes. Keep it one-glance and classroom-usable.

## 4. Proposed Supabase schema (adjust as you see fit)
- `standards(id, code, title, strand, grade)` — CCSS Grade-6 taxonomy (§8).
- `standard_prereqs(standard_id, requires_standard_id)` — the prerequisite graph for "connected skill."
- `misconceptions(id, standard_id, label, description)` — named misconceptions per standard.
- `evidence(id, student_id, standard_id, source['warmup'|'tool'|'exit_ticket'|'explanation'], item_ref,
  kind['answer'|'process'|'explanation'|'stretch'], correct bool|null, quality int|null,
  misconception_id null, payload jsonb, session_id null, created_at)` — the unified log everything writes.
- `mastery(student_id, standard_id, percent, stage, evidence_counts jsonb, first_at, last_at,
  updated_at)` — computed from `evidence` (materialized table refreshed on write, or a view + cache).
- `recommendations(id, scope['student'|'group'], student_ids, standard_id, misconception_id,
  type['new_problem'|'new_explanation'|'connected_skill'], content jsonb, created_at)`.
- Reuse `students`, `periods`, `sessions`. **Add real RLS** so a student can only write their own
  evidence and read nothing sensitive; teacher reads gated behind auth.

## 5. AI usage (Claude)
Server-side only, matching the repo's `fetch` pattern; keys in Vercel env. Uses:
1. Classify open/short + stretch responses → correct-reasoning vs a named misconception.
2. Score process/explanation **quality** (feeds the depth signal for Mastered).
3. Generate group **next-step** recommendations (pick type + content).
4. Optionally author the "new explanation" and "new problem" content.
**Batch a whole class set into one call** where possible (latency + cost). Choose a strong model for the
pedagogical judgment (default Opus-tier; see the repo's claude-api guidance) and note the choice.

## 6. Teacher-facing surfaces
- **"Right now" live view** (during class): for the current lesson/standard, groups-by-misconception
  cards, each with the misconception, the named students, and the Claude next-step (typed:
  problem / explanation / connected skill). One glance → one move. Reuse class mode to *push* a chosen
  problem/level to a group.
- **Mastery board** (per period, over the year): standards × students grid of mastery bars
  (Not started → Complete) with evidence drill-down, plus a **per-student growth chart** for a chosen
  standard across time. Cream design system.

## 7. Standards taxonomy
Seed `standards` with **CCSS Grade 6 math** (6.RP, 6.NS, 6.EE, 6.G, 6.SP) and a prerequisite graph.
Add a **Standards** multi-select/relation to the Notion Lessons DB, and tag each **warm-up question**
and **tool** with the standard(s) it assesses, so all evidence lands on the right standard.

## 8. Build phases (each shippable)
1. **Foundation:** `standards` + taxonomy + prereq graph; `evidence`/`mastery`/`misconceptions` schema;
   **secure RLS + teacher auth**; **fix the warm-up sync** + share the Notion DBs.
2. **Ingest:** warm-up Form generation (or template) → per-question responses into `evidence`;
   evidence emitter wired into Equation Builder / GEMS / Combine Like Terms.
3. **Mastery:** compute percent + stage; mastery board + growth chart.
4. **Feedback:** misconception detection + grouping + Claude next-steps; the "Right now" live view.

## 9. Acceptance criteria
- A teacher builds a lesson in Notion → a standardized **2/3/1 warm-up Form** exists for it, and
  submissions land as **per-student, per-question evidence** in Supabase (with standard + misconception),
  mirrored to Notion — with **no** reliance on the broken `syncSubmissionToNotion` name.
- Doing Equation Builder / GEMS / Combine Like Terms during a session writes **answer** and **process**
  evidence tagged to the right standard + misconception.
- A student with several correct answers but no reasoning shows **Approaching (~60%)**, not Mastered;
  after producing solid process/explanation work they reach **Mastered**; after sustained correct +
  reasoning + a correct stretch item, **Complete**. Growth is visible over time per standard.
- The live view shows students **grouped by shared misconception** with a **typed next step**
  (new problem / new explanation / connected skill) that reflects the evidence, and prereq gaps route to
  a **connected skill**.
- None of this runs on open `prototype_all` RLS; teacher data is behind auth.

## 10. Known blockers & gotchas
- Warm-up sync bug: `syncSubmissionToNotion` (missing) vs real `syncSubmissionToNotionSafely_`; plus
  duplicate triggers to clean up. Notion "Weekly Summaries" + "Warm up Links" DBs must be **shared with
  the integration**.
- **Permissive RLS** (`prototype_all`) — the #1 thing to fix before real student data.
- **Concurrent Google AI Studio agent** commits to this repo (leaves `aistudio_agent_environment-*.tar`);
  `git fetch` + merge before pushing, explicit-path adds only.
- Student **Google sign-in may be blocked by CCSD** — test with one real account; keep tap-your-name as
  fallback (IDEAS.md §🔐).
- Deploy: commit locally; the teacher pushes (GitHub Desktop / their Deploy command). Verify builds.
