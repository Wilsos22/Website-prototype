# Fable work-order — DATA SPINE (build this first)

> The buildable backbone of the formative pipeline. Full vision + rationale live in
> `FABLE_BRIEF_formative_pipeline.md`; **this** doc is the precise, testable spec for the first
> end-to-end slice: **warm-up + tool work → one evidence log → mastery bar → a live
> group-by-misconception view.** Verify every claim against the actual code before trusting it.
> A Google AI Studio agent also commits here — `git fetch` + merge before pushing, add explicit paths.

---

## Scope
**IN:** standards taxonomy + prerequisite graph · misconception catalog · one unified `evidence` log ·
warm-up Google Form (2 fluency / 3 topic / 1 stretch) generation + **sync fix** · tool evidence emitter
wired into **Equation Builder, GEMS, Combine Like Terms** · mastery derivation (percent + stage +
growth history) · **RLS + teacher auth** · a **minimal but real** live "Right now" group-by-misconception
view with typed next-steps · the read APIs the dashboards will consume.

**OUT (later — but design so they need no schema change):** polished growth dashboards, full tool
coverage, richly-authored next-step content, per-period tool curation.

Non-negotiable: **none of this ships on the current `prototype_all` RLS** (§8). Secrets stay server-side.

---

## 1. Schema (Supabase) — exact, put migrations in `supabase/`

```sql
-- Standards taxonomy (seed CCSS Grade 6: 6.RP, 6.NS, 6.EE, 6.G, 6.SP)
create table standards (
  id text primary key,               -- e.g. '6.NS.B.4'
  title text not null,
  strand text not null,              -- 'RP' | 'NS' | 'EE' | 'G' | 'SP'
  grade int not null default 6,
  sort int
);

-- Prerequisite graph → powers the "connected/missing skill" next-step
create table standard_prereqs (
  standard_id text references standards(id),
  requires_id text references standards(id),
  primary key (standard_id, requires_id)
);

-- Named misconceptions per standard (authored by the teacher; see §2)
create table misconceptions (
  id uuid primary key default gen_random_uuid(),
  standard_id text references standards(id),
  label text not null,               -- 'adds instead of multiplies'
  description text
);

-- THE unified evidence log — every source writes here, nothing else
create table evidence (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id),
  standard_id text references standards(id),
  source text not null,              -- 'warmup' | 'tool' | 'exit_ticket' | 'explanation'
  kind text not null,                -- 'answer' | 'process' | 'explanation' | 'stretch'
  correct boolean,                   -- null when not applicable (e.g. a process step)
  quality int,                       -- 0..3 reasoning quality (Claude-scored), null if n/a
  misconception_id uuid references misconceptions(id),
  item_ref text,                     -- form question id / tool problem id
  session_id uuid references sessions(id),
  payload jsonb default '{}',
  dedupe_key text unique,            -- idempotency: '<source>:<item_ref>:<student_id>'
  created_at timestamptz default now()
);
create index on evidence (student_id, standard_id, created_at);
create index on evidence (session_id);

-- Derived mastery, recomputed on every evidence write (see §5)
create table mastery (
  student_id uuid references students(id),
  standard_id text references standards(id),
  percent int not null default 0,    -- 0..100
  stage text not null default 'not_started', -- see §5 enum
  counts jsonb not null default '{}', -- {correct, incorrect, process, stretch, days}
  first_at timestamptz,
  last_at timestamptz,
  updated_at timestamptz default now(),
  primary key (student_id, standard_id)
);

-- Cached next-step recommendations (rule-based now, Claude-enriched later)
create table recommendations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id),
  standard_id text references standards(id),
  misconception_id uuid references misconceptions(id),
  student_ids uuid[] not null,
  type text not null,                -- 'new_problem' | 'new_explanation' | 'connected_skill'
  content jsonb default '{}',
  created_at timestamptz default now()
);
```

## 2. Taxonomy + misconception authoring
- Seed `standards` + `standard_prereqs` (CCSS G6). Keep the seed in a migration/script so it's reproducible.
- Add a **Standards** multi-select (or relation) to the Notion Lessons DB, and let the teacher author,
  per warm-up **topic question**, a **distractor → misconception** map. Sync those into `misconceptions`
  (+ keep the map with the question so responses can resolve it). This authored map is what makes the
  fast MC grouping possible — the classifier only covers open/stretch responses.

## 3. Evidence contract — the single write path
One server route, everything calls it:
```
POST /api/evidence
body: { studentId, standardId, source, kind, correct?, quality?, misconceptionId?, itemRef?, sessionId?, payload? }
→ upsert on dedupe_key, then recompute mastery for (studentId, standardId). Returns the new mastery row.
```
- **Client emitter** `logEvidence(e)` in `src/lib/evidence.ts` for the tools.
- **Instrument the 3 guided tools** (they already have step engines) to emit:
  - **Equation Builder:** `answer` (final x correct?), `process` (chose the correct inverse op / correct
    isolation step), map wrong inverse-op picks → a misconception.
  - **GEMS / order-of-operations:** `answer` (final), `process` (picked the correct next operation),
    wrong-order picks → misconception.
  - **Combine Like Terms:** `answer` (final simplified), `process` (grouped like terms / cancelled a zero
    pair correctly), mis-grouping → misconception.
  - Emit only inside a live session; tag `session_id` + the lesson's standard.

## 4. Warm-up Google Forms (2/3/1) + sync — EXTEND the existing scripts, DO NOT rebuild
This already exists as Apps Script — read it first: `warmup-ai-generator.gs` (AI-generates a day's Google
Form; today it emits **5 MC questions with 4 "common-mistake distractor" choices each + 1 open-response
"explain your reasoning" bonus**), `warmup-generator.gs`, `warmup-sidebar-functions.gs`,
`WarmupBuilder.html` (sidebar UI), `warmup-notion-sync.gs` (Notion sync). `src/lib/notionWarmupSummaries.ts`
reads the summaries. Form generation + AI distractors + Notion sync are **done** — extend, don't replace:
- **Reshape the generated set to the exact template** — 2 fluency + 3 topic + 1 stretch — by adjusting the
  AI prompt/schema in `warmup-ai-generator.gs` (it's close already: fluency + review + on-grade + challenge
  + open bonus).
- **Add the misconception tag (the ONE missing piece).** The generator already picks plausible
  common-mistake distractors and writes a `feedback` string; extend its output schema so **each wrong
  choice carries a named misconception label** and each question a **standard id**. Upsert those labels
  into `misconceptions`, and keep the per-choice map with the question so a submitted answer resolves to a
  `misconception_id`. This is a small prompt/schema extension — the AI is *already* choosing the
  distractors on purpose; we just need it to name them. Use the **finite misconception vocabulary** from
  the mock-data prototype (`Big Dog Math - Mock Data/README_import_guide.md`) as the seed vocabulary —
  exact-match clusterable, no NLP.
- **Fix the sync:** the submit trigger calls `syncSubmissionToNotion`, which does not exist — real handler
  is `syncSubmissionToNotionSafely_`. Add a public wrapper / repoint the trigger; remove duplicate triggers;
  confirm the "Warm-Up Weekly Summaries" + "Warm up Links" Notion DBs are shared with the integration.
- **New: per-response → evidence.** On submit, in addition to the Notion mirror, `POST /api/evidence` per
  question — `source:'warmup'`, `kind:'answer'|'stretch'`, `correct`, resolved `standardId` +
  `misconceptionId` (from the chosen distractor). The open "explain your reasoning" bonus →
  `kind:'explanation'`, quality Claude-scored (§5) — this is a primary *reasoning* signal for Mastered.
- **Identity:** map the Form respondent's **school email** → `students.email` (collect email in the Form).
  Unmatched → park + surface to the teacher, don't drop.

## 5. Mastery derivation — exact rubric
Pure function `computeMastery(evidence[]) → { percent, stage, counts }`, per student × standard.
Stages: `not_started → developing → approaching → mastered → complete`. **Config object (tunable):**
```
CORRECT answers build accuracy but CAP the stage at 'approaching'.
'mastered' REQUIRES ≥1 process/explanation with quality ≥ 2 (reasoning shown).
'complete' REQUIRES 'mastered' conditions sustained across ≥ 3 distinct days
           AND ≥1 correct 'stretch' item with quality ≥ 2 (transfer).
Defaults (make them constants, easy to change):
  developing:  ≥1 correct                                   → percent ~30
  approaching: ≥3 correct across ≥2 sources (warmup+tool)   → percent ~60  (accuracy-only ceiling)
  mastered:    approaching + reasoning evidence             → percent ~85
  complete:    mastered + sustained(≥3 days) + stretch      → percent 100 (locked)
Regression: allow a drop (e.g. mastered→approaching) if recent contradicting evidence accrues.
```
Recompute on every evidence write; keep all `evidence` rows so growth-over-time is queryable. Never let
raw right-answer count alone reach `mastered` — the whole point is that produced reasoning gates the top.

## 6. Read surface (what the UIs call) — exact shapes
```
GET /api/mastery?periodId=…&standardId=…
  → [{ studentId, name, percent, stage, counts }]
GET /api/mastery/student/:studentId/:standardId/history
  → [{ at, percent, stage }]        // growth-over-the-year series
GET /api/live/groups?sessionId=…
  → [{ misconception, standardId, students:[…], suggestedType, content? }]
     // grouping: cluster this session's students by their active misconception per the lesson standard.
     // suggestedType (rule-based first, Claude later):
     //   prereq gap detected  → 'connected_skill' (walk standard_prereqs for a weak upstream standard)
     //   same misconception repeated / consistent → 'new_explanation'
     //   inconsistent / close  → 'new_problem'
```

## 7. Minimal live "Right now" view
A teacher page reading `/api/live/groups`: one card per misconception group — the misconception, the
named students, the typed next-step, and a **"push to this group"** button reusing class mode
(`sessions.broadcast` / `useLiveToolConfig`). Cream design system. Usable-in-class, not final polish.

## 8. Security — exact intent
Replace `prototype_all` with real RLS:
- A student may **insert only their own** `evidence` (and read none of `mastery`/others).
- `mastery`, `recommendations`, and the read APIs are **teacher-only**, behind auth (upgrade the PIN gate
  to a real teacher login, or Supabase Auth). Service-role key used **only** server-side.
- Example intent (refine): `evidence` insert policy `student_id = auth.uid()`-equivalent; `mastery`
  select policy teacher-role only. Do not leave any table world-writable.

## 9. Acceptance criteria (testable)
1. Submitting a lesson's warm-up Form writes **per-question evidence** (correct + standard +
   misconception for topic distractors) to Supabase and mirrors to Notion — **without** the missing
   `syncSubmissionToNotion` name; duplicate triggers gone.
2. Doing Equation Builder / GEMS / Combine Like Terms in a live session writes **answer + process**
   evidence tagged to the right standard, and wrong steps write a `misconception_id`.
3. A student with 4 correct answers and **no** reasoning shows **Approaching (~60%)** — not Mastered.
   Add one quality process/explanation → **Mastered**. Add sustained correct+reasoning over 3 days + a
   correct stretch → **Complete**. `.../history` returns the rising series.
4. `/api/live/groups` returns this session's students **grouped by shared misconception**, each with a
   typed next-step; a detected prereq gap yields `connected_skill`.
5. RLS: a student token cannot read `mastery` or another student's `evidence`; teacher APIs require auth.
6. `npm run build` passes; existing session/lesson/control/tool flows still work.

## 10. Build order (small, verifiable steps)
1. Migrations for §1 + standards/prereq seed + RLS (§8). 2. `/api/evidence` + `logEvidence` + dedupe.
3. `computeMastery` + recompute-on-write + `/api/mastery*`. 4. Warm-up sync fix + Form generation →
evidence. 5. Instrument the 3 tools. 6. `/api/live/groups` (rule-based) + the "Right now" view.
7. (Then hand off to the feedback/Claude layer per the brief.) Stop after each step and verify.
```
