// Extract the classroom-surface CSS from the approved Claude Design handoff
// so the wireframe IS the look of the live surfaces, not a reimplementation.
//
// Reads the handoff .dc.html plus the design-system token files it links, and
// writes src/styles/classroom-frames.css with every selector namespaced under
// .dcw so none of the handoff's short class names (.dark, .board, .steps...)
// can collide with existing pages. Token variables are scoped onto .dcw too,
// so nothing leaks site-wide - /control stays dark, cream pages stay cream.
//
// Usage: node scripts/extract-classroom-frames.mjs "<path to Claude Design Wireframe dir>"
// Re-run whenever a new handoff revision lands; the output is committed.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const wireframeDir = process.argv[2];
if (!wireframeDir) {
  console.error("Usage: node scripts/extract-classroom-frames.mjs <wireframe dir>");
  process.exit(1);
}

const HANDOFF = "M2.T1.L1-handoff-2026-07-15.dc.html";
const DS = "_ds/big-dog-board-design-system-901ffe04-7731-4cc5-9afa-a3dee8db0fed";

const html = readFileSync(join(wireframeDir, HANDOFF), "utf-8");
const blocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
if (blocks.length !== 1) {
  console.error(`Expected exactly 1 style block in the handoff, found ${blocks.length}.`);
  process.exit(1);
}

// Token variables: collect every :root {...} body from the linked token files
// and re-scope it to .dcw. fonts.css only carries Google Fonts @imports, which
// must stay top-level.
const tokenFiles = ["colors.css", "typography.css", "spacing.css"];
let tokenVars = "";
let fontImports = "";
for (const file of ["fonts.css", ...tokenFiles]) {
  const css = readFileSync(join(wireframeDir, DS, "tokens", file), "utf-8");
  // Quote-aware: Google Fonts URLs contain semicolons (wght@400;500;...), so
  // "match to the first ;" truncates mid-URL and leaves an unclosed string.
  for (const imp of css.matchAll(/@import\s+url\((?:'[^']*'|"[^"]*"|[^)]*)\)[^;\n]*;/g)) {
    fontImports += `${imp[0]}\n`;
  }
  for (const root of css.matchAll(/:root\s*\{([\s\S]*?)\}/g)) tokenVars += root[1].trim() + "\n";
}

// Namespace every selector in the handoff block under .dcw. Handles selector
// lists, keeps @media wrappers, prefixes selectors inside them, and leaves
// @keyframes bodies alone.
function namespace(rawCss) {
  // Strip comments first - a comment glued to a selector otherwise rides
  // along in the selector text and breaks prefixing.
  const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, "");
  let out = "";
  let i = 0;
  while (i < css.length) {
    const rest = css.slice(i);
    const atMatch = rest.match(/^\s*@(media|supports)[^{]*\{/);
    const kfMatch = rest.match(/^\s*@keyframes[^{]*\{/);
    if (kfMatch) {
      // copy the whole @keyframes block verbatim
      let depth = 0;
      let j = i + kfMatch[0].length;
      depth = 1;
      while (j < css.length && depth > 0) {
        if (css[j] === "{") depth++;
        if (css[j] === "}") depth--;
        j++;
      }
      out += css.slice(i, j);
      i = j;
      continue;
    }
    if (atMatch) {
      // recurse into the @media body
      let depth = 1;
      let j = i + atMatch[0].length;
      const bodyStart = j;
      while (j < css.length && depth > 0) {
        if (css[j] === "{") depth++;
        if (css[j] === "}") depth--;
        j++;
      }
      out += css.slice(i, bodyStart) + namespace(css.slice(bodyStart, j - 1)) + "}";
      i = j;
      continue;
    }
    const ruleMatch = rest.match(/^([^{}]+)\{/);
    if (!ruleMatch) {
      out += rest;
      break;
    }
    const selectors = ruleMatch[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (s === ":root" || s === "body" || s === "html" ? ".dcw" : `.dcw ${s}`))
      .join(", ");
    let depth = 1;
    let j = i + ruleMatch[0].length;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth++;
      if (css[j] === "}") depth--;
      j++;
    }
    out += `${selectors} {${css.slice(i + ruleMatch[0].length, j)}\n`;
    i = j;
  }
  return out;
}

const header = `/* GENERATED - do not hand-edit.
 * Source: Claude Design handoff ${HANDOFF} + its _ds token files.
 * Regenerate: node scripts/extract-classroom-frames.mjs "<wireframe dir>"
 * Every selector is namespaced under .dcw so the handoff short class
 * names cannot collide with existing pages, and token variables are scoped
 * to .dcw so nothing leaks site-wide. The wireframe IS the look; live
 * surfaces supply content into it, never restyle it. */
`;

const output = `${header}${fontImports}
.dcw {
${tokenVars}}

${namespace(blocks[0])}
`;

const outPath = "src/styles/classroom-frames.css";
writeFileSync(outPath, output);
console.log(`Wrote ${outPath}: ${output.length} bytes, fonts: ${fontImports.split("\n").filter(Boolean).length} imports`);
