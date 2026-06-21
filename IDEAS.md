# Big Dog Math — Manipulative ideas & roadmap

A running list so nothing from brainstorming gets lost. Nothing here is urgent.

## ✅ Built & ready to push/try
- **Equation Builder** (`/equation-builder`) — guided solver for `ax + b = c`.
  Build the equation with auto-aligned tiles + a fixed equals sign, then solve
  step by step: pick the inverse operation → pick the term → the constant
  cancels as a **zero pair (red box + poof + sound)** and the equation **drops
  to the next line** with a plain-English explanation on the left. **Hints**
  appear on request and auto-show after a wrong pick. Ends at `x = …`.

## 🔜 Next up (queued)
- **Order of Operations — GEMS** (new tool)
  - Student picks **what to perform first** in the expression.
  - A **pop-up** asks them to type the **result** of that step.
  - Tells them correct / not correct.
  - The **new expression drops below** (worked-solution style).
  - A **GEMS acronym across the top** (Grouping, Exponents, Multiply/Divide,
    Subtract/Add) where **each letter turns red as that level is completed**.
  - Reuses the same guided drop-down + sound/animation engine as Equation Builder.

- **Combining Like Terms** (refine toward the Gemini version Steele liked)
  - Select like terms to combine; show the combination **visually**.
  - **Zero pairs**: a positive and negative boxed in **red** and **cancelled out**
    with animation + sound.
  - Drop to the next simplified line; explain the step on the left.

- **Fraction Bars → Fraction / Decimal / Percent tool** (refine the existing bars)
  - Each bar can **toggle between fraction, decimal, and percent** labels for the
    same piece (e.g., 1/5 ↔ 0.2 ↔ 20%) — tap to rotate the representation.
  - **Guided "how many groups" questions**, e.g. *"How many sets of 20% are in
    100%?"*: student selects a 20% piece and **stacks copies to reach 100%**.
  - As they add pieces, an **expression builds live above**: 20 + 20 + 20 + …,
    with a running total, until it hits 100% (then it confirms: 5 groups).
  - Same guided feel as Equation Builder: feedback, animation, sound, and an
    explanation of the result (5 × 20% = 100%).

- **Number Line → representations + integer hops** (refine the existing number line)
  - Line can be labeled in **fractions, decimals, or percents** (toggle).
  - **Draggable dot** that **snaps to the next interval** — divided into **16ths**.
  - **Absolute value** mode: a **skipping dotted line** that counts the hops back
    to zero (shows |value| = number of spaces from 0).
  - **Problem mode**, e.g. *−3 + 6*: student drops a dot at **−3**, then drags it
    and a **hop line follows**; every spot it passes updates the running
    expression (−3 → −2 → −1 → 0 → 1 → 2 → **3**), confirming when they land on
    the correct spot. Shows the math during the process, not just the answer.

- **Ratios → Proportion builder** (keep the double number line, add this mode)
  - Set up a proportion: **first ratio + equals sign + second ratio**, with the
    **blank on top or bottom** depending on what's given.
  - **Scale-factor boxes** above and below the equals sign — students input the
    number that **scales one ratio up or down** to match the other side.
  - They fill the scale factor and the **missing value**; tool confirms when the
    cross-relationship holds (and could show ×/÷ animating across both parts).

- **Percent — parts & wholes** (new tool; reuses the double number line)
  - **Primary: percent bar** — two aligned scales, **0–100% on top, 0–whole on
    the bottom**. Student first picks which piece is missing: **part, whole, or
    percent** (naming the unknown is the real skill).
  - **Benchmark scaling** drives it: find **10% (or 1%)** first, then hop. The
    expression builds live as they go:
    - "30% of 80" → 10% = 8 → `8 + 8 + 8 = 24` (or `8 × 3`).
    - "15 is 25% of what?" → 25% = 15 → 100% is 4 of those → `15 × 4 = 60`.
    - "12 is what % of 48?" → build up from a benchmark to find the %.
  - Same guided feel: confirm, animate the hops, show the reasoning — not a formula.
  - **Alternate views (optional):**
    - **Hundredths grid (10×10)** — shade squares; great "out of 100" intuition.
    - **Part/whole proportion** `part/whole = %/100` — the *same engine* as the
      Ratios proportion builder, locked to /100. Connects the bar to the equation.
  - Sequencing: percent bar is the centerpiece; the `/100` proportion is a second
    view of the same problem so students link the bar to the math.

## 💡 Equation Builder — possible future tweaks
- A **"goal" check + tap-the-variable** gate before solving. ✅ (done)
- Support variables on **both sides** (`ax + b = cx + d`) with terms moving
  across the equals sign and flipping sign.
- Negative / fraction coefficients (multiply-to-isolate case).
- Teacher "assign this equation to the board" hook once the control panel ties in.
- Optional uploadable sound effects (like the control panel) instead of built-in beeps.

## 🎛️ Shared design principles (apply to all manipulatives)
- **Auto-snap / always aligned** — no fiddly free-dragging where it isn't needed.
- **Show the process**: animate combines/cancels, then drop to the next line.
- **Explain on the left**: a plain-English note for how each step happened.
- **Hints when stuck**: a hint button + auto-hint after a wrong answer.
- **Sound + animation** for correct, wrong, cancel, and solved.
- **Touch / Chromebook friendly**: big buttons, works on student devices.

## 🎚️ Teacher-curated student tool view
- Reduce overwhelm: students only see the tool(s) the lesson needs.
- Teacher panel with **checkboxes** to enable specific tools/presentations
  (e.g., just the **percent bar** today); the **student homebase shows only
  those**, and hides the rest.
- **Set before the day, not live** — so NO real-time push needed. Student devices
  just **read "today's enabled tools" when the page loads**.
- **Simplest path: a Notion property.** Add an **"Enabled Tools" multi-select** to
  the existing Notion **Lessons** database (the one `/today` already reads). Tick
  the tools when you build the day's lesson; the **student homebase shows only
  those**. No new backend — rides on the Notion setup you already do.
  - (Per-period = a small extension, e.g., a tools property per period or per day.)
- Only if you later want **live mid-class toggling** would this need Supabase.

## 🔐 Auto-identify students with Google sign-in (try later)
- Replace "tap your name" with **Sign in with Google** (Supabase Auth Google provider).
- Reads the student's **verified school email** → matches to `students.email` → auto-selects
  them. No name list, can't impersonate.
- Needs: a Google OAuth client + Google provider enabled in Supabase, sign-in restricted to
  the school domain, and student emails in the roster (or auto-create on first sign-in).
- **Risk:** CCSD may block students signing into third-party apps — test with one real
  student account / check with IT before committing. Keep tap-your-name as the fallback.

## 🧱 Bigger pieces still parked (need the database)
- Live **Poll / Question** + **Join Session** states (Supabase — see `supabase/SETUP.md`).
- **Student homebase + today's warm-up link** from the "Warm up Links" Notion DB.
- **Gradebook capture** (answers per period, AI-assisted grading) — schema already in `supabase/`.

## 📝 Revisions brainstormed (June 2026 session) — backlog
Captured so nothing gets lost. Roughly in priority order.

- **Push level + problem during class.** Use class mode + `liveTool` config so when the teacher
  launches a tool, every student opens the **same problem at the chosen level** (Beginner/Advanced).
  Lead them through once, then release them to try → capture results as formative data.
- **Capture tool work as formative data.** Log attempts/correct on GEMS, Combine Like Terms,
  Equation Builder (and others) into the warm-up analytics → "grade from manipulatives".
- **Problem of the day (Carnegie).** Teacher manually pastes ONE error-analysis or word problem
  from the Carnegie lesson into a Notion field (copyright: teacher-entered, not scraped). App reads
  it, pushes to students to work in-system, captures responses. Add **grouping** (Random now;
  formative-based grouping once warm-up sync is flowing).
- **Reskin remaining tools** to the design system (cream + Albert Sans + system accents):
  number line, percent bar, fraction bars, proportions, area model, ladder method, group bars,
  algebra tiles, multiplication fluency, whiteboard, spinner, timer.
- **Control panel: vertical, draggable sequence bar** — make the lineup vertical so the teacher can
  drag the state/component order around.
- **Term Identifier tool (new).** Students drag parts of an expression into the right bucket:
  coefficient, constant, operation, variable.
- **Ladder Method tool — reformat.** Current version is confusing/unintuitive; redesign for clarity.

### Done this session
- GEMS rebuilt (left rail, beginner yes/no walk + advanced select-only; fixed advanced/random bug).
- Combining Like Terms rebuilt (arrange-into-boxes gate, then combine animations).
- Equation Builder: fixed grid, red-box zero pair, division-as-fraction, Beginner/Advanced toggle,
  **x/d (divide) problems**, **type-the-math compute step**, "beside it divide / underneath multiply" rule.
- Design-system migration: /teacher dashboard, /, /lesson, /control, SiteNav.
- Warm-up analytics rebuilt to read pre-computed Weekly Summaries (fast) + Google Form summary links.

### Open loops (blockers for formative data)
- **Fix the warm-up Notion sync:** the form-submit trigger calls `syncSubmissionToNotion`, which
  doesn't exist (real handler is `syncSubmissionToNotionSafely_`). Add a public wrapper / repoint the
  trigger, and clean up the duplicate triggers.
- **Share the "Warm-Up Weekly Summaries" + "Warm up Links" Notion DBs** with the Big Dog Math integration.
