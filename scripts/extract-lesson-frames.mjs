// Extract one turn of the Claude Design "Lesson Frame Wireframes" canvas into a
// standalone preview page.
//
// Why a generator and not a hand-port: the wireframe screens are absolutely
// positioned markup with inline SVG. Retyping them into JSX loses fidelity in
// ways that are invisible until they are on a projector, which is the one place
// this has to be right. Extracting keeps the design byte-identical and lets us
// re-run when Design ships a new turn.
//
//   node scripts/extract-lesson-frames.mjs [turnId]     (default: t11)
//
// Input:  Claude Design Wireframe/Lesson Frame Wireframes.dc.html
//         Claude Design Wireframe/_ds/<system>/tokens/*.css
// Output: public/frame-preview.html
//
// The output is a PREVIEW, not a shipped surface. It exists so a temperature
// can be chosen from the back of the room before anything is built for real.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// t12 is the canonical turn: Warm Notebook standardized, all four surfaces.
const turnId = process.argv[2] || "t12";

const SRC = join(root, "Claude Design Wireframe", "Lesson Frame Wireframes.dc.html");
const OUT = join(root, "public", "frame-preview.html");
// Token order matters: colors and typography define the vars that base.css
// consumes, so base must come last.
const TOKEN_ORDER = ["fonts.css", "colors.css", "typography.css", "spacing.css", "base.css"];

if (!existsSync(SRC)) {
  console.error(`Missing ${SRC}\nPull it with DesignSync get_file, or export it from the Design project.`);
  process.exit(1);
}

const html = readFileSync(SRC, "utf8");

// --- design system tokens ------------------------------------------------
function readTokens() {
  const dsRoot = join(root, "Claude Design Wireframe", "_ds");
  if (!existsSync(dsRoot)) return "";
  const system = readdirSync(dsRoot).find((d) => d.startsWith("big-dog-board-design-system"));
  if (!system) return "";
  const tokensDir = join(dsRoot, system, "tokens");
  if (!existsSync(tokensDir)) return "";
  return TOKEN_ORDER
    .filter((f) => existsSync(join(tokensDir, f)))
    .map((f) => `/* ---- tokens/${f} ---- */\n${readFileSync(join(tokensDir, f), "utf8")}`)
    .join("\n");
}

// --- the canvas's own stylesheet ----------------------------------------
// One <style> block in the helmet serves every turn. Take all of it: the extra
// rules for other turns are inert here, and slicing per turn would silently
// drop a shared rule the chosen turn depends on.
function readCanvasCss() {
  const m = html.match(/<style>([\s\S]*?)<\/style>/);
  if (!m) throw new Error("No <style> block found in the canvas helmet.");
  return m[1];
}

// --- the requested turn --------------------------------------------------
function readTurn(id) {
  const start = html.indexOf(`<section class="dv-turn" id="${id}">`);
  if (start === -1) {
    const available = [...html.matchAll(/<section class="dv-turn" id="(t\d+)">/g)].map((m) => m[1]);
    throw new Error(`Turn ${id} not found. Available: ${available.join(", ")}`);
  }
  // Turns are siblings, so the next turn's opening tag is this one's end.
  const next = html.indexOf('<section class="dv-turn"', start + 1);
  return html.slice(start, next === -1 ? html.length : next);
}

// Hard rule 1: no emojis, dingbats, or pictographs in anything this repo
// serves. The Design canvas decorates chips and notes with a pencil glyph;
// the SOURCE .dc.html stays verbatim (it is the fidelity reference), but the
// generated page must not carry them. Already flagged upstream to Design.
function stripGlyphs(markup) {
  // Arrows carry meaning ("warm-up → closeout"), so they become the word
  // rather than a hole. Everything else is decoration; browsers collapse the
  // leftover whitespace, so removal alone is enough.
  return markup
    .replace(/\s*(?:→|➜|⇒)\s*/gu, " to ")
    .replace(/[←-⇿①-⓿☀-➿⬀-⯿\u{1F000}-\u{1FAFF}]️?/gu, "");
}

const turn = stripGlyphs(readTurn(turnId));

const title = (turn.match(/class="dv-tname">([^<]*)</) || [, turnId])[1]
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"');
const blurb = (turn.match(/class="dv-sub">([\s\S]*?)<\/p>/) || [, ""])[1];

// Each option is a self-contained screen. They start at column 0 in the
// generated canvas, which makes a split on the opening tag reliable here.
const options = turn
  .split(/\n(?=<div class="dv-opt")/)
  .slice(1)
  .map((chunk) => {
    const id = (chunk.match(/id="([^"]+)"/) || [, "?"])[1];
    const label = (chunk.match(/data-screen-label="([^"]*)"/) || [, id])[1];
    const role = (chunk.match(/class="rolelbl">([^<]*)</) || [, ""])[1];
    // Keep the card markup exactly as authored - this is the whole point.
    const cardStart = chunk.indexOf('<div class="dv-card">');
    const noteStart = chunk.indexOf('<div class="mnote">');
    const card = cardStart === -1 ? "" : chunk.slice(cardStart, noteStart === -1 ? undefined : noteStart);
    const note = noteStart === -1 ? "" : chunk.slice(noteStart, chunk.lastIndexOf("</div>"));
    return { id, label, role, card, note };
  })
  .filter((o) => o.card);

if (!options.length) throw new Error(`Turn ${turnId} has no extractable screens.`);

// Warm/Blueprint variants are distinguished only by their label text, so group
// on that rather than inventing an id convention Design does not use.
const temperature = (label) => (/blueprint/i.test(label) ? "Blueprint" : "Warm Notebook");

const nav = options
  .map((o) => `<a href="#${o.id}"><b>${o.id}</b> ${o.label.replace(/^\S+\s/, "")}</a>`)
  .join("");

const screens = options
  .map(
    (o) => `
<section class="fp-screen" id="${o.id}">
  <header class="fp-head">
    <span class="fp-id">${o.id}</span>
    <span class="fp-temp">${temperature(o.label)}</span>
    <span class="fp-role">${o.role}</span>
  </header>
  <div class="fp-stage">${o.card}</div>
  ${o.note ? `<div class="fp-note">${o.note}</div>` : ""}
</section>`
  )
  .join("\n");

const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lesson frame preview - ${turnId}</title>
<!--
  GENERATED by scripts/extract-lesson-frames.mjs from
  "Claude Design Wireframe/Lesson Frame Wireframes.dc.html" (${turnId}).
  Do not hand-edit: re-run the script instead.
-->
<style>
${readTokens()}

/* ---- canvas stylesheet, verbatim ---- */
${readCanvasCss()}

/* ---- preview chrome (not part of the design) ---- */
body { background: #e7e2d8; margin: 0; }
.fp-bar { position: sticky; top: 0; z-index: 20; display: flex; align-items: center;
  gap: 14px; flex-wrap: wrap; padding: 12px 22px; background: var(--ink-900);
  color: #fff; font-family: var(--font-body); font-size: 13px; }
.fp-bar h1 { font-size: 14px; color: #fff; margin: 0 12px 0 0; letter-spacing: -0.01em; }
.fp-bar a { color: #fff; text-decoration: none; opacity: .72; padding: 4px 9px;
  border: 1px solid rgba(255,255,255,.28); border-radius: 999px; }
.fp-bar a:hover { opacity: 1; border-color: rgba(255,255,255,.7); }
.fp-bar a b { font-family: var(--font-mono); }
.fp-blurb { padding: 20px 26px 0; max-width: 90ch; font-family: var(--font-body);
  font-size: 14px; line-height: 1.6; color: var(--ink-700); }
.fp-screen { padding: 26px; scroll-margin-top: 58px; }
.fp-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 10px;
  font-family: var(--font-body); }
.fp-id { font-family: var(--font-mono); font-weight: 700; font-size: 12px;
  background: var(--ink-900); color: #fff; border-radius: 4px; padding: 3px 7px; }
.fp-temp { font-family: var(--font-display); font-weight: 800; font-size: 17px;
  color: var(--ink-900); letter-spacing: -0.02em; }
.fp-role { font-size: 13px; color: var(--ink-500); }
.fp-note { max-width: 90ch; margin-top: 12px; }
/* The stages are authored at fixed 1440px geometry. No zoom/scale tricks:
   zoom desynchronizes scroll coordinates from layout (anchor nav lands on
   blank space), and a projector check should see true pixels anyway. On a
   narrower window the stage scrolls sideways inside its own row. */
.fp-stage { overflow-x: auto; }
</style>
</head>
<body>
<div class="fp-bar">
  <h1>Lesson frames - ${turnId}</h1>
  ${nav}
  <a href="?">All</a>
</div>
<p class="fp-blurb">${blurb}</p>
${screens}
<script>
// Solo mode: ?solo=12c (or #12c) shows one screen alone at the top of the
// page - the view you want when putting a single frame on the projector.
(function () {
  var id = new URLSearchParams(location.search).get("solo") || location.hash.slice(1);
  if (!id || !document.getElementById(id)) return;
  document.querySelectorAll(".fp-screen").forEach(function (s) {
    if (s.id !== id) s.style.display = "none";
  });
  var blurb = document.querySelector(".fp-blurb");
  if (blurb) blurb.style.display = "none";
})();
</script>
</body>
</html>
`;

writeFileSync(OUT, page);
console.log(`${turnId}: ${title}`);
for (const o of options) console.log(`  ${o.id}  ${temperature(o.label).padEnd(14)} ${o.role}`);
console.log(`\nWrote ${OUT} (${(page.length / 1024).toFixed(0)} KB)`);
