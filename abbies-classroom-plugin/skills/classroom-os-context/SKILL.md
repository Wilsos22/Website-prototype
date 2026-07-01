---
name: classroom-os-context
description: Auto-load the Big Dog Math classroom OS project context — the live Next.js/Vercel site, Notion lessons database, control panel state sequence, Abbie the dog mascot, teaching philosophy, design system, and warm-up format. Trigger on any mention of the classroom site, lesson page, control panel, warm-up, Abbie, "the site", "my site", manipulatives, period/roster, session code, class mode, or the Notion "Math 6 Lessons" database. Load this at the start of any conversation that touches the codebase, Notion lessons, or anything the teacher Steele Wilson is building for his 6th grade math class.
---

# Big Dog Math — Classroom OS

This is the standing context for Steele Wilson's 6th grade math classroom operating system. Read it whenever the conversation touches the site, lessons, control panel, Notion, or classroom workflows. Do not ask the teacher to re-explain things covered here.

## The teacher

- **Name:** Steele Wilson
- **Role:** 6th grade math teacher
- **Tone:** young, jokes around with students, builds classroom culture around *how to think, not what to think*. "Being confused is step one — that's how you know you're engaged. Step two is *what do you know*. Step three is *try something*."
- **Mascot:** Abbie (Steele's dog). Use Abbie as the friendly visual anchor anywhere you're producing graphics, slides, or in-app illustrations. Logo lives at `public/big-dog-logo.png`.
- **Preference:** pragmatic builds that streamline the classroom; suggest plugins/skills/extensions that get the job done thoroughly; reduce token usage when it doesn't hurt the product.

## The product

**Name:** Big Dog Math
**Live:** https://website-prototype-three.vercel.app
**Repo:** https://github.com/wilsos22/website-prototype (some commits land via `Wilsos22/Website-prototype`)
**Local working folder:** `/Users/steelewilson/Documents/Website prototype`

This is a classroom OS — not just a homework site. It facilitates class from start to finish: transitions, manipulatives, timers, visuals, plus a Notion-fed lesson agenda and a teacher control panel.

## Tech stack

- **Next.js (App Router)** + TypeScript, deployed to Vercel via GitHub pushes (GitHub Desktop)
- **Supabase** (`@supabase/supabase-js ^2.45.0`) — browser client via `getSupabase()` reading `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Tables: `periods`, `students`, `sessions`, `session_joins`, `polls`, `poll_answers`. RLS uses permissive `prototype_all` policies. Polling (~3s) instead of realtime.
- **Notion** — server-side fetch with `NOTION_TOKEN` env var; lessons database id `e367e541-c0c7-4613-8066-d2e61b6fee64`. See "Notion schema" below.
- **State persistence** — IndexedDB (`bdm-control` store) for uploaded sounds/media; `localStorage` for student name/session, class lists, control panel settings.

Secrets (service_role key, NOTION_TOKEN) live in Vercel env vars — never paste them into chat.

## Site map (file → purpose)

| Path | Purpose |
|------|---------|
| `src/app/page.tsx` | Student home. Abbie banner, "Hey {name}" / "Welcome!", primary "Today's Lesson" card → `/lesson` (no code needed). Optional "Join with a code" reveals code → roster → pick-name flow that stores `localStorage bdm-student-session` + `bdm-student-name`. Small "Teacher" link → `/control`. |
| `src/app/lesson/page.tsx` | Student lesson page. Cream/Abbie theme. Reads from Notion via `/api/today`. Hero (date, "Hey {firstName}! 👋", module/topic chips, serif title) → warm-up CTA card (orange) → numbered agenda journey → Supplies + Tools two-up → Today's focus → Assignment → Exit Ticket → poll overlay modal. Reachable WITHOUT a session code. |
| `src/app/control/page.tsx` | Teacher control panel. Intentionally **dark** for projector contrast. Per-state instructions, draining progress bar, auto-advance, spinner, sounds, edit times, fullscreen. Links to Session, Rosters, Tools. |
| `src/app/session/page.tsx` | Teacher live session. Start session (DOG+3 code), live joins polling, poll controls, Class Mode controls (`broadcast` field in `sessions` table) that push student screens to `/lesson` or a specific tool. |
| `src/app/roster/page.tsx` | Reads/writes periods + students from Supabase. |
| `src/app/teacher/analytics/page.tsx` | Form-response analytics (built by another agent). |
| `src/app/area-model/` | One of the manipulative tools. |
| `src/app/api/today/route.ts` | Returns today's published lesson from Notion, filtered by `Date = today` (America/Los_Angeles) AND `Publish Workflow = Published`. |
| `src/components/SiteNav.tsx` | Shared nav. Two variants: `teacher` (Tools / Control / Session / Rosters / Student view) and `student` (Home / Lesson). Cream pills, current path highlighted via `usePathname`. |
| `src/components/ClassSync.tsx` | Global listener mounted in `src/app/layout.tsx`. Reads `bdm-student-session`, polls `sessions.broadcast` + `status` every 3s; if broadcast is a route and differs from current path, `router.push` to it; if status closed, clears localStorage. |
| `src/lib/supabase.ts` | `getSupabase()` returns null when env vars are missing — build-safe. |
| `src/lib/notionLessons.ts` | Notion fetcher. Supports checkbox-prefixed properties (`Supply:` and `Tool:`), relation resolution for warm-up + exit ticket links, `suppliesConfigured` / `toolsConfigured` flags. |
| `supabase/*.sql` | Schema, seed, policies, session-joins, polls, class-mode. Run in Supabase SQL Editor. |

## Design system

Cream / "Abbie" theme:

- **Background:** `#fbf7ef` (cream)
- **Cards:** white, rounded
- **Headings:** Georgia serif
- **Accent colors (retro):** orange `#ff6b3d`, teal `#14b8a6`, green `#22c55e`, amber `#f5b915`, blue `#4d8df6`
- **Control panel:** intentionally dark (projector contrast). Do not "fix" this by carrying the cream theme onto the control panel unless Steele explicitly asks.
- **SiteNav** is the standard navigation — apply it to new pages, but be cautious about the individual manipulative tools (Steele hasn't decided whether they get the nav).

## The warm-up format

Steele's warm-up structure is fixed:

1. **2 review computation problems** — quick fluency practice
2. **3 current questions** — the misconceptions on these are the *goal* to highlight (not just to get right)

When generating warm-ups, always follow this 2+3 shape and explicitly name the misconception the third question is designed to surface. Steele is open to alternatives to Google Forms for collecting answers (e.g. Notion forms, Tally) that auto-collect emails like Google Forms does.

## The control panel state sequence

A class period is 55 minutes. The control panel walks through ordered states with adjustable timers, sounds, and visuals. Each state has:

- a name (e.g. Warm Up, Mini-Lesson, Work Time, Exit Ticket)
- a duration (in minutes)
- a description / teacher instruction
- optional sound triggers (music during state, alert at 30s, countdown from 10)
- visual screens shown to students when Class Mode is on

Music during warm-up; alert at 30 seconds, then countdown from 10. Student screens count down from 10 in sync. Steele has the sounds wired to his Stream Deck and can also upload sounds in-app per state.

## The student spinner

At the end of warm-up: 2 wheels (or "poker machine" style) that pick students from the roster, plus a 3rd spinner for "the iPad kid." Students can't pick someone else's name or a fake name — names come from the loaded roster. Reads the learning intention and success criteria when it lands.

## Notion schema — "Math 6 Lessons" database

Database id: `e367e541-c0c7-4613-8066-d2e61b6fee64`

Known properties (some are checkbox-prefixed; others are relations):

| Property | Type | Notes |
|----------|------|-------|
| Name / Title | title | Lesson title |
| Date | date | Filtered by today in `America/Los_Angeles` |
| Publish Workflow | select | Only `Published` shows on the student page |
| Module | text/select | Shown as chip on lesson hero |
| Topic | text/select | Shown as chip on lesson hero |
| Learning Intention | text | "Today's focus" section |
| Success Criteria | text | Often paired with learning intention |
| Agenda | text (lines) | Becomes the numbered journey on lesson page |
| Supply: ___ | checkbox (multiple, prefixed) | Each `Supply:` checkbox represents one supply item. Parsed by `notionLessons.ts`. |
| Tool: ___ | checkbox (multiple, prefixed) | Each `Tool:` checkbox links to a manipulative route via `TOOL_ROUTES` map in `lesson/page.tsx`. |
| Warm Up Link | relation | Resolved to a URL (Notion page link or external) |
| Exit Ticket Link | relation | Same resolution pattern |
| Assignment | text or URL | Shown in Assignment section |

When asked to add a lesson, populate every field above. When `Supply:` / `Tool:` checkboxes are absent, the lesson page falls back to `DEFAULT_SUPPLIES` / `DEFAULT_TOOLS` and sets `suppliesConfigured: false` / `toolsConfigured: false`.

## Supabase tables

- `periods` — class periods (e.g. P1, P3, P5)
- `students` — roster rows linked to a period
- `sessions` — live class sessions (code, status, `broadcast` text field controlling Class Mode)
- `session_joins` — which students have joined the current session
- `polls`, `poll_answers` — live polls (MC and open-ended)

RLS is permissive (`prototype_all` policies) — secure this before storing real student data behind a teacher login.

## Build & deploy workflow

1. Edit files locally in `/Users/steelewilson/Documents/Website prototype`.
2. **Verify build before pushing:** copy working tree (excluding `.next`, `node_modules`, `.git`, `aistudio_*`) to `$HOME`, `npm install`, `npm run build`, grep for `Compiled` / `error`.
3. Commit hygiene: only `git add` specific paths — another agent edits this repo concurrently. Claude commits locally; Steele pushes via GitHub Desktop.
4. If `.next` build errors with `ENOTEMPTY rmdir '.next/server/app 3'` (cloud-sync artifact), `rm -rf .next` and rebuild.
5. Merge conflicts: when both agents touched `src/app/lesson/page.tsx`, default to keeping Steele's cream redesign (`git checkout --ours`) and merging the other agent's data-layer work (which usually lives in `src/lib/notionLessons.ts`).

## Open / pending items (as of last session)

- **Lesson database build-out:** pre-build a library of lessons in Notion matching the schema above so the control panel can select from premade lessons. **(This plugin's `lesson-database-builder` skill handles this.)**
- **Teacher-curated student tool view:** Notion "Enabled Tools" field → student homebase shows only those tools when in Class Mode.
- **Database security:** add a teacher login and tighten RLS before storing real student data.
- **NotebookLM bridge:** turn lessons into slideshows / infographics automatically.
- **Student progress tracking:** year-long progress dashboard.
- **Responsive warm-ups:** generate warm-ups from prior misconception data.
- **Games / website features that match the design system:** future skill territory.

## What Steele typically asks Claude for

Most conversations are one of these four:

1. **Add new site features** — new manipulatives, new lesson page sections, new control panel states, new Notion integrations.
2. **Design / UX improvements** — match the cream Abbie theme, simplify navigation, make things bigger / more visual.
3. **Automate something** — recurring workflows that should run themselves (warm-up generation, lesson backfill, broadcast triggers).
4. **Instant feedback on student work during class** — *the high-value workflow*. While class is live, Steele wants to surface a student's response (from a poll, exit ticket, warm-up form, or manipulative) and get an actionable teacher move *in the moment*: who to pull for small group, what misconception is firing, what reteach to deliver in the next 30 seconds. When this comes up, default to: (a) read the student response, (b) name the specific misconception or strength, (c) give Steele one concrete next move he can do *right now*, not a long-form analysis.

## What Claude should default to

- **Never re-ask** for the philosophy, mascot, tech stack, Notion schema, design system, or warm-up format. They're in this file.
- **Do ask** before touching the control panel theme (Steele wants it dark), before storing real student data (security first), and before doing anything irreversible to the repo.
- **Always verify builds** before reporting "done." Don't rely on the file edits alone.
- **Suggest skills/plugins/extensions** that thoroughly accomplish the task, even if Steele doesn't have them yet — recommend available resources to best complete the work.
- **Match Abbie's tone** when writing student-facing copy: friendly, slightly playful, "how to think" not "what to think."
