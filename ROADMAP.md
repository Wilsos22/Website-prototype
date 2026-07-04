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
idempotent, auto-recompute) · Figma lesson-flow template

## In progress 🔨
- **Warm-up → spine bridge** — code shipped (warmup-evidence.gs + generator tagging);
  waiting on Steele's Apps Script paste-in + EVIDENCE_INGEST_KEY/BDM_EVIDENCE_KEY setup

## Planned 🧭
- Tool evidence emitters (Equation Builder, GEMS, CLT → responses)
- Claude enrichment (score short-answer reasoning; sharpen next moves)
- RLS tightening on legacy tables (required before real student data)
- Reskin remaining tools; vertical draggable control sequence
- Abbie lesson-sequence phases 2–5

## Parked ⏸
Infinite Campus push · Scan/OCR checkpoint pipeline · Google student sign-in
(CCSD OAuth question first)

## Steele's open setup items
1. Reseed mock fixtures (`seed2_part_1…4`, `iready_seed2`) → verify colored bars.
2. Add `Misconception Plans` text property to the Lessons DB; author `tag :: move` lines.
3. Vercel envs: `NOTION_ROSTER_DB_ID`, `CRON_SECRET`, later `EVIDENCE_INGEST_KEY`;
   delete unused `NEXT_PUBLIC_TEACHER_PIN`.
4. Share the roster Notion DB with the integration.
