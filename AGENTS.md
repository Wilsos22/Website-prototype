# Big Dog Math - agent instructions

Full standing instructions are in `CLAUDE.md` (read it before working in this repo). This file mirrors
the non-negotiable rules for any agent that only reads AGENTS.md.

## Hard rules

1. NO EMOJIS ANYWHERE - UI copy, labels, headings, logs, comments, commit messages, docs, Apps Script.
   Use plain words. Strip emoji from any file you edit. (The existing code predates this rule and still
   contains many; do not add more.)
2. Never `git add .` or `git add -A` - multiple agents share this repo. Stage only the explicit paths
   you changed. Always `git fetch` and merge before pushing. Agents commit locally; the owner pushes.
3. Never import `src/lib/supabaseServer.ts` (service-role key) into client/browser code. Server-only
   tables are reached only through `src/app/api/*` route handlers.
4. Secrets live in Vercel env vars only. Never commit `.env*.local`, `.next`, `.data`, `.tmp-mastery/`,
   or anything under `aistudio_*`.
5. The `/control` panel stays DARK for projector contrast - do not apply the cream theme to it.
6. Verify the build (`npm run typecheck`, and `npm run build` for non-trivial changes) before declaring
   work done. Do not store real student PII; test data must be fully fictional.

## Orientation

Next.js (App Router) + TypeScript on Vercel; Supabase data layer; Notion-fed lessons; a Google Apps
Script warm-up pipeline; a proficiency spine (EWMA mastery + misconception grouping). Design system:
Albert Sans font, `--bdb-*` CSS tokens in `src/app/globals.css` (ground `#faf6ee`), per-page inline
`<style>` blocks. Access control is `middleware.ts` at the repo root. See `CLAUDE.md` for the details.
