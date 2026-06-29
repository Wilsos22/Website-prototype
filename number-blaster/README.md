# Number Blaster — Math Fluency Arcade

A single-file, offline math game for rebuilding whole-number fluency (×, ÷, +, −) and
number sense. Built for 6th graders who are missing foundational fact fluency, but the
content scales by level so it fits a range of students.

Everything lives in **`index.html`**. No install, no accounts, no internet required.

## How students play

- **🚀 Solo Blast** — Problem blocks fall and stack. Type the answer + Enter to blast the
  lowest matching block. Clear them before a column reaches the top. Speed ramps each level.
- **🧩 Build-It** — Blocks show single numbers and you get a TARGET. Tap blocks that add up
  to the target to blast them (number bonds / compose–decompose practice).
- **👥 Group Play** — Pass-and-play timed turns on one device, then everyone is ranked.

Incentives baked in: combo multipliers, coins, unlockable color themes, badges, ranks, and
power-ups (❄️ Freeze, 💥 Bomb, 💡 Hint). All progress saves on the device automatically.

**Teacher controls:** the **⚙️ Practice Setup** screen lets you pick which operations to
drill (e.g. just × and ÷), the starting difficulty, and the falling speed.

## Getting it onto Chromebooks (pick one)

1. **Easiest — Google Drive:** Upload `index.html` to a shared Drive folder. Students open
   it and choose **Open with → (preview)**, or download and double-click it. Works offline.
2. **Best for a class — host it free:** Drop `index.html` into Netlify Drop
   (https://app.netlify.com/drop), GitHub Pages, or Google Sites embed. You get one link to
   share. Still no logins.
3. **Local:** Double-click `index.html` — it runs straight in Chrome.

> Leaderboard, coins, and badges are stored **per device** (in the browser). Each Chromebook
> keeps its own. If you want a single class-wide live leaderboard across devices, that needs
> a small hosted database — ask and it can be added on top of this file.

## Files

- `index.html` — the entire game (this is the only file you need to share).
- `server.js` / `.claude/` — local dev helpers used during development; safe to ignore or delete.
