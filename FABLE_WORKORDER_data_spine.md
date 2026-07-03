# Work-order — DATA SPINE v2 (aligned to the Independent Proficiency System prototype)

> **v2 supersedes v1.** The system is already designed and validated with mock data in
> `/Users/steelewilson/Documents/Big Dog Math - Mock Data/` (Notion mirrors: "Independent
> Proficiency System — Semester 1 Overview & How-To" and "Daily Warm-Up Integration — Q4/Q5 as the
> data pull + multi-point confidence"). **Build that system into the Next.js/Supabase app — do not
> redesign it.** Read these before writing code: `README_import_guide.md`, `AI_Next_Moves_POC.md`,
> `Semester 1 Proficiency System/` (esp. `build_dashboard.py`, `SEMESTER1_summary.md`,
> `_semester1_checkpoints.json`, the Q4Q5 + ShortAnswer pools), `Independent Proficiency Checks -
> Module 1/README_checkpoint_system.md`, `_clusters.json`, and the repo's `supabase/*.sql`.
> A Google AI Studio agent also commits to this repo: fetch+merge before pushing; add explicit paths.

## 0. The system in one paragraph (teacher's design — locked)
Students demonstrate proficiency through a **two-tier independent-demonstration system** layered on
existing calendar days: **Tier-2 Checkpoints** (6–8 items, paper-primary so reasoning is preserved,
solver-resistant, one SBAC-modeled item each, on MATHia "Learn Individually" days; cuts: **≥80% Got
It / 50–79% Almost / <50% Intervention**) and **Tier-1 practice-day checks** (4–6 items; second
practice day may run as **Grudgeball game mode** with individual capture). **Daily warm-ups** feed the
same spine: **Q4/Q5 are the data pull** — drawn from curated pools with **keyed distractors** from a
**finite misconception vocabulary (~13 tags, exact-match, no NLP)**; the short-answer pool supplies an
explain-your-reasoning item. **Multi-point confidence:** no single wrong answer triggers action — a
flag needs recurrence (2+ same-tag) and corroboration (i-Ready domain placement, checkpoint results).
Mastery is visualized as **per-domain EWMA bars** (Number & Operations, Algebra & Algebraic Thinking,
Measurement & Data, Geometry), initialized from i-Ready Fall. Clusters of students sharing a
misconception get **templated next moves keyed to (misconception × archetype)**. Endpoint (out of
scope, design-compatible): teacher confirms outcome → push to **Infinite Campus**.

## 1. Architecture decision
**Supabase is the computational store** (EWMA, clustering, live grouping, history) — the prototype's
`checkpoint_results.notion_synced` already implies this. **Notion stays the human-facing mirror +
authoring layer** (Student Data Hub, gradebook, lesson DB). CSV import paths from the mock README stay
valid for iReady/SBAC/curriculum tests. The QR-scan→OCR checkpoint pipeline is **out of scope** here —
ingest checkpoint results via CSV upload first; design the table so the scan path slots in later.

## 2. Schema — REUSE what exists, ADD only what's missing
**Existing (verify in `supabase/schema.sql`, `formative.sql`, `checkpoints.sql` — do not rebuild):**
`students`, `periods`, `problems`, `responses(student_id, problem_id, is_correct, misconception,
score, submitted_at)`, `checkpoint_runs(session_id, checkpoint_id, ccss, prompt, correct_answer,
misses jsonb)`, `checkpoint_results(run_id, student_id, answer, is_correct, misconception, ccss,
notion_synced)`, plus practice/exit-ticket tables.

**Add (new migrations in `supabase/`):**
- `standards(id text pk, title, strand, domain, grade, sort)` — CCSS for the Sem-1 scope (see §7) with
  each standard's **i-Ready domain**; extend to Sem 2 later.
- `standard_prereqs(standard_id, requires_id)` — powers the "connected/missing skill" move.
- `misconceptions(id, label unique, standard_id null, description)` — seed the finite vocabulary from
  `_clusters.json` / `_semester1_checkpoints.json` (≈13 tags incl. "distributes to first term only").
- `mastery(student_id, standard_id null, domain, percent numeric, stage, updated_at, pk(student_id,
  domain, coalesce(standard_id,'—')))` — EWMA state per **domain** (the bars) and per **standard**
  (the stage gates), + `mastery_history(student_id, domain, standard_id null, percent, stage, at)` for
  the growth-over-the-year view.
- `evidence_weights` config table (or a constants module): α values + cuts, tunable, not magic numbers.
- `recommendations(id, session_id, misconception_id, archetype, student_ids uuid[], type, content
  jsonb, created_at)` — cached next moves.

## 3. Mastery engine — port `build_dashboard.py` exactly, then add the stage gates
- **EWMA:** `m_new = (1−α)·m_old + α·(score_pct)` with **α = 0.40 Tier-2 checkpoint, 0.20 Tier-1,
  0.30 daily warm-up**. Per-item **domain tags** decide which bar each item moves.
- **Init:** from i-Ready Fall scale score: `clamp((scale−480)/(660−480)×100, 5, 98)` per domain.
- **Stage per standard** (the teacher's mastery-bar semantics — accuracy alone can't reach the top):
  - `not_started` → no evidence. `developing` → warm-up evidence accruing (~bar rising through ≈30%).
  - `approaching` → **cap for MC/accuracy-only evidence** (warm-ups + digital quick-checks), however high the average.
  - `mastered` → a **Tier-2 checkpoint ≥80%** on that standard — checkpoints are paper, work-shown,
    solver-resistant: that *is* the produced-reasoning gate.
  - `complete` → sustained: **≥2 Tier-2 checkpoints ≥80% spanning ≥3 weeks AND the SBAC-modeled item
    correct** (transfer). Locked unless later evidence contradicts.
  - **Regression:** a later checkpoint <50% drops `mastered → approaching`; EWMA dips naturally
    (one bad day ≠ crater — that's the point of EWMA).
- Recompute on every write of `responses`/`checkpoint_results`; append to `mastery_history`.

## 4. Ingestion
1. **Warm-ups (extend the existing Apps Script — `warmup-ai-generator.gs`, `warmup-notion-sync.gs`,
   `WarmupBuilder.html` — do NOT rebuild):** keep the 5 MC + 1 short-answer shape. **Q1–Q3 =
   fluency/review; Q4 = on-grade topic; Q5 = challenge.** Q4/Q5 draw from (or match the format of)
   `SEMESTER1_WarmUp_Q4Q5_pool.csv` — every distractor carries a misconception tag from the vocabulary;
   the short-answer item draws from `SEMESTER1_WarmUp_ShortAnswer_pool.csv`. On submit: existing Notion
   mirror **plus** rows into `responses` (`is_correct`, `misconception` resolved from the chosen
   distractor). **Fix the sync bug:** trigger calls `syncSubmissionToNotion` (missing); real handler is
   `syncSubmissionToNotionSafely_` — add a wrapper/repoint, remove duplicate triggers, confirm the
   Notion DBs are shared with the integration. **Identity:** respondent school email →
   `students.email`; unmatched → park + surface, never drop.
2. **Checkpoints (Tier-1 + Tier-2):** teacher-facing **CSV upload** matching
   `checkpoint_results_sample.csv` → `checkpoint_runs`/`checkpoint_results` (per-item `ccss`, domain,
   `misconception`). Mark tier on the run (drives α). QR/scan/OCR comes later; same tables.
3. **Manipulative tools:** wire Equation Builder, GEMS, Combine Like Terms to write `responses` rows
   (wrong-step patterns → vocabulary tags) during live sessions. Warm-up-weight α.
4. **Benchmarks:** CSV import for `iready_scores.csv` shape (init + corroboration) and
   `sbac_scores.csv` (reference).

## 5. Clustering + next moves (port the POC logic)
- **Cluster rule:** exact-match on misconception tag with **≥2 occurrences** per student across
  warm-ups + checkpoints (recency-windowed); corroborate with the student's i-Ready domain placement
  (multi-point confidence) before surfacing.
- **Archetypes** (compute from the data, thresholds in config): high-steady (warm-up avg ≥4.6) ·
  strong-recurring-slip (≥4.0 + repeated tag) · leaper (low baseline, climbing) · plateau (flat ~2.9–3.4
  + recurring tag) · chronically-low (<2.2) · **non-submitter** (<30% submission rate — a logistics
  group, not a math group).
- **Next move = template keyed to (misconception × archetype)** — seed the template bank from
  `AI_Next_Moves_POC.md` (challenge-not-remedial / catch-now / break-the-plateau / concrete-first +
  prereq check via `standard_prereqs` / extension / parent-contact draft). Claude enrichment (scoring
  short-answer reasoning quality, refining a template with detected prereq gaps) is a later layer —
  server-side, matching the repo's existing `fetch` pattern.
- **APIs:** `GET /api/mastery?periodId&domain|standardId` → bars+stages · `GET
  /api/mastery/:studentId/history` → growth series · `GET /api/live/groups?sessionId|periodId` →
  clusters with archetype-typed moves.

## 6. Teacher surfaces (cream design system; control panel stays dark)
- **"Right now" view:** cluster cards (misconception, students, archetype-differentiated move,
  corroboration badge e.g. "iReady Geometry low ✓"), + the non-submitter card. One glance → one move.
  Reuse class mode to push a tool/problem to a group.
- **Mastery board:** port `mastery_feed_demo_semester1.html` to React — per-student 4 domain bars +
  per-standard stage chips (Not started → Complete), drill-down to the evidence, growth chart over the
  year from `mastery_history`.

## 7. Standards scope (seed now; Sem 2 later)
M1T1: 6.EE.A.3, 6.EE.A.1, 6.NS.B.4, 5.NF.B.4, 6.NS.A.1 · M1T2: 6.G.A.1, 6.G.A.2, 6.G.A.3, 6.G.A.4 ·
M1T3: 5.NBT.A.3b, 6.NS.B.3 · M2T1: 6.RP.A.1, 6.RP.A.3, 6.RP.A.3a, 6.RP.A.3b · M2T2: 6.RP.A.3c ·
M2T3: 6.RP.A.3d, 6.RP.A.2. Domain mapping per the i-Ready four; keep `SEMESTER1_SBAC_crosswalk.csv`
importable for per-item SBAC citations.

## 8. Security (before any real student rows)
Replace `prototype_all` RLS: students insert only their own `responses`; `mastery`,
`checkpoint_results`, `recommendations` teacher-only. Teacher auth exists per `NOTION-SETUP.md`
(TEACHER_USERNAME/PASSWORD + middleware) — **verify it actually gates /teacher, /control, /session,
and the new APIs**; service-role key server-side only.

## 9. Acceptance criteria — use the mock data as fixtures
Seed with `supabase_seed.sql` (25 students, 1,441 responses) + `checkpoint_results_sample.csv`. Then:
1. **Clustering recovers the designed-in groups:** "treats ratio as additive" → Beckett, Pemberton, Hollis,
   Fontaine, Xanders; "adds denominators…" → Escobar, Tanaka, Kingsley, Sterling; "area vs perimeter" → Juarez,
   Winslow, Navarro; non-submitters → Rosales, Ibarra, Yarrow (with Ibarra's 3.4-when-he-submits surfaced).
2. Archetypes assign correctly (Beckett strong-recurring → challenge; Fontaine chronically-low →
   concrete-first; Hollis leaper → catch-now) and each cluster shows a templated move.
3. EWMA matches `build_dashboard.py` output on the same inputs (golden-file test); a Tier-2 ≥80 moves
   a bar visibly, a Tier-1 nudges it, one bad day doesn't crater it.
4. Stage gates: a student with high warm-up accuracy but no checkpoint ≥80 shows **Approaching**, never
   Mastered; a ≥80 Tier-2 flips **Mastered**; two ≥80s across ≥3 weeks + correct SBAC-modeled item →
   **Complete**; a later <50 regresses it. History endpoint returns the arc.
5. A warm-up Form submission lands in Notion AND `responses` with the right misconception — with the
   `syncSubmissionToNotion` bug fixed and duplicate triggers removed.
6. RLS: student token can't read `mastery` or others' rows; teacher APIs require auth. Build passes;
   existing flows unbroken.

## 10. Build order (each step shippable, verify then stop)
1. Migrations (§2) + standards/misconception seeds + RLS + verify teacher auth.
2. Mastery engine (port EWMA + stage gates) + golden-file test against `build_dashboard.py`.
3. Fixture load + `/api/mastery*` + mastery board (read-only, mock-data-powered).
4. Clustering + archetypes + template bank + `/api/live/groups` + "Right now" view — validate §9.1–2.
5. Warm-up Apps Script extension + sync fix → live `responses` ingestion.
6. Checkpoint CSV upload → `checkpoint_results` → bars move end-to-end.
7. Tool emitters (Equation Builder, GEMS, CLT). 8. (Later layers: Claude enrichment, scan/OCR, Infinite Campus.)
