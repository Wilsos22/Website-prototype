"use client";

// Ladder Method - GCF/LCM by repeated division, plus Factor Trees.
// M1.T1.L2 family (6.NS.4). Two modes, one shared frame:
//
//   LEFT   the divisibility-rule rail (the reference), one row per divisor,
//          lighting up live: in Ladder mode a rule lights when it works on
//          BOTH bottom numbers; in Trees mode when it works on the node you
//          are splitting. Tapping a lit rule loads that divisor for you.
//   CENTER the workspace - the ladder itself, or one/two factor trees.
//   RIGHT  what the work has earned - pulled-out factors, then GCF and LCM.
//
// Same three-column convention as /divisibility (the reference
// implementation). When the ladder closes, the divisors line up UNDER the
// ladder and the student multiplies them out for the GCF, then extends with
// the leftovers for the LCM. When a tree finishes, its prime leaves line up
// under the tree the same way; with two trees the shared primes pair up and
// multiply out to the same GCF the ladder would give.

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { LiveToolBanner, useLiveToolConfig } from "./useLiveToolConfig";

type Mode = "ladder" | "trees";
type LadderPhase = "divide" | "gcf" | "lcm" | "done";

const LADDER_PROBLEMS: [number, number][] = [
  [24, 36], [28, 42], [36, 90], [40, 60], [45, 75], [48, 64],
  [54, 72], [56, 98], [63, 84], [70, 90], [72, 120], [84, 126],
];
const TREE_NUMBERS = [24, 36, 48, 60, 72, 90];

// Same rule language as /divisibility so the two tools read as one course.
// 7 keeps its honest non-rule here because ladder pairs like 56 and 98 need it.
const RULES: [number, string][] = [
  [2, "Last digit is even (0, 2, 4, 6, 8)."],
  [3, "The digit sum is divisible by 3."],
  [4, "The last two digits make a number divisible by 4."],
  [5, "Last digit is 0 or 5."],
  [6, "Passes both the rule for 2 and the rule for 3."],
  [7, "No digit shortcut. Divide to check."],
];
const PRIME_ROWS = new Set([2, 3, 5, 7]);

const START_MSG = "Type a number that divides BOTH numbers, then press Divide. The lit rules on the left all work.";
const TREE_MSG = "Tap a number with a dashed ring, then split it into two factors. Lit rules work on it.";

function gcdOf(a: number, b: number) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) { const t = b; b = a % b; a = t; }
  return a;
}
function product(values: number[]) {
  return values.reduce((t, v) => t * v, 1);
}
function isPrime(n: number) {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}
function pickLadder(current?: [number, number]): [number, number] {
  const pool = LADDER_PROBLEMS.filter(([a, b]) => !current || a !== current[0] || b !== current[1]);
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---------------------------------------------------------------- trees ----

interface TNode { id: number; v: number; kids?: [TNode, TNode] }

function treeLeaves(n: TNode): number[] {
  return n.kids ? [...treeLeaves(n.kids[0]), ...treeLeaves(n.kids[1])] : [n.v];
}
function treeDone(n: TNode): boolean {
  return n.kids ? treeDone(n.kids[0]) && treeDone(n.kids[1]) : isPrime(n.v);
}
function findNode(n: TNode, id: number): TNode | null {
  if (n.id === id) return n;
  if (!n.kids) return null;
  return findNode(n.kids[0], id) ?? findNode(n.kids[1], id);
}
function firstCompositeLeaf(n: TNode): TNode | null {
  if (!n.kids) return isPrime(n.v) ? null : n;
  return firstCompositeLeaf(n.kids[0]) ?? firstCompositeLeaf(n.kids[1]);
}
// The multiset of primes two factorizations share - the tree route to the GCF.
function sharedPrimes(a: number[], b: number[]): number[] {
  const counts = new Map<number, number>();
  b.forEach((p) => counts.set(p, (counts.get(p) ?? 0) + 1));
  const out: number[] = [];
  [...a].sort((x, y) => x - y).forEach((p) => {
    const c = counts.get(p) ?? 0;
    if (c > 0) { out.push(p); counts.set(p, c - 1); }
  });
  return out;
}
// Which chip indexes to highlight as "shared" in one tree's leaf list.
function sharedIndexes(leaves: number[], shared: number[]): Set<number> {
  const counts = new Map<number, number>();
  shared.forEach((p) => counts.set(p, (counts.get(p) ?? 0) + 1));
  const out = new Set<number>();
  leaves.forEach((p, i) => {
    const c = counts.get(p) ?? 0;
    if (c > 0) { out.add(i); counts.set(p, c - 1); }
  });
  return out;
}

// A factor chain the student multiplies out one step at a time:
//   2 x 2 x 3   ->   "2 x 2 = ?"  ->  "4 x 3 = ?"  ->  done.
// Used for the GCF under the ladder, the LCM, and rebuilding a tree's number.
function MultiplyOut({ factors, tone, onDone, doneText }: {
  factors: number[];
  tone: "amber" | "teal" | "green";
  onDone?: () => void;
  doneText: string;
}) {
  const [idx, setIdx] = useState(1);
  const [draft, setDraft] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const firedRef = useRef(false);
  const running = product(factors.slice(0, idx));
  const complete = idx >= factors.length;

  useEffect(() => {
    if (complete && !firedRef.current) { firedRef.current = true; onDone?.(); }
  }, [complete, onDone]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const f = factors[idx];
    const expected = running * f;
    if (Number(draft) !== expected) {
      setHint(`Not yet - ${running} x ${f} = ${expected}. Type it in and keep the chain going.`);
      return;
    }
    setHint(null); setDraft(""); setIdx(idx + 1);
  }

  return (
    <div className="lm-multiply">
      <div className="lm-chain" aria-label="factors to multiply">
        {factors.map((f, i) => (
          <Fragment key={i}>
            {i > 0 && <span className="lm-x">x</span>}
            <span className={`lm-chip ${tone} ${i < idx ? "used" : ""}`}>{f}</span>
          </Fragment>
        ))}
        <span className="lm-x">=</span>
        {complete
          ? <span className={`lm-total ${tone}`}>{running}</span>
          : <span className="lm-chip hole">?</span>}
      </div>
      {complete ? (
        <div className="lm-doneline">{doneText}</div>
      ) : (
        <form className="lm-mform" onSubmit={submit}>
          <span className="lm-mprompt">{running} x {factors[idx]} =</span>
          <input inputMode="numeric" value={draft} aria-label="running product"
            onChange={(e) => { setDraft(e.target.value.replace(/\D/g, "")); }} autoFocus />
          <button type="submit">Check</button>
        </form>
      )}
      {hint && <div className="lm-mhint">{hint}</div>}
    </div>
  );
}

// ----------------------------------------------------------------- main ----

export default function LadderMethodTool() {
  const liveTool = useLiveToolConfig("/ladder-method");
  const [mode, setMode] = useState<Mode>("ladder");
  const [feedback, setFeedback] = useState(START_MSG);

  // ladder state
  const [problem, setProblem] = useState<[number, number]>(() => LADDER_PROBLEMS[0]);
  const [steps, setSteps] = useState<{ divisor: number; left: number; right: number }[]>([]);
  const [phase, setPhase] = useState<LadderPhase>("divide");
  const [gcfDone, setGcfDone] = useState(false);
  const [divisorDraft, setDivisorDraft] = useState("");

  // tree state
  const idRef = useRef(1);
  const nextId = () => idRef.current++;
  const [trees, setTrees] = useState<TNode[]>([{ id: 0, v: TREE_NUMBERS[0] }]);
  const [treeSig, setTreeSig] = useState("one:24"); // remounts the multiply-outs on a new setup
  const [sel, setSel] = useState<number | null>(0);
  const [splitDraft, setSplitDraft] = useState("");

  const divisors = steps.map((s) => s.divisor);
  const bottom: [number, number] = steps.length
    ? [steps[steps.length - 1].left, steps[steps.length - 1].right]
    : problem;
  const gcf = product(divisors);
  const rows: [number, number][] = [problem, ...steps.map((s) => [s.left, s.right] as [number, number])];

  const selNode = useMemo(() => {
    if (sel == null) return null;
    for (const t of trees) { const n = findNode(t, sel); if (n) return n; }
    return null;
  }, [trees, sel]);

  const allTreesDone = trees.every(treeDone);
  const treeLeafLists = useMemo(() => trees.map((t) => treeLeaves(t).sort((a, b) => a - b)), [trees]);
  const duoShared = useMemo(
    () => (trees.length === 2 && allTreesDone ? sharedPrimes(treeLeafLists[0], treeLeafLists[1]) : []),
    [trees.length, allTreesDone, treeLeafLists],
  );

  // Which rail rows light up right now, and for what value(s).
  const guidance: { values: number[]; live: boolean } = mode === "ladder"
    ? { values: [bottom[0], bottom[1]], live: phase === "divide" }
    : { values: selNode ? [selNode.v] : [], live: selNode != null };

  // ------------------------------------------------------------- actions --

  function resetLadder(next: [number, number]) {
    setProblem(next); setSteps([]); setPhase("divide"); setGcfDone(false); setDivisorDraft("");
    setFeedback(START_MSG);
  }

  function loadTrees(values: number[], sig: string) {
    const roots = values.map((v) => ({ id: nextId(), v }));
    setTrees(roots); setTreeSig(sig);
    setSel(roots[0].id); setSplitDraft("");
    setFeedback(TREE_MSG);
  }

  function switchMode(m: Mode) {
    if (m === mode) return;
    setMode(m);
    setFeedback(m === "ladder" ? (phase === "divide" ? START_MSG : "Pick up where you left off, or start fresh.") : TREE_MSG);
  }

  function railTap(d: number) {
    if (mode === "ladder") {
      if (phase !== "divide") return;
      setDivisorDraft(String(d));
    } else {
      if (!selNode) return;
      setSplitDraft(String(d));
    }
  }

  function submitDivisor(event: FormEvent) {
    event.preventDefault();
    const d = Number(divisorDraft);
    if (!d || d < 2) { setFeedback("Enter a whole number 2 or greater."); return; }
    const [l, r] = bottom;
    if (l % d !== 0 || r % d !== 0) {
      const lr = l % d, rr = r % d;
      setFeedback(`${d} doesn't divide both - ${l} ÷ ${d} ${lr ? `leaves ${lr}` : "is whole"}, ${r} ÷ ${d} ${rr ? `leaves ${rr}` : "is whole"}. A rule has to light up for BOTH numbers.`);
      return;
    }
    const nl = l / d, nr = r / d;
    const next = [...steps, { divisor: d, left: nl, right: nr }];
    setSteps(next); setDivisorDraft("");
    if (gcdOf(nl, nr) === 1) {
      setPhase("gcf");
      setFeedback(next.length === 1
        ? `${nl} and ${nr} share nothing bigger than 1, so the ladder is done after one rung.`
        : `${nl} and ${nr} share nothing bigger than 1 - the ladder is closed. Multiply the side factors for the GCF.`);
    } else {
      setFeedback(`${l} ÷ ${d} = ${nl} and ${r} ÷ ${d} = ${nr}. They still share a factor - a rule on the left is still lit.`);
    }
  }

  function tapNode(n: TNode) {
    if (n.kids || isPrime(n.v)) return;
    setSel(n.id); setSplitDraft("");
  }

  function submitSplit(event: FormEvent) {
    event.preventDefault();
    if (!selNode) return;
    const v = selNode.v;
    const d = Number(splitDraft);
    if (!d || d < 2 || d >= v) { setFeedback(`Pick a factor of ${v} between 2 and ${v - 1}.`); return; }
    if (v % d !== 0) {
      setFeedback(`${d} is not a factor - ${v} ÷ ${d} leaves ${v % d}. Try a rule that lights up.`);
      return;
    }
    const kids: [TNode, TNode] = [{ id: nextId(), v: d }, { id: nextId(), v: v / d }];
    const grow = (n: TNode): TNode => n.id === selNode.id
      ? { ...n, kids }
      : n.kids ? { ...n, kids: [grow(n.kids[0]), grow(n.kids[1])] } : n;
    const nextTrees = trees.map(grow);
    setTrees(nextTrees); setSplitDraft("");

    const nextTarget = nextTrees.map(firstCompositeLeaf).find(Boolean) ?? null;
    setSel(nextTarget ? nextTarget.id : null);
    const branchWord = `${v} = ${d} x ${v / d}`;
    if (nextTarget) {
      const primes = [d, v / d].filter(isPrime);
      setFeedback(`${branchWord}. ${primes.length === 2 ? "Both branches are prime - they circle themselves." : primes.length === 1 ? `${primes[0]} is prime, so that branch is finished.` : "Neither branch is prime yet - keep splitting."} Next up: ${nextTarget.v}.`);
    } else {
      setFeedback(trees.length === 2 || nextTrees.length === 2
        ? "Every branch ends in a prime. Compare the two trees - the shared primes multiply out to the GCF."
        : "Every branch ends in a prime. Multiply the primes back together to prove they rebuild your number.");
    }
  }

  // ------------------------------------------------------------- renders --

  function renderNode(n: TNode) {
    const prime = isPrime(n.v);
    const splittable = !n.kids && !prime;
    return (
      <div className="ft-branch" key={n.id}>
        <button
          type="button"
          className={`ft-node ${prime ? "prime" : ""} ${n.kids ? "opened" : ""} ${splittable ? "open" : ""} ${sel === n.id ? "sel" : ""}`}
          onClick={() => tapNode(n)}
          disabled={!splittable}
          aria-label={prime ? `${n.v}, prime` : n.kids ? `${n.v}, already split` : `split ${n.v}`}
        >
          {n.v}
        </button>
        {n.kids && (
          <div className="ft-kids">
            <div className="ft-kid">{renderNode(n.kids[0])}</div>
            <div className="ft-kid">{renderNode(n.kids[1])}</div>
          </div>
        )}
      </div>
    );
  }

  const ladderDivisorList = divisors.length > 0;

  return (
    <main className="lm-wrap">
      <style>{`
        .lm-wrap { font-family:var(--bdb-font); color:var(--bdb-ink); background:var(--bdb-ground); min-height:100%; padding:12px clamp(10px,2.5vw,20px) 34px; max-width:1240px; margin:0 auto; }
        .lm-top { display:flex; gap:10px; justify-content:center; align-items:center; flex-wrap:wrap; margin-bottom:8px; }
        .lm-seg { display:inline-flex; border:2px solid var(--bdb-line); border-radius:22px; overflow:hidden; background:var(--bdb-card); }
        .lm-seg button { font:inherit; font-weight:800; font-size:0.86rem; min-height:44px; padding:0 18px; border:none; background:transparent; color:var(--bdb-ink-soft); cursor:pointer; }
        .lm-seg button.on { background:var(--bdb-ink); color:#fff; }
        .lm-pill { font:inherit; font-weight:800; font-size:0.92rem; min-height:40px; padding:0 15px; border-radius:999px; border:1px solid var(--bdb-line); background:var(--bdb-card); color:var(--bdb-ink-soft); cursor:pointer; }
        .lm-pill.on { background:var(--bdb-ink); color:#fff; border-color:var(--bdb-ink); }
        .lm-feedback { text-align:center; min-height:44px; margin:0 auto 12px; max-width:760px; border:1px solid var(--bdb-line); border-radius:12px; background:var(--bdb-card); color:var(--bdb-ink-soft); font-weight:650; line-height:1.35; padding:10px 16px; }

        .lm-cols { display:grid; grid-template-columns:minmax(270px,1fr) minmax(320px,1.4fr) minmax(230px,0.9fr); gap:clamp(12px,2vw,26px); align-items:start; }
        /* two trees need real width to sit side by side, so the workspace column
           grows and the guide columns give a little back */
        .lm-cols.trees { grid-template-columns:minmax(240px,0.85fr) minmax(0,2fr) minmax(180px,0.6fr); }
        .lm-head { font-size:0.72rem; font-weight:800; letter-spacing:0.07em; text-transform:uppercase; color:var(--bdb-ink-faint); margin-bottom:10px; }

        /* LEFT - the rule rail */
        .lm-row { display:flex; align-items:center; gap:12px; min-height:60px; padding:6px 12px; border-bottom:1px solid var(--bdb-line); opacity:0.45; transition:opacity .25s, background .25s, box-shadow .25s; width:100%; text-align:left; background:transparent; border-top:none; border-left:none; border-right:none; font:inherit; cursor:pointer; }
        .lm-row.hit { opacity:1; background:color-mix(in srgb, var(--bdb-green) 10%, transparent); box-shadow:inset 4px 0 0 var(--bdb-green); }
        .lm-row.idle { cursor:default; }
        .lm-row:disabled { cursor:default; }
        .lm-d { font-weight:900; font-size:1.6rem; min-width:52px; letter-spacing:-0.01em; color:var(--bdb-ink); }
        .lm-row.hit .lm-d { color:var(--bdb-green); }
        .lm-rt { font-size:0.92rem; font-weight:600; line-height:1.3; color:var(--bdb-ink-soft); }
        .lm-row.hit .lm-rt { color:var(--bdb-ink); font-weight:700; }
        .lm-works { margin-left:auto; font-weight:900; font-size:0.72rem; letter-spacing:0.06em; text-transform:uppercase; color:var(--bdb-green); white-space:nowrap; }
        .lm-prime-dot { font-size:0.62rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; color:var(--bdb-ink-faint); border:1px solid var(--bdb-line); border-radius:999px; padding:2px 7px; margin-left:6px; }
        .lm-railnote { padding:10px 12px; margin-top:2px; border:2px dashed color-mix(in srgb, var(--bdb-amber) 60%, var(--bdb-line)); background:color-mix(in srgb, var(--bdb-amber) 10%, transparent); font-size:0.85rem; font-weight:700; line-height:1.35; color:var(--bdb-ink); }

        /* CENTER - ladder */
        .lm-stack { display:grid; gap:4px; }
        .lm-lrow, .lm-band, .lm-entry { display:grid; grid-template-columns:96px 1fr 1fr; gap:10px; align-items:center; }
        .lm-lrow { animation:lmPop 240ms ease; }
        @keyframes lmPop { from { opacity:0; transform:translateY(-8px) scale(.96); } to { opacity:1; transform:none; } }
        .lm-num { min-height:64px; border:2px solid var(--bdb-ink); border-radius:12px; background:var(--bdb-card); display:grid; place-items:center; font-weight:800; font-variant-numeric:tabular-nums; font-size:clamp(1.7rem,5vw,2.6rem); box-shadow:0 4px 0 var(--bdb-ink); }
        .lm-lrow.big .lm-num { min-height:84px; font-size:clamp(2.2rem,7vw,3.6rem); }
        .lm-lrow.bottomrow .lm-num { border-color:var(--bdb-teal); box-shadow:0 4px 0 var(--bdb-teal); }
        .lm-side { display:grid; place-items:center; }
        .lm-divisor { min-height:48px; border:2px solid var(--bdb-amber); border-radius:12px; background:color-mix(in srgb, var(--bdb-amber) 18%, var(--bdb-card)); color:var(--bdb-brown); font-weight:800; font-size:clamp(1.2rem,3vw,1.7rem); display:inline-flex; align-items:center; gap:4px; padding:4px 12px; font-variant-numeric:tabular-nums; }
        .lm-dx { color:var(--bdb-ink-faint); font-weight:800; }
        .lm-arrow { display:grid; place-items:center; color:var(--bdb-ink-faint); font-size:1.3rem; font-weight:800; }
        .lm-inwrap { display:inline-flex; align-items:center; gap:6px; border:2px dashed var(--bdb-amber); border-radius:12px; background:var(--bdb-card); padding:4px 10px; }
        .lm-inwrap input { width:58px; min-height:42px; border:none; outline:none; background:transparent; font-family:inherit; font-weight:800; text-align:center; font-size:clamp(1.3rem,4vw,1.8rem); color:var(--bdb-ink); font-variant-numeric:tabular-nums; }
        .lm-go { grid-column:2 / span 2; min-height:50px; border:none; border-radius:12px; background:var(--bdb-coral); color:#fff; font-family:inherit; font-weight:800; font-size:1rem; cursor:pointer; }
        .lm-go:hover { filter:brightness(1.05); }

        /* CENTER - under-ladder multiply-outs */
        .lm-card { border:1px solid var(--bdb-line); border-radius:14px; background:var(--bdb-card); padding:clamp(12px,2.5vw,18px); display:grid; gap:10px; margin-top:14px; animation:lmPop 240ms ease; }
        .lm-h { margin:0; font-size:0.98rem; font-weight:800; color:var(--bdb-ink); }
        .lm-h .tag { font-size:0.68rem; font-weight:800; letter-spacing:0.1em; text-transform:uppercase; padding:3px 9px; border-radius:999px; margin-left:8px; vertical-align:middle; }
        .tag.gcf { background:color-mix(in srgb, var(--bdb-amber) 22%, transparent); color:var(--bdb-brown); }
        .tag.lcm { background:color-mix(in srgb, var(--bdb-teal) 20%, transparent); color:var(--bdb-teal); }
        .lm-sub { color:var(--bdb-ink-faint); font-size:0.85rem; font-weight:650; line-height:1.35; margin:0; }

        .lm-multiply { display:grid; gap:8px; }
        .lm-chain { display:flex; flex-wrap:wrap; gap:7px; align-items:center; font-weight:800; font-size:1.15rem; }
        .lm-chip { min-width:42px; padding:5px 11px; border-radius:10px; border:1px solid var(--bdb-line); text-align:center; font-variant-numeric:tabular-nums; background:var(--bdb-ground); transition:background .2s; }
        .lm-chip.amber { background:color-mix(in srgb, var(--bdb-amber) 16%, var(--bdb-ground)); }
        .lm-chip.teal { background:color-mix(in srgb, var(--bdb-teal) 16%, var(--bdb-ground)); }
        .lm-chip.green { background:color-mix(in srgb, var(--bdb-green) 14%, var(--bdb-ground)); }
        .lm-chip.used { outline:2px solid color-mix(in srgb, var(--bdb-ink) 30%, transparent); }
        .lm-chip.hole { border-style:dashed; color:var(--bdb-ink-faint); }
        .lm-x { color:var(--bdb-ink-faint); font-weight:800; }
        .lm-total { font-size:1.5rem; font-weight:900; }
        .lm-total.amber { color:var(--bdb-brown); } .lm-total.teal { color:var(--bdb-teal); } .lm-total.green { color:var(--bdb-green); }
        .lm-mform { display:flex; flex-wrap:wrap; gap:10px; align-items:center; font-weight:800; font-size:1.1rem; }
        .lm-mform input { width:88px; min-height:46px; border:2px solid var(--bdb-line); border-radius:10px; background:var(--bdb-ground); text-align:center; font-family:inherit; font-weight:800; font-size:1.2rem; color:var(--bdb-ink); font-variant-numeric:tabular-nums; }
        .lm-mform input:focus { outline:none; border-color:var(--bdb-teal); }
        .lm-mform button { min-height:46px; padding:0 16px; border:none; border-radius:10px; background:var(--bdb-ink); color:#fff; font-family:inherit; font-weight:800; cursor:pointer; }
        .lm-mhint { color:var(--bdb-coral); font-weight:750; font-size:0.92rem; }
        .lm-doneline { font-weight:800; font-size:1.05rem; color:var(--bdb-green); }

        /* CENTER - factor trees */
        .ft-duo { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:clamp(10px,2vw,20px); align-items:start; }
        .ft-panel { border:1px solid var(--bdb-line); border-radius:14px; background:var(--bdb-card); padding:14px 8px 12px; display:grid; gap:10px; justify-items:center; }
        .ft-branch { display:flex; flex-direction:column; align-items:center; }
        .ft-node { font:inherit; font-weight:800; font-variant-numeric:tabular-nums; font-size:clamp(1.05rem,2.4vw,1.4rem); min-width:52px; min-height:48px; padding:4px 10px; border-radius:12px; border:2px solid var(--bdb-ink); background:var(--bdb-card); color:var(--bdb-ink); display:grid; place-items:center; animation:lmPop 260ms ease; }
        .ft-node.open { border-style:dashed; cursor:pointer; }
        .ft-node.open:hover { background:color-mix(in srgb, var(--bdb-amber) 12%, var(--bdb-card)); }
        .ft-node.sel { border-color:var(--bdb-amber); border-style:solid; box-shadow:0 0 0 3px color-mix(in srgb, var(--bdb-amber) 45%, transparent); }
        .ft-node.opened { opacity:0.55; border-color:var(--bdb-ink-faint); box-shadow:none; }
        .ft-node.prime { border-color:var(--bdb-green); color:var(--bdb-green); border-radius:999px; background:color-mix(in srgb, var(--bdb-green) 10%, var(--bdb-card)); animation:ftSettle 340ms ease; }
        @keyframes ftSettle { 0% { transform:scale(.7); opacity:0; } 60% { transform:scale(1.12); } 100% { transform:none; opacity:1; } }
        .ft-kids { display:flex; align-items:flex-start; margin-top:14px; position:relative; }
        .ft-kid { position:relative; padding:14px 7px 0; }
        .ft-kid::before { content:""; position:absolute; top:0; height:2px; background:var(--bdb-ink-faint); }
        .ft-kid:first-child::before { left:50%; right:0; }
        .ft-kid:last-child::before { left:0; right:50%; }
        .ft-kid::after { content:""; position:absolute; top:0; left:50%; width:2px; height:14px; background:var(--bdb-ink-faint); transform:translateX(-50%); }
        .ft-stem { width:2px; height:14px; background:var(--bdb-ink-faint); margin-top:-2px; }
        .ft-under { border-top:1px dashed var(--bdb-line); width:100%; padding-top:10px; display:grid; gap:8px; justify-items:center; }
        .ft-leaves { display:flex; flex-wrap:wrap; gap:6px; align-items:center; font-weight:800; font-size:1.05rem; justify-content:center; }
        .ft-leafchip { min-width:38px; padding:4px 9px; border-radius:999px; border:2px solid var(--bdb-green); color:var(--bdb-green); background:color-mix(in srgb, var(--bdb-green) 10%, var(--bdb-card)); text-align:center; font-variant-numeric:tabular-nums; }
        .ft-leafchip.shared { background:var(--bdb-green); color:#fff; }
        .ft-leafchip.ghost { border-style:dashed; color:var(--bdb-ink-faint); border-color:var(--bdb-line); background:transparent; }
        .ft-eq { color:var(--bdb-ink-faint); font-weight:800; }
        .ft-rootlabel { font-weight:900; font-size:1rem; color:var(--bdb-ink); }

        /* RIGHT - results */
        .lm-fam { border:2px solid var(--bdb-line); background:var(--bdb-card); border-radius:14px; padding:12px; display:grid; gap:10px; min-height:120px; }
        .lm-fam-empty { color:var(--bdb-ink-faint); font-size:0.9rem; line-height:1.5; margin:0; }
        .lm-pulled { display:flex; flex-wrap:wrap; gap:6px; align-items:center; font-weight:800; }
        .lm-result { border-radius:12px; padding:12px; display:grid; place-items:center; gap:2px; animation:lmPop 260ms ease; }
        .lm-result.gcf { background:color-mix(in srgb, var(--bdb-amber) 22%, var(--bdb-card)); }
        .lm-result.lcm { background:color-mix(in srgb, var(--bdb-teal) 18%, var(--bdb-card)); }
        .lm-result b { font-size:1.9rem; font-weight:800; font-variant-numeric:tabular-nums; color:var(--bdb-ink); }
        .lm-result span { font-size:0.68rem; font-weight:800; letter-spacing:0.12em; text-transform:uppercase; color:var(--bdb-ink-soft); }
        .lm-result.wait { background:var(--bdb-ground); border:1px dashed var(--bdb-line); }
        .lm-result.wait b { color:var(--bdb-ink-faint); }

        .lm-actions { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-top:16px; }
        .lm-btn { min-height:46px; padding:0 20px; border:1px solid var(--bdb-line); border-radius:999px; background:var(--bdb-card); color:var(--bdb-ink); font-family:inherit; font-weight:700; cursor:pointer; }
        .lm-btn.primary { background:var(--bdb-teal); border-color:var(--bdb-teal); color:#fff; }
        .lm-btn:hover { filter:brightness(1.03); }
        .lm-splitform { display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:center; font-weight:800; font-size:1.05rem; margin-top:12px; }
        .lm-splitform input { width:70px; min-height:46px; border:2px dashed var(--bdb-amber); border-radius:10px; background:var(--bdb-card); text-align:center; font-family:inherit; font-weight:800; font-size:1.2rem; color:var(--bdb-ink); }
        .lm-splitform input:focus { outline:none; border-style:solid; }
        .lm-splitform button { min-height:46px; padding:0 18px; border:none; border-radius:10px; background:var(--bdb-coral); color:#fff; font-family:inherit; font-weight:800; cursor:pointer; }

        @media (max-width: 940px) {
          .lm-cols, .lm-cols.trees { grid-template-columns:1fr; }
          .lm-fam { min-height:0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .lm-lrow, .lm-card, .ft-node, .lm-result { animation:none !important; }
          .ft-node.prime { animation:none !important; }
        }
      `}</style>

      <LiveToolBanner tool={liveTool} />

      <div className="lm-top">
        <div className="lm-seg" role="tablist" aria-label="tool mode">
          <button className={mode === "ladder" ? "on" : ""} onClick={() => switchMode("ladder")}>Ladder - GCF and LCM</button>
          <button className={mode === "trees" ? "on" : ""} onClick={() => switchMode("trees")}>Factor Trees</button>
        </div>
        {mode === "trees" && (
          <>
            <div className="lm-seg" aria-label="how many trees">
              <button className={trees.length === 1 ? "on" : ""} onClick={() => loadTrees([TREE_NUMBERS[0]], `one:${TREE_NUMBERS[0]}`)}>One number</button>
              <button className={trees.length === 2 ? "on" : ""} onClick={() => { const [a, b] = LADDER_PROBLEMS[0]; loadTrees([a, b], `two:${a}x${b}`); }}>Two side by side</button>
            </div>
            {trees.length === 1
              ? TREE_NUMBERS.map((n) => (
                  <button key={n} className={`lm-pill ${trees[0]?.v === n ? "on" : ""}`} onClick={() => loadTrees([n], `one:${n}`)}>{n}</button>
                ))
              : LADDER_PROBLEMS.slice(0, 6).map(([a, b]) => (
                  <button key={`${a}-${b}`} className={`lm-pill ${trees[0]?.v === a && trees[1]?.v === b ? "on" : ""}`} onClick={() => loadTrees([a, b], `two:${a}x${b}`)}>{a} and {b}</button>
                ))}
          </>
        )}
        {mode === "ladder" && LADDER_PROBLEMS.slice(0, 6).map(([a, b]) => (
          <button key={`${a}-${b}`} className={`lm-pill ${problem[0] === a && problem[1] === b ? "on" : ""}`} onClick={() => resetLadder([a, b])}>{a} and {b}</button>
        ))}
      </div>

      <div className="lm-feedback" role="status">{feedback}</div>

      <div className={`lm-cols ${mode === "trees" && trees.length === 2 ? "trees" : ""}`.trim()}>
        {/* LEFT: the rule rail */}
        <div>
          <div className="lm-head">Division guidance</div>
          {RULES.map(([d, text]) => {
            const relevant = guidance.live && guidance.values.length > 0;
            const hit = relevant && guidance.values.every((v) => v % d === 0);
            return (
              <button
                key={d}
                type="button"
                className={`lm-row ${hit ? "hit" : "idle"}`}
                onClick={() => hit && railTap(d)}
                disabled={!hit}
                aria-label={hit ? `divide by ${d}` : `rule for ${d}`}
              >
                <span className="lm-d">÷{d}</span>
                <span className="lm-rt">
                  {text}
                  {PRIME_ROWS.has(d) && <span className="lm-prime-dot">prime</span>}
                </span>
                {hit && <span className="lm-works">{mode === "ladder" ? "works on both" : "works"}</span>}
              </button>
            );
          })}
          <div className="lm-railnote">
            {mode === "ladder"
              ? "A divisor only counts when it works on BOTH numbers. Tap a lit rule to load it."
              : "Splitting by primes keeps the tree short. Tap a lit rule to load it."}
          </div>
        </div>

        {/* CENTER: the workspace */}
        <div>
          <div className="lm-head">{mode === "ladder" ? "The ladder" : trees.length === 2 ? "Two factor trees" : "The factor tree"}</div>

          {mode === "ladder" && (
            <>
              <div className="lm-stack">
                {rows.map((pair, i) => {
                  const isBottom = phase !== "divide" && i === rows.length - 1;
                  return (
                    <Fragment key={i}>
                      <div className={`lm-lrow${i === 0 ? " big" : ""}${isBottom ? " bottomrow" : ""}`}>
                        <div className="lm-side" />
                        <div className="lm-num">{pair[0]}</div>
                        <div className="lm-num">{pair[1]}</div>
                      </div>
                      {i < steps.length && (
                        <div className="lm-band">
                          <div className="lm-side">
                            <span className="lm-divisor"><span className="lm-dx">÷</span>{steps[i].divisor}</span>
                          </div>
                          <div className="lm-arrow">↓</div>
                          <div className="lm-arrow">↓</div>
                        </div>
                      )}
                    </Fragment>
                  );
                })}
                {phase === "divide" && (
                  <form className="lm-entry" onSubmit={submitDivisor}>
                    <div className="lm-side">
                      <span className="lm-inwrap">
                        <span className="lm-dx">÷</span>
                        <input inputMode="numeric" value={divisorDraft}
                          onChange={(e) => setDivisorDraft(e.target.value.replace(/\D/g, ""))}
                          aria-label="Divisor that divides both numbers" autoFocus />
                      </span>
                    </div>
                    <button className="lm-go" type="submit">Divide both</button>
                  </form>
                )}
              </div>

              {phase !== "divide" && (
                <div className="lm-card">
                  <p className="lm-h">The factors you pulled out<span className="tag gcf">GCF</span></p>
                  <p className="lm-sub">The side of the ladder, multiplied out, is the greatest common factor.</p>
                  <MultiplyOut
                    key={`gcf-${problem[0]}x${problem[1]}-${divisors.join(".")}`}
                    factors={divisors}
                    tone="amber"
                    doneText={`GCF = ${gcf}`}
                    onDone={() => setGcfDone(true)}
                  />
                  {phase === "gcf" && gcfDone && (
                    <div className="lm-actions" style={{ marginTop: 0 }}>
                      <button className="lm-btn primary" onClick={() => { setPhase("lcm"); setFeedback("The LCM is the GCF times both leftovers at the bottom of the ladder - the whole L shape."); }}>
                        Build the LCM next
                      </button>
                    </div>
                  )}
                </div>
              )}

              {(phase === "lcm" || phase === "done") && (
                <div className="lm-card">
                  <p className="lm-h">The L shape<span className="tag lcm">LCM</span></p>
                  <p className="lm-sub">GCF times the two leftovers along the bottom.</p>
                  <MultiplyOut
                    key={`lcm-${problem[0]}x${problem[1]}`}
                    factors={[gcf, bottom[0], bottom[1]]}
                    tone="teal"
                    doneText={`LCM = ${gcf * bottom[0] * bottom[1]}`}
                    onDone={() => { setPhase("done"); setFeedback(`GCF ${gcf}, LCM ${gcf * bottom[0] * bottom[1]}. The ladder gave you both.`); }}
                  />
                </div>
              )}
            </>
          )}

          {mode === "trees" && (
            <>
              <div className="ft-duo">
                {trees.map((t, ti) => {
                  const leaves = treeLeafLists[ti];
                  const done = treeDone(t);
                  const marks = trees.length === 2 && duoShared.length > 0 ? sharedIndexes(leaves, duoShared) : new Set<number>();
                  return (
                    <div className="ft-panel" key={t.id}>
                      <span className="ft-rootlabel">{t.v}</span>
                      {renderNode(t)}
                      <div className="ft-under">
                        <div className="ft-leaves" aria-label={`prime factors of ${t.v}`}>
                          {done ? (
                            <>
                              <span className="ft-eq">{t.v} =</span>
                              {leaves.map((p, i) => (
                                <Fragment key={i}>
                                  {i > 0 && <span className="ft-eq">x</span>}
                                  <span className={`ft-leafchip ${marks.has(i) ? "shared" : ""}`}>{p}</span>
                                </Fragment>
                              ))}
                            </>
                          ) : (
                            <>
                              <span className="ft-eq">primes so far:</span>
                              {leaves.filter(isPrime).length === 0 && <span className="ft-leafchip ghost">none yet</span>}
                              {leaves.filter(isPrime).map((p, i) => (
                                <span className="ft-leafchip" key={i}>{p}</span>
                              ))}
                            </>
                          )}
                        </div>
                        {done && trees.length === 1 && (
                          <MultiplyOut
                            key={`rebuild-${treeSig}`}
                            factors={leaves}
                            tone="green"
                            doneText={`The primes rebuild ${t.v}. That is the prime factorization.`}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {selNode && (
                <form className="lm-splitform" onSubmit={submitSplit}>
                  <span>Split {selNode.v}: divide by</span>
                  <input inputMode="numeric" value={splitDraft}
                    onChange={(e) => setSplitDraft(e.target.value.replace(/\D/g, ""))}
                    aria-label={`factor to split ${selNode.v} by`} autoFocus />
                  <button type="submit">Split</button>
                </form>
              )}

              {trees.length === 2 && allTreesDone && (
                <div className="lm-card">
                  <p className="lm-h">The primes both trees share<span className="tag gcf">GCF</span></p>
                  <p className="lm-sub">Solid green chips appear in BOTH trees. Multiply just those - that is the GCF, same as the ladder finds.</p>
                  {duoShared.length > 0 ? (
                    <MultiplyOut
                      key={`duogcf-${treeSig}`}
                      factors={duoShared}
                      tone="green"
                      doneText={`GCF = ${product(duoShared)} - try the same pair on the Ladder and watch it agree.`}
                    />
                  ) : (
                    <p className="lm-sub">These two share no primes at all, so the GCF is 1.</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* RIGHT: what the work has earned */}
        <div>
          <div className="lm-head">{mode === "ladder" ? "What you have earned" : "How to read it"}</div>
          {mode === "ladder" ? (
            <div className="lm-fam">
              {ladderDivisorList ? (
                <div className="lm-pulled" aria-label="divisors pulled out so far">
                  {divisors.map((d, i) => (
                    <Fragment key={i}>
                      {i > 0 && <span className="lm-x">x</span>}
                      <span className="lm-chip amber">{d}</span>
                    </Fragment>
                  ))}
                </div>
              ) : (
                <p className="lm-fam-empty">Every divisor you pull out lands here. Together they will build the GCF.</p>
              )}
              {phase === "divide" && ladderDivisorList && (
                <p className="lm-fam-empty">Bottom of the ladder: {bottom[0]} and {bottom[1]}. Keep dividing until they share nothing.</p>
              )}
              <div className={`lm-result gcf ${phase === "divide" ? "wait" : ""}`.trim()}>
                <b>{phase === "divide" ? "?" : gcf}</b>
                <span>GCF</span>
              </div>
              <div className={`lm-result lcm ${phase === "done" ? "" : "wait"}`.trim()}>
                <b>{phase === "done" ? gcf * bottom[0] * bottom[1] : "?"}</b>
                <span>LCM</span>
              </div>
            </div>
          ) : (
            <div className="lm-fam">
              <p className="lm-fam-empty">Dashed ring = still splittable. Tap it, pick a factor, and it branches.</p>
              <p className="lm-fam-empty">Green circle = prime. Primes stop - they only split into 1 and themselves.</p>
              <p className="lm-fam-empty">{trees.length === 2
                ? "When both trees are done, the primes they SHARE turn solid green - multiply those for the GCF."
                : "When every branch ends green, the primes underneath multiply back into your number."}</p>
            </div>
          )}
        </div>
      </div>

      <div className="lm-actions">
        {mode === "ladder" ? (
          <>
            <button className="lm-btn" onClick={() => resetLadder(problem)}>Start over</button>
            <button className="lm-btn" onClick={() => resetLadder(pickLadder(problem))}>New numbers</button>
          </>
        ) : (
          <>
            <button className="lm-btn" onClick={() => loadTrees(trees.map((t) => t.v), `${treeSig}-r${Date.now()}`)}>Start over</button>
            {trees.length === 1 ? (
              <button className="lm-btn" onClick={() => { const n = TREE_NUMBERS[(TREE_NUMBERS.indexOf(trees[0].v) + 1) % TREE_NUMBERS.length]; loadTrees([n], `one:${n}`); }}>Next number</button>
            ) : (
              <button className="lm-btn" onClick={() => { const [a, b] = pickLadder([trees[0].v, trees[1].v]); loadTrees([a, b], `two:${a}x${b}`); }}>New pair</button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
