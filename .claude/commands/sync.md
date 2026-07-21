---
description: Push what this session learned into the shared agent brain (CLAUDE.md, ROADMAP.md, memory)
---

Sync this session's knowledge into the places other agents actually read.

Codex and cloud Claude sessions work this repo concurrently and start cold every
time. They cannot read a Claude-only memory note. `CLAUDE.md` is the only shared
brain: Claude Code loads it automatically, `AGENTS.md` points Codex at it, and
the Claude Project reads it from `main`. A correction parked on a feature branch
is a correction nobody has.

Work through these in order. Skip a step out loud if it has nothing in it -
do not invent an entry to fill a slot.

## 1. Establish what actually changed

Run `git status` and `git diff --name-only $(git merge-base HEAD origin/main)`.
Read the diffs that matter. Do not work from memory of the conversation alone -
the files are the record.

## 2. Sort each finding into exactly one destination

- **`CLAUDE.md`** - anything another agent would need and could not derive from
  the code: a file that moved, an auth or RLS boundary, a silent failure mode, a
  hard rule, a naming or layout convention, a constraint that is not visible at
  the call site. Also correct anything already in the file that this session
  proved wrong. This is the highest-value destination; bias toward it.
- **`ROADMAP.md`** - a feature shipped, changed scope, or got queued. Mirror the
  same edit into the Notion Feature Tracker.
- **Auto-memory** (`memory/*.md` + a one-line pointer in `MEMORY.md`) - only
  things that are about Steele or about how to work with him, not about the
  repo. Preferences, standing feedback, decisions with a "why" that the code
  does not carry. Never duplicate a CLAUDE.md fact here.
- **Nothing** - implementation detail the code already states, or a fact that
  only mattered inside this conversation. Say so and move on.

## 3. Land the CLAUDE.md edit on its own path to `main`

Rule 9 exists because two real July 2026 bugs came from stale lines in that
file. So:

- Commit the `CLAUDE.md` change **by itself**, not bundled with feature work.
- Stage explicit paths only. Never `git add .` or `git add -A` - other agents
  have work in this tree.
- `git fetch` first; local `main` goes stale fast.
- Get it toward `main` without waiting for the feature branch to be ready. If
  pushing directly to `main` is not permitted, push a small docs branch and tell
  Steele it needs a one-click merge - name the branch in your summary so he can
  find it.

## 4. Report

State plainly: what went into each destination, what you deliberately left out
and why, and anything still needing Steele's action (a merge, a Notion edit, a
migration to run). If you could not verify something, say that rather than
implying it is done.
