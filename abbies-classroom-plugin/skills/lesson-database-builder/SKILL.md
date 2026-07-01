---
name: lesson-database-builder
description: Build out lessons in the Notion "Math 6 Lessons" database (id e367e541-c0c7-4613-8066-d2e61b6fee64) so the Big Dog Math control panel can select from a premade library. Produces lessons that match the existing Notion schema exactly (Date, Publish Workflow, Module, Topic, Learning Intention, Success Criteria, Agenda lines, Supply:* checkboxes, Tool:* checkboxes, Warm Up Link relation, Exit Ticket Link relation, Assignment) and that fit the control panel's state sequence (Warm Up → Mini-Lesson → Work Time → Exit Ticket). Trigger on: "build out the lesson database", "add lessons to Notion", "finish the lesson plan database", "premake lessons", "fill the lesson library", "build a lesson for {topic}", "add a unit to Notion".
---

# Lesson Database Builder

Build lessons that drop straight into Steele's Notion "Math 6 Lessons" database and render correctly on the live student lesson page + control panel sequence.

Assume the `classroom-os-context` skill has loaded — site structure, Notion schema, and warm-up format are known. If it has NOT loaded, read it first at `skills/classroom-os-context/SKILL.md` in this plugin.

## When to invoke

Steele asks for any of: a single lesson, a multi-day unit, a backfill of past lessons, or a stub for an upcoming topic. Default to **one lesson at a time** unless he says "build the whole unit" — quality over quantity, and lessons are easier to revise individually.

## Required inputs

Ask for whatever isn't already obvious from context:

1. **Topic / standard** (e.g. "ratios — introducing tape diagrams", "6.RP.A.1")
2. **Date** (specific date or "next Monday")
3. **Module** (the unit name as it appears in Notion — e.g. "Ratios & Proportions")
4. **Period length** — default 55 minutes if not specified
5. **Available manipulatives** — which `Tool:` checkboxes are relevant (see TOOL_ROUTES below)

If Steele has the Notion connector authorized, prefer reading an existing recent lesson to mirror tone and field formatting. Otherwise produce the lesson as a Markdown spec he can paste in.

## Output format — the lesson spec

Every lesson is a single Notion page with these fields populated:

### Top-level properties (Notion property → value)

| Notion field | What to put |
|--------------|-------------|
| Name (title) | Short, concrete lesson title — e.g. "Tape diagrams for part-to-whole ratios" |
| Date | The lesson's date |
| Publish Workflow | `Draft` while building, `Published` only when Steele approves |
| Module | The unit name |
| Topic | Sub-topic within the module |
| Learning Intention | One sentence, student-facing, starts with "I can…" |
| Success Criteria | 2–3 bullets, student-facing, observable |
| Agenda | One agenda step per line — see "Agenda lines" below |
| Supply: ___ checkboxes | One checkbox per physical supply needed |
| Tool: ___ checkboxes | One checkbox per on-site manipulative (see TOOL_ROUTES) |
| Warm Up Link | Relation to a Warm Ups database page (built separately) |
| Exit Ticket Link | Relation to an Exit Tickets database page |
| Assignment | URL or short text describing the assigned practice |

### Agenda lines — match the control panel state sequence

Write agenda lines in the same order and naming as the control panel states. The lesson page renders them as a numbered journey; the control panel uses the order to drive its timer sequence. Default sequence for a 55-minute period:

1. **Warm Up (8 min)** — students arrive, music on, work the 2 review + 3 current problems
2. **Spinner / Share Out (3 min)** — student spinner picks 2 + 1 iPad kid to share warm-up thinking; surface the misconception from question 3
3. **Mini-Lesson (12 min)** — direct instruction, anchor a single big idea, end with "what do you know?"
4. **Guided Practice (10 min)** — worked example + you-try with the manipulative tool listed under `Tool:`
5. **Work Time (15 min)** — independent or small group on the assignment; teacher pulls small group
6. **Exit Ticket (5 min)** — single-problem check tied to today's success criterion
7. **Pack Up (2 min)** — Abbie-themed cooldown screen

If Steele specifies a different duration, scale Warm Up / Mini-Lesson / Work Time proportionally and keep the Spinner, Exit Ticket, and Pack Up fixed.

### Supply: checkboxes — default options

Check only what's actually used. Common supplies: `Supply: Pencil`, `Supply: Notebook`, `Supply: Calculator`, `Supply: Whiteboard`, `Supply: Marker`, `Supply: Ruler`, `Supply: Protractor`, `Supply: Graph paper`, `Supply: Sticky notes`.

### Tool: checkboxes — must map to TOOL_ROUTES

The lesson page's `TOOL_ROUTES` map in `src/app/lesson/page.tsx` translates each `Tool:` checkbox into a manipulative URL. Only use tools that already exist as routes. Current tools (verify against `src/app/` before assuming):

- `Tool: Equation Builder` → `/equation-builder`
- `Tool: GEMS` → `/gems`
- `Tool: Combining Like Terms` → `/combining-like-terms`
- `Tool: Fraction Bars` → `/fraction-bars`
- `Tool: Percent Bar` → `/percent-bar`
- `Tool: Number Line` → `/number-line`
- `Tool: Ratio Proportion Builder` → `/ratio-proportion-builder`
- `Tool: Area Model` → `/area-model`

If Steele wants a manipulative that doesn't exist yet, flag it instead of inventing a route.

## Warm-up content rules

Warm-ups follow the 2 + 3 format:

- **2 review computation problems** — fluency from a prior unit. Pick from the last 2–3 weeks.
- **3 current problems** — on today's topic. The **third problem must target a specific, named misconception** (e.g. "students will treat 3:5 as 3+5=8 parts instead of 8 total parts → 3-of-8 shaded"). State the misconception in the lesson spec so Steele knows what to listen for during share-out.

When generating warm-ups for the Notion Warm Ups database, output:

```
Warm-up: {Lesson title} — {date}

Review (fluency):
  1. {problem}      → answer: {answer}
  2. {problem}      → answer: {answer}

Today (preview):
  3. {problem}      → answer: {answer} | misconception to watch: {n/a}
  4. {problem}      → answer: {answer} | misconception to watch: {n/a}
  5. {problem}      → answer: {answer} | misconception to watch: {THE big one}
```

## Exit ticket rules

One problem. Tied directly to one success criterion. Solvable in 3 minutes. Include answer + the misconception it screens for.

## Small group guidance

Every lesson spec ends with a **Small Group block** for the teacher (not student-facing). Format:

```
SMALL GROUP (during Work Time):
  Pull: students who missed warm-up question 5 (the misconception probe)
  Focus: {one-sentence reteach focus}
  Activity: {concrete activity using the manipulative tool listed in Tool:}
  Check: {how teacher confirms understanding before releasing back to independent work}
```

## Pedagogy sourcing

When the topic is unfamiliar or Steele asks for "best practices," pull from reputable sources before writing:

- NCTM Illuminations (illuminations.nctm.org)
- Achieve the Core / Student Achievement Partners (achievethecore.org)
- OpenUp Resources / IM 6–8 Math (illustrativemathematics.org)
- Desmos Classroom activities (teacher.desmos.com)

Cite the source inline in a `// notes` comment at the end of the lesson spec so Steele can audit. Never quote more than a sentence — paraphrase the pedagogy and adapt to the 2+3 / state-sequence format.

## Delivery

Default delivery is **Markdown** Steele can paste into Notion. If the Notion connector is authorized in this session, offer to write the page directly — but always show the spec first for approval.

## Quality bar

Before declaring a lesson done, check:

- [ ] Learning Intention starts with "I can…" and is one sentence
- [ ] Success Criteria are observable (not "understand"/"know")
- [ ] Warm-up follows 2+3 with a named misconception on question 5
- [ ] Agenda totals the period length
- [ ] Every `Tool:` checkbox maps to an existing TOOL_ROUTES entry
- [ ] Exit ticket screens for a specific misconception
- [ ] Small group block names who to pull and what activity
- [ ] Tone is Abbie-friendly, not stiff or textbook-y
