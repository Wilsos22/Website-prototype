#!/usr/bin/env bash
# Session-end shared-brain check.
#
# CLAUDE.md is the one document every agent on this repo reads: Claude Code
# loads it automatically, AGENTS.md points Codex at it, and the Claude Project
# reads it from main. When it goes stale, agents act on the stale line - two
# real July 2026 bugs came from a `middleware.ts` reference that had moved to
# `src/proxy.ts`. This hook is the tripwire for that: if a session changed code
# under src/ and never touched CLAUDE.md, it asks once whether anything
# discovered along the way belongs in the shared brain.
#
# It NEVER blocks. It prints one advisory message per session and gets out of
# the way. Silence means either no src/ change or CLAUDE.md was already updated.
#
# Registered as a Stop hook in .claude/settings.json.

set -uo pipefail

# The Stop event fires at the end of every assistant turn, so without a marker
# this would nag after every single response. One notice per session id.
payload=$(cat 2>/dev/null || true)
session=$(printf '%s' "$payload" | jq -r '.session_id // empty' 2>/dev/null || true)
marker_dir="${TMPDIR:-/tmp}/bdm-brain-check"
if [ -n "$session" ]; then
  mkdir -p "$marker_dir" 2>/dev/null || true
  marker="$marker_dir/$session"
  [ -e "$marker" ] && exit 0
fi

# Resolve the repo root from this script's own location so the hook behaves
# identically in the main checkout and in a .claude/worktrees/* worktree.
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd) || exit 0
cd "$root" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# Everything this branch has that main does not, committed or not, plus new
# untracked files. Git scope rather than session scope on purpose: what ships
# is what matters, and a doc fix parked on a branch is a fix nobody has.
base=$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main 2>/dev/null || true)
if [ -n "$base" ]; then
  ranged=$(git diff --name-only "$base" 2>/dev/null || true)
else
  ranged=$(git diff --name-only HEAD 2>/dev/null || true)
fi
untracked=$(git ls-files --others --exclude-standard 2>/dev/null || true)
changed=$(printf '%s\n%s\n' "$ranged" "$untracked" | sed '/^$/d' | sort -u)

printf '%s\n' "$changed" | grep -q '^src/' || exit 0
printf '%s\n' "$changed" | grep -q '^CLAUDE\.md$' && exit 0

count=$(printf '%s\n' "$changed" | grep -c '^src/')
sample=$(printf '%s\n' "$changed" | grep '^src/' | head -4 | sed 's/^/  /')

[ -n "$session" ] && : > "$marker" 2>/dev/null

message="Shared-brain check: this branch changes ${count} file(s) under src/ and does not touch CLAUDE.md.
${sample}

If anything here would have saved another agent a wrong turn - a moved file, a
silent failure mode, an undocumented constraint - CLAUDE.md is where it goes,
and it should land on main on its own rather than riding this branch. If the
work was purely local, ignore this. It shows once per session."

jq -n --arg m "$message" '{systemMessage: $m, suppressOutput: true}'
