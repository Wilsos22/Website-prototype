# Big Dog Board — Design System

**Big Dog Board** is a classroom operating system for math teachers (grades 6+). It is a fast, board-first control surface: a whiteboard, manipulatives (algebra tiles, fraction bars), a weekly warm-up builder with live student responses, and a number-line + timer display.

The brand is **warm, rounded, and soft** — friendly and credible without being childish. Cream backdrop, white rounded cards with gentle elevation, bold Albert Sans headings, an amber brand highlight, and **flat regular accent hues** (never pastel) used for action and math meaning. Accent palette is anchored to the **colours.cafe** scheme: brown `674A40`, teal `50A3A4`, amber `FCAF38`, coral `F95335`.

> **Source of truth:** the attached Figma file **"Big Dog Board – Minimal Adult UI Prototype"**
> (proto: https://www.figma.com/proto/5LA5bepWx12Hepx3rBdNT9/Big-Dog-Board---Minimal-Adult-UI-Prototype?node-id=1-214) supplied the product structure and the five teacher screens. The **visual skin** was then re-directed by the user toward the warm, rounded "Grovia" aesthetic (off-white ground, soft cards, Albert Sans + Geist) — with the explicit rule that accent colors stay **flat and regular, not pastel/feminine**. No production codebase was provided.

---

## CONTENT FUNDAMENTALS

**Voice:** functional, teacher-to-teacher, confident. Describes what a tool *does* in plain words. No hype, no gamification language, no mascot, no emoji.

- **Casing:** Sentence case for headings and prose; UPPERCASE only for small tracked field labels (`WEEK`, `MONDAY TOPIC`). Button labels use Title Case ("Start Session", "Build All 5 Forms").
- **Person:** addresses the teacher implicitly ("Build weekly forms and view responses"). Not "the user."
- **Tone:** terse and useful. Headlines state a benefit ("Classroom control without visual noise"); subtitles list capabilities ("Fast tools for board display, manipulatives, warm-ups, and pacing").
- **Emoji / mascot:** none. The "Big Dog" name lives only in the wordmark.

Examples (verbatim from the product): "Classroom control without visual noise" · "Generate forms once, remake a single day only when needed." · "Single or double number line workspace."

---

## VISUAL FOUNDATIONS

**Color** — Cream + ink ground, with **flat regular accent hues** (never pastel) for action and math meaning:
- Warm ink `#201E1A` — headings; `#4A453E` body; `#8A8378` muted. Warm brown `#674A40` — palette neutral anchor.
- **Amber `#FCAF38`** — brand highlight: active nav pill, brand moments, streaks.
- **Teal `#50A3A4`** action / x · **Green `#2E9E5A`** positive / done · **Orange `#F2820C`** in-progress · **Coral `#F95335`** negative · **Violet `#845BC9`** fractions / x².
- Neutrals: white `#FFFFFF`, paper `#F6F3EC`, sunk `#ECE7DD`, hairline `#DBD5C9`, cream app bg `#ECE8E0`.
- No pastels, no gradients, no mascot art.

**Type** — **Albert Sans** for display/headings (bold 800, tight `-0.02em`); **Geist** for body/UI and numerals (tabular figures via `tnum`). Scale: display 56 · h1 34 · h2 24 · title 19 · body 15 · sm 14 · chip/label 11.

**Spacing** — 4px base scale (`--space-1`…`--space-16`). Layout is a 1440-wide frame inside a cream margin: rounded white app shell, 76px header (logo + search), 244px left rail, generous panel padding (24–32px).

**Radii** — **Rounded & friendly:** sm 8 / md 12 (buttons, inputs) / lg 16 (cards) / xl 20 (panels) / 2xl 28 (app shell) / pill (avatars, search, chips-on-fill). No zero-radius controls.

**Borders & elevation** — Soft warm **shadows** carry structure (`--shadow-card` for default card lift, `--shadow-md/lg/pop` for raised surfaces); 1px warm hairlines (`--line` `#DBD5C9`) where a divider is needed. Cards are white, `--radius-lg`, `--shadow-card`.

**Signature motif — soft accent.** Color appears as:
- **4px rounded top strip** on panels (`Panel accent="…"`) — e.g. yellow "Today", blue "Live session".
- **Soft yellow pill + yellow dot** on the active nav item (`NavItem`).
- **Rounded chip** with a solid color dot (`Chip tone="…" dot`) for status.
- **Flat-color icon chip** on the rounded launcher tiles (`ToolCard`).

**Motion** — Smooth, gentle (no bounce). `--dur-fast 120ms` / `--dur-base 200ms`, eased `--ease-out`. Hover darkens fills (or warms ghost/soft backgrounds) and lifts cards `translateY(-2px)`; press nudges `translateY(1px)`. Focus = 3px soft-blue ring.

**Imagery** — None in-product. Warm surfaces, color, and type do the work.

---

## ICONOGRAPHY

The prototype uses **no icon set** — tools are labeled with short text abbreviations on square buttons (e.g. whiteboard rail: `Pe` Pen, `Er` Eraser, `Li` Line, `Gr` Grid, `Un` Undo, `Cl` Clear), and `+` for "add". There is no icon font, no SVG icon library, and no emoji. If a future surface needs line icons, use a minimal geometric set at ~2px stroke to match Inter; flag any such addition as a substitution (none ships today).

**Logo:** the **Big Dog Math** mark — a dog face built from math symbols (a `+` and `÷` for eyes, a `w` muzzle), set in warm ink (`#201E1A`) with the math symbols knocked out. Followed by the lowercase **bigdogmath** wordmark. Files: `assets/logo-mark.svg` (square mark), `assets/logo-wordmark.svg` (horizontal lockup), plus `-rev` light variants for ink/dark surfaces. PNG versions ship alongside.

---

## INDEX

**Root**
- `styles.css` — global entry (import-only). Consumers link this.
- `readme.md` — this guide. · `SKILL.md` — Agent-Skills front matter.

**`tokens/`** — `fonts.css` (Inter), `colors.css`, `typography.css`, `spacing.css` (radii/borders/bars/motion), `base.css`. All `@import`ed by `styles.css`.

**`guidelines/`** — specimen cards (Design System tab):
- Colors: Ink & neutrals · Action — Blue · Math-meaning accents · Surfaces & lines.
- Type: Display — Inter · Body & UI — Inter · Numerals — Inter tnum · Type scale.
- Spacing: Spacing scale · Corners — zero radius · Borders & elevation · Signature — accent bars.
- Brand: Logo · Color = action + meaning · Voice & tone.

**`components/core/`** — primitives (React, via `window.DesignSystem_901ffe`):
`Button`, `Chip`, `Panel`, `Field`, `NavItem`, `ToolButton`, `ToolCard`. Cards: `buttons.card.html`, `panels.card.html`, `toolcards.card.html`.

**`ui_kits/big_dog_board/`** — interactive recreation of the 5 teacher screens (Home, Whiteboard, Manipulatives, Warm-Up Builder, Number Line + Timer). Entry: `index.html`.

**`assets/`** — `logo-mark.png`, `logo-wordmark.png` (+ `-rev` light variants). Dog-face mark built from `+` and `÷`.

---

## Caveats
- **Fonts are Google Fonts** — **Albert Sans** (display) + **Geist** (body/numerals). No brand font binaries were provided; swap in real files if they exist.
- **Two-stage direction.** The Figma prototype defined the *product* (structure + 5 teacher screens) in a cool/square/Inter style; the user then re-skinned the *look* to warm/rounded/soft (Grovia-inspired). The current tokens, components, and UI kit reflect the **warm** direction. The Figma proto remains the structural reference, not the visual one.
- **Flat, not pastel.** Accent colors are intentionally flat regular hues per the user's direction — avoid washed peach/pink/lavender tints when extending the system.
