# Big Dog Math — Project Instructions

Classroom operating system for Steele Wilson's 6th grade math class.
Live at https://bigdogmath.com (Vercel, deploys on push to `main`).

## Read these first

- **`abbies-classroom-plugin/skills/classroom-os-context/SKILL.md`** — the full standing
  context: teaching philosophy, Abbie mascot, design system, warm-up format, control
  panel states, Notion "Math 6 Lessons" schema, Supabase tables, site map. Never re-ask
  Steele for anything covered there.
- **`ROADMAP.md`** — current feature status. Mirrors the Notion "Big Dog Math — Feature
  Tracker"; when a feature ships, update BOTH.
- **`docs/website-backlog.md`** — broader working backlog.

## Tech stack

Next.js App Router + TypeScript on Vercel. Supabase (`getSupabase()` returns null when
env vars are missing — keep code build-safe). Notion feeds lessons via server-side
`NOTION_TOKEN`. Apps Script (`warmup-*.gs`) powers the warm-up pipeline. Secrets live in
Vercel env vars only — never in chat or commits.

## Standing rules

- **Control panel stays dark** (projector contrast). Don't carry the cream theme onto it
  unless Steele explicitly asks.
- **Student pages stay un-gated** — `/lesson` and the homepage work without a session
  code. Class mode is opt-in.
- **Cream/Abbie theme** for student-facing pages: bg `#fbf7ef`, white rounded cards,
  Georgia serif headings, retro accents (orange `#ff6b3d`, teal `#14b8a6`,
  green `#22c55e`, amber `#f5b915`, blue `#4d8df6`).
- **No real student data** until RLS is tightened on the legacy tables (permissive
  `prototype_all` policies are still in place).
- **Warm-ups are always 2 review + 3 current questions**, with the misconception the
  third current question surfaces named explicitly.
- Student-facing copy matches Abbie's tone: friendly, playful, "how to think, not what
  to think."

## Build & commit

- Run `npm run typecheck` and `npm run build` before pushing; report failures honestly.
- Only `git add` specific paths — other agents work in this repo concurrently.
- Keep warm-up/Apps Script changes in separate commits from website changes.
- Merge conflicts in `src/app/lesson/page.tsx`: default to keeping the cream redesign
  (`--ours`) and merging data-layer work from `src/lib/notionLessons.ts`.
