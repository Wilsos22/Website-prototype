"use client";

// Ladder Method - GCF/LCM by repeated division, plus Factor Trees.
// M1.T1.L2 family (6.NS.4). Two modes, one shared frame.
//
// LADDER: three columns - the divisibility-rule rail on the left (lights up
// when a rule works on BOTH bottom numbers; tap a lit rule to load it), the
// ladder in the center, results on the right. When the ladder closes, the
// divisors line up UNDER it and multiply out step by step to the GCF, then
// extend with the bottom leftovers for the LCM.
//
// FACTOR TREES (Steele's spec, 2026-07-21): the rules own the left third,
// the tree owns the rest. The teacher sets the number sequence ahead of time
// (control-panel Factor Trees field, or ?set=24,36,60 - see lib/factorTreeSet);
// students just get one number at a time, no options. They type BOTH factors
// of a split. A wrong pair nudges the rule rail - "not sure? 2 works". New
// prime branches FLASH until the student taps them; the tap draws a circle
// and a check mark that settles. When every prime is confirmed, the primes
// lift out of the tree and drop onto a line at the bottom, then collapse two
// at a time - highlight 2 x 2, a pop-out asks for 4, the pair becomes 4,
// then 4 x 2 becomes 8 - until the original number stands alone, rebuilt.

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { LiveToolBanner, useLiveToolConfig } from "./useLiveToolConfig";
import { parseFactorTreeSet, serializeFactorTreeSet } from "@/lib/factorTreeSet";

type Mode = "ladder" | "trees";
type LadderPhase = "divide" | "gcf" | "lcm" | "done";
type TreePhase = "grow" | "collect" | "collapse" | "done" | "wrap";

const LADDER_PROBLEMS: [number, number][] = [
  [24, 36], [28, 42], [36, 90], [40, 60], [45, 75], [48, 64],
  [54, 72], [56, 98], [63, 84], [70, 90], [72, 120], [84, 126],
];
const DEFAULT_TREE_SEQ = [24, 36, 48, 60, 72, 90];
const TREE_STORE_KEY = "bdm-ladder-trees-v1";

// Same rule language as /divisibility so the two tools read as one course.
// 7 keeps its honest non-rule because pairs like 56 and 98 need it.
const RULES: [number, string][] = [
  [2, "Last digit is even (0, 2, 4, 6, 8)."],
  [3, "The digit sum is divisible by 3."],
  [4, "The last two digits make a number divisible by 4."],
  [5, "Last digit is 0 or 5."],
  [6, "Passes both the rule for 2 and the rule for 3."],
  [7, "No digit shortcut. Divide to check."],
];
const PRIME_ROWS = new Set([2, 3, 5, 7]);
// Short clauses for "not sure? try 2" nudges after a wrong split.
const RULE_HINT: Record<number, string> = {
  2: "the last digit is even",
  3: "the digits add to a multiple of 3",
  4: "the last two digits divide by 4",
  5: "it ends in 0 or 5",
  6: "it passes the rules for 2 and 3",
  7: "just divide by 7 and check",
};

const START_MSG = "Type a number that divides BOTH numbers, then press Divide. The lit rules on the left all work.";

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

function collectLeaves(n: TNode): { id: number; v: number }[] {
  return n.kids ? [...collectLeaves(n.kids[0]), ...collectLeaves(n.kids[1])] : [{ id: n.id, v: n.v }];
}
function firstCompositeLeaf(n: TNode): TNode | null {
  if (!n.kids) return isPrime(n.v) ? null : n;
  return firstCompositeLeaf(n.kids[0]) ?? firstCompositeLeaf(n.kids[1]);
}

// A factor chain the student multiplies out one step at a time - used by the
// LADDER's GCF and LCM cards.
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

  // ladder state (unchanged from the morning's ship)
  const [problem, setProblem] = useState<[number, number]>(() => LADDER_PROBLEMS[0]);
  const [steps, setSteps] = useState<{ divisor: number; left: number; right: number }[]>([]);
  const [phase, setPhase] = useState<LadderPhase>("divide");
  const [gcfDone, setGcfDone] = useState(false);
  const [divisorDraft, setDivisorDraft] = useState("");

  // tree state
  const idRef = useRef(1);
  const nextId = () => idRef.current++;
  const [seq, setSeq] = useState<number[]>(DEFAULT_TREE_SEQ);
  const [seqSig, setSeqSig] = useState("default");
  const [seqIdx, setSeqIdx] = useState(0);
  const [tree, setTree] = useState<TNode>({ id: 0, v: DEFAULT_TREE_SEQ[0] });
  const [treePhase, setTreePhase] = useState<TreePhase>("grow");
  const [confirmed, setConfirmed] = useState<Set<number>>(() => new Set());
  const [justChecked, setJustChecked] = useState<number | null>(null);
  const [sel, setSel] = useState<number | null>(0);
  const [fA, setFA] = useState("");
  const [fB, setFB] = useState("");
  const [nudgeTick, setNudgeTick] = useState(0);
  const [line, setLine] = useState<number[]>([]);
  const [lineLanded, setLineLanded] = useState(false);
  const [collapseDraft, setCollapseDraft] = useState("");
  const [collapseHint, setCollapseHint] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [popLeft, setPopLeft] = useState<number | null>(null);
  const reducedRef = useRef(false);

  const leafRefs = useRef(new Map<number, HTMLButtonElement>());
  const lineChipRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const lineRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    reducedRef.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  }, []);

  const divisors = steps.map((s) => s.divisor);
  const bottom: [number, number] = steps.length
    ? [steps[steps.length - 1].left, steps[steps.length - 1].right]
    : problem;
  const gcf = product(divisors);
  const rows: [number, number][] = [problem, ...steps.map((s) => [s.left, s.right] as [number, number])];

  const N = seq[seqIdx] ?? seq[0];
  const selNode = useMemo(() => {
    if (sel == null) return null;
    const find = (n: TNode): TNode | null => n.id === sel ? n : n.kids ? (find(n.kids[0]) ?? find(n.kids[1])) : null;
    return find(tree);
  }, [tree, sel]);
  const leaves = useMemo(() => collectLeaves(tree), [tree]);
  const flashing = leaves.filter((l) => isPrime(l.v) && !confirmed.has(l.id));

  // Which rail rows light up right now, and for what value(s).
  const guidance: { values: number[]; live: boolean } = mode === "ladder"
    ? { values: [bottom[0], bottom[1]], live: phase === "divide" }
    : { values: selNode ? [selNode.v] : [], live: treePhase === "grow" && selNode != null };
  const litRules = guidance.live ? RULES.map(([d]) => d).filter((d) => guidance.values.every((v) => v % d === 0)) : [];

  // ------------------------------------------------------------- ladder --

  function resetLadder(next: [number, number]) {
    setProblem(next); setSteps([]); setPhase("divide"); setGcfDone(false); setDivisorDraft("");
    setFeedback(START_MSG);
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

  // -------------------------------------------------------------- trees --

  const loadTreeProblem = useCallback((numbers: number[], sig: string, at: number) => {
    const idx = Math.max(0, Math.min(at, numbers.length - 1));
    const root: TNode = { id: nextId(), v: numbers[idx] };
    setSeq(numbers); setSeqSig(sig); setSeqIdx(idx);
    setTree(root); setTreePhase("grow");
    setConfirmed(new Set()); setJustChecked(null);
    setSel(isPrime(root.v) ? null : root.id);
    setFA(""); setFB(""); setNudgeTick(0);
    setLine([]); setLineLanded(false);
    setCollapseDraft(""); setCollapseHint(null); setMerging(false);
    leafRefs.current.clear();
    setFeedback(isPrime(root.v)
      ? `${numbers[idx]} is flashing - tap it if it is prime.`
      : `Factor ${numbers[idx]}. Type any TWO factors that multiply to it - the lit rules on the left are safe starts.`);
  }, []);

  // Persist progress through the sequence so a reload resumes mid-set.
  useEffect(() => {
    if (mode !== "trees") return;
    try { window.localStorage.setItem(TREE_STORE_KEY, JSON.stringify({ sig: seqSig, idx: seqIdx })); }
    catch { /* progress just will not survive a reload */ }
  }, [mode, seqSig, seqIdx]);

  const resumeIdx = useCallback((sig: string, len: number) => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(TREE_STORE_KEY) || "null");
      if (saved && saved.sig === sig) return Math.max(0, Math.min(Math.round(Number(saved.idx) || 0), len - 1));
    } catch { /* fresh start */ }
    return 0;
  }, []);

  // Teacher sequence arrives via ?set= (link/handout) once on mount...
  useEffect(() => {
    const ns = parseFactorTreeSet(new URLSearchParams(window.location.search).get("set"));
    if (!ns.length) return;
    const sig = `url:${serializeFactorTreeSet(ns)}`;
    setMode("trees");
    loadTreeProblem(ns, sig, resumeIdx(sig, ns.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ...or published live from /control. Keyed on the config id, never the
  // object - the hook re-polls every second (see CLAUDE.md).
  const liveToolId = liveTool?.id;
  useEffect(() => {
    if (!liveTool || liveTool.route !== "/ladder-method") return;
    const ns = parseFactorTreeSet(liveTool.config.set);
    if (!ns.length) return;
    const sig = `live:${serializeFactorTreeSet(ns)}`;
    setMode("trees");
    loadTreeProblem(ns, sig, resumeIdx(sig, ns.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveToolId]);

  function switchMode(m: Mode) {
    if (m === mode) return;
    setMode(m);
    if (m === "ladder") {
      setFeedback(phase === "divide" ? START_MSG : "Pick up where you left off, or start fresh.");
    } else {
      setFeedback(treePhase === "grow"
        ? (isPrime(tree.v) && !tree.kids ? `${tree.v} is flashing - tap it if it is prime.` : `Factor ${N}. Type any TWO factors that multiply to it.`)
        : "Pick up where you left off.");
    }
  }

  function railTap(d: number) {
    if (mode === "ladder") {
      if (phase === "divide") setDivisorDraft(String(d));
      return;
    }
    if (!selNode || treePhase !== "grow") return;
    // Load only the divisor - finding its partner is the student's job.
    setFA(String(d)); setFB("");
  }

  const smallestLit = litRules.find((d) => PRIME_ROWS.has(d)) ?? litRules[0];

  function submitPair(event: FormEvent) {
    event.preventDefault();
    if (!selNode || treePhase !== "grow") return;
    const v = selNode.v;
    const a = Number(fA), b = Number(fB);
    const nudge = () => setNudgeTick((t) => t + 1);
    if (!a || !b) { setFeedback("Type BOTH factors - two numbers that multiply to " + v + "."); nudge(); return; }
    if (a < 2 || b < 2) {
      setFeedback("Use factors that are both 2 or bigger - 1 x anything doesn't break it apart.");
      nudge(); return;
    }
    if (a * b !== v) {
      const hint = smallestLit != null
        ? ` Not sure? Try ${smallestLit} - ${RULE_HINT[smallestLit]}.`
        : " No rule lights up for this one - it needs a bigger prime, like 11 or 13.";
      setFeedback(`${a} x ${b} = ${a * b}, not ${v}.${hint}`);
      nudge(); return;
    }
    const kids: [TNode, TNode] = [{ id: nextId(), v: a }, { id: nextId(), v: b }];
    const grow = (n: TNode): TNode => n.id === selNode.id
      ? { ...n, kids }
      : n.kids ? { ...n, kids: [grow(n.kids[0]), grow(n.kids[1])] } : n;
    const nextTree = grow(tree);
    setTree(nextTree); setFA(""); setFB("");

    const nextComposite = firstCompositeLeaf(nextTree);
    setSel(nextComposite ? nextComposite.id : null);
    const primes = [a, b].filter(isPrime);
    const branchWord = `${v} = ${a} x ${b}.`;
    if (primes.length === 2) {
      setFeedback(`${branchWord} Both branches are flashing - tap each one if it is prime.`);
    } else if (primes.length === 1) {
      setFeedback(`${branchWord} The ${primes[0]} is flashing - tap it if it is prime.${nextComposite ? ` Then keep factoring ${nextComposite.v}.` : ""}`);
    } else {
      setFeedback(`${branchWord} Neither branch is prime yet - keep splitting. Next up: ${nextComposite?.v ?? ""}.`);
    }
  }

  function tapLeaf(n: TNode) {
    if (n.kids || treePhase !== "grow") return;
    if (isPrime(n.v)) {
      if (confirmed.has(n.id)) return;
      // Functional update so two quick taps on two flashing primes both land;
      // the completion effect below watches the set and starts the collect.
      setConfirmed((prev) => { const next = new Set(prev); next.add(n.id); return next; });
      setJustChecked(n.id);
      window.setTimeout(() => setJustChecked((j) => (j === n.id ? null : j)), 1000);
      const compositeLeft = firstCompositeLeaf(tree);
      const othersFlashing = collectLeaves(tree).filter((l) => isPrime(l.v) && !confirmed.has(l.id) && l.id !== n.id).length;
      if (othersFlashing || compositeLeft) {
        setFeedback(`${n.v} is prime - checked.${othersFlashing ? ` ${othersFlashing} more flashing.` : ""}${compositeLeft ? ` Keep factoring ${compositeLeft.v}.` : ""}`);
      }
      return;
    }
    setSel(n.id); setFA(""); setFB("");
    setFeedback(`Factor ${n.v}. Type any TWO factors that multiply to it.`);
  }

  // The collect starts the moment every leaf is a CONFIRMED prime - watched
  // here rather than inside the tap handler so no confirmation can be lost to
  // a stale closure when two flashing primes are tapped back to back.
  useEffect(() => {
    if (mode !== "trees" || treePhase !== "grow") return;
    const ls = collectLeaves(tree);
    if (!ls.length || firstCompositeLeaf(tree)) return;
    if (ls.every((l) => isPrime(l.v) && confirmed.has(l.id))) beginCollect(confirmed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed, tree, treePhase, mode]);

  // Every prime confirmed: the primes lift out of the tree and land on the
  // line at the bottom, outer animation capped well under three seconds.
  function beginCollect(confirmedSet: Set<number>) {
    const sorted = collectLeaves(tree)
      .filter((l) => confirmedSet.has(l.id))
      .sort((p, q) => p.v - q.v);
    setLine(sorted.map((l) => l.v));
    setTreePhase("collect");
    setFeedback("Every prime is confirmed. Watch them line up.");
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      setLineLanded(true);
      if (sorted.length <= 1) {
        setTreePhase("done");
        setFeedback(`${N} is prime - it IS its own factorization.`);
      } else {
        setTreePhase("collapse");
        setFeedback("Now multiply the line back together, two at a time.");
      }
    };
    if (reducedRef.current) { finish(); return; }
    // Hard fallback: a throttled or backgrounded tab may never fire the
    // animation frame below, and the student must not be stranded watching
    // nothing. The whole flight is capped under two seconds either way.
    window.setTimeout(finish, 1900);
    // FLIP the confirmed leaves onto their line slots with cloned chips.
    window.requestAnimationFrame(() => {
      const lineBox = lineRef.current?.getBoundingClientRect();
      if (!lineBox) { finish(); return; }
      const clones: HTMLElement[] = [];
      let maxEnd = 0;
      sorted.forEach((leaf, i) => {
        const src = leafRefs.current.get(leaf.id)?.getBoundingClientRect();
        const dst = lineChipRefs.current[i]?.getBoundingClientRect();
        if (!src || !dst) return;
        const c = document.createElement("div");
        c.className = "ft-fly";
        c.textContent = String(leaf.v);
        c.style.left = `${src.left}px`;
        c.style.top = `${src.top}px`;
        c.style.width = `${Math.max(src.width, 38)}px`;
        c.style.height = `${src.height}px`;
        document.body.appendChild(c);
        clones.push(c);
        const dx = dst.left - src.left, dy = dst.top - src.top;
        const delay = i * 110, dur = 620;
        maxEnd = Math.max(maxEnd, delay + dur);
        try {
          c.animate([
            { transform: "translate(0px, 0px)" },
            { transform: `translate(${dx * 0.2}px, -30px)`, offset: 0.32 },
            { transform: `translate(${dx}px, ${dy}px)` },
          ], { duration: dur, delay, easing: "cubic-bezier(.34,.75,.3,1)", fill: "forwards" });
        } catch { /* very old browser - the timeout below still lands the chips */ }
      });
      window.setTimeout(() => { clones.forEach((c) => c.remove()); finish(); }, maxEnd + 160);
    });
  }

  // Keep the collapse pop-out centered under the pair it is asking about.
  useLayoutEffect(() => {
    if (treePhase !== "collapse" || !lineLanded) { setPopLeft(null); return; }
    const measure = () => {
      const box = lineRef.current?.getBoundingClientRect();
      const c0 = lineChipRefs.current[0]?.getBoundingClientRect();
      const c1 = lineChipRefs.current[1]?.getBoundingClientRect();
      if (!box || !c0 || !c1) { setPopLeft(null); return; }
      setPopLeft((c0.left + c1.right) / 2 - box.left);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [treePhase, lineLanded, line]);

  function submitCollapse(event: FormEvent) {
    event.preventDefault();
    if (merging || line.length < 2) return;
    const [x, y] = line;
    const expected = x * y;
    if (Number(collapseDraft) !== expected) {
      setCollapseHint(`Not yet - ${x} x ${y} = ${expected}.`);
      return;
    }
    setCollapseHint(null); setCollapseDraft(""); setMerging(true);
    window.setTimeout(() => {
      setMerging(false);
      const rest = line.slice(2);
      const nextLine = [expected, ...rest];
      setLine(nextLine);
      if (nextLine.length === 1) {
        setTreePhase("done");
        setFeedback(`${N} - rebuilt from its primes. That is the prime factorization.`);
      } else {
        setFeedback(`${expected} takes their place. Keep going - ${expected} x ${nextLine[1]} next.`);
      }
    }, reducedRef.current ? 0 : 300);
  }

  function nextTreeProblem() {
    if (seqIdx + 1 >= seq.length) {
      setTreePhase("wrap");
      setFeedback("Sequence complete.");
      return;
    }
    loadTreeProblem(seq, seqSig, seqIdx + 1);
  }

  // ------------------------------------------------------------- renders --

  function renderNode(n: TNode): ReactNode {
    const prime = isPrime(n.v);
    const isLeaf = !n.kids;
    const conf = confirmed.has(n.id);
    const flash = isLeaf && prime && !conf && treePhase === "grow";
    const splittable = isLeaf && !prime && treePhase === "grow";
    const dimmed = treePhase !== "grow" && isLeaf && prime;
    return (
      <div className="ft-branch" key={n.id}>
        <button
          type="button"
          ref={(el) => { if (el && isLeaf && prime) leafRefs.current.set(n.id, el); }}
          className={[
            "ft-node",
            prime && conf ? "prime" : "",
            flash ? "flash" : "",
            n.kids ? "opened" : "",
            splittable ? "open" : "",
            sel === n.id && splittable ? "sel" : "",
            dimmed ? "lifted" : "",
          ].filter(Boolean).join(" ")}
          onClick={() => tapLeaf(n)}
          disabled={!isLeaf || treePhase !== "grow" || (prime && conf)}
          aria-label={prime ? (conf ? `${n.v}, confirmed prime` : `${n.v} - tap if prime`) : n.kids ? `${n.v}, already split` : `factor ${n.v}`}
        >
          {n.v}
          {prime && conf && (
            <span className="ft-badge" aria-hidden>
              <svg viewBox="0 0 12 12" width="10" height="10"><polyline points="2,6.5 5,9 10,3" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
          )}
          {justChecked === n.id && (
            <svg className="ft-ring" viewBox="0 0 60 60" aria-hidden>
              <circle className="ft-ring-c" cx="30" cy="30" r="26" pathLength={1} />
              <polyline className="ft-ring-k" points="20,31 27,38 41,23" pathLength={1} />
            </svg>
          )}
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
  const treesActive = mode === "trees";

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
        .lm-seqbar { display:flex; align-items:center; justify-content:center; gap:10px; margin:0 0 10px; }
        .lm-seqbar .cnt { font-weight:800; font-size:0.82rem; color:var(--bdb-ink-soft); }
        .lm-dots { display:flex; gap:5px; }
        .lm-dot { width:9px; height:9px; border-radius:999px; background:var(--bdb-line); }
        .lm-dot.done { background:var(--bdb-green); }
        .lm-dot.now { background:var(--bdb-ink); }

        .lm-cols { display:grid; grid-template-columns:minmax(270px,1fr) minmax(320px,1.4fr) minmax(230px,0.9fr); gap:clamp(12px,2vw,26px); align-items:start; }
        /* Factor Trees: the rules own the left third, the tree owns the rest */
        .lm-cols.treeseq { grid-template-columns:minmax(280px,1fr) minmax(0,2fr); }
        .lm-head { font-size:0.72rem; font-weight:800; letter-spacing:0.07em; text-transform:uppercase; color:var(--bdb-ink-faint); margin-bottom:10px; }

        /* LEFT - the rule rail */
        .lm-row { display:flex; align-items:center; gap:12px; min-height:60px; padding:6px 12px; border-bottom:1px solid var(--bdb-line); opacity:0.45; transition:opacity .25s, background .25s, box-shadow .25s; width:100%; text-align:left; background:transparent; border-top:none; border-left:none; border-right:none; font:inherit; cursor:pointer; }
        .lm-row.hit { opacity:1; background:color-mix(in srgb, var(--bdb-green) 10%, transparent); box-shadow:inset 4px 0 0 var(--bdb-green); }
        .lm-row.hit.nudged { animation:lmNudge .55s ease 2; }
        @keyframes lmNudge { 50% { background:color-mix(in srgb, var(--bdb-green) 28%, transparent); transform:translateX(5px); } }
        .lm-row.idle { cursor:default; }
        .lm-row:disabled { cursor:default; }
        .lm-d { font-weight:900; font-size:1.6rem; min-width:52px; letter-spacing:-0.01em; color:var(--bdb-ink); }
        .lm-row.hit .lm-d { color:var(--bdb-green); }
        .lm-rt { font-size:0.92rem; font-weight:600; line-height:1.3; color:var(--bdb-ink-soft); }
        .lm-row.hit .lm-rt { color:var(--bdb-ink); font-weight:700; }
        .lm-works { margin-left:auto; font-weight:900; font-size:0.72rem; letter-spacing:0.06em; text-transform:uppercase; color:var(--bdb-green); white-space:nowrap; }
        .lm-prime-dot { font-size:0.62rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; color:var(--bdb-ink-faint); border:1px solid var(--bdb-line); border-radius:999px; padding:2px 7px; margin-left:6px; }
        .lm-railnote { padding:10px 12px; margin-top:2px; border:2px dashed color-mix(in srgb, var(--bdb-amber) 60%, var(--bdb-line)); background:color-mix(in srgb, var(--bdb-amber) 10%, transparent); font-size:0.85rem; font-weight:700; line-height:1.35; color:var(--bdb-ink); }

        /* CENTER - ladder (unchanged) */
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

        /* CENTER - the factor tree */
        .ft-panel { border:1px solid var(--bdb-line); border-radius:14px; background:var(--bdb-card); padding:16px 10px 0; display:grid; gap:12px; justify-items:center; }
        .ft-branch { display:flex; flex-direction:column; align-items:center; }
        .ft-node { position:relative; font:inherit; font-weight:800; font-variant-numeric:tabular-nums; font-size:clamp(1.1rem,2.6vw,1.5rem); min-width:54px; min-height:50px; padding:4px 11px; border-radius:12px; border:2px solid var(--bdb-ink); background:var(--bdb-card); color:var(--bdb-ink); display:grid; place-items:center; animation:lmPop 260ms ease; }
        .ft-node.open { border-style:dashed; cursor:pointer; }
        .ft-node.open:hover { background:color-mix(in srgb, var(--bdb-amber) 12%, var(--bdb-card)); }
        .ft-node.sel { border-color:var(--bdb-amber); border-style:solid; box-shadow:0 0 0 3px color-mix(in srgb, var(--bdb-amber) 45%, transparent); }
        .ft-node.opened { opacity:0.55; border-color:var(--bdb-ink-faint); box-shadow:none; }
        .ft-node.flash { cursor:pointer; border-color:var(--bdb-amber); animation:ftFlash 1.05s ease-in-out infinite; }
        @keyframes ftFlash { 50% { box-shadow:0 0 0 6px color-mix(in srgb, var(--bdb-amber) 42%, transparent); transform:scale(1.07); } }
        .ft-node.prime { border-color:var(--bdb-green); color:var(--bdb-green); border-radius:999px; background:color-mix(in srgb, var(--bdb-green) 10%, var(--bdb-card)); }
        .ft-node.lifted { opacity:0.28; }
        .ft-badge { position:absolute; top:-8px; right:-8px; width:19px; height:19px; border-radius:999px; background:var(--bdb-green); display:grid; place-items:center; }
        .ft-ring { position:absolute; inset:-8px; width:calc(100% + 16px); height:calc(100% + 16px); pointer-events:none; overflow:visible; }
        .ft-ring-c { fill:none; stroke:var(--bdb-green); stroke-width:3; stroke-dasharray:1; stroke-dashoffset:1; animation:ftDraw .4s cubic-bezier(.4,.75,.35,1) forwards; }
        .ft-ring-k { fill:none; stroke:var(--bdb-green); stroke-width:4; stroke-linecap:round; stroke-linejoin:round; stroke-dasharray:1; stroke-dashoffset:1; animation:ftDraw .26s ease .34s forwards; }
        @keyframes ftDraw { to { stroke-dashoffset:0; } }
        .ft-kids { display:flex; align-items:flex-start; margin-top:14px; position:relative; }
        .ft-kid { position:relative; padding:14px 7px 0; }
        .ft-kid::before { content:""; position:absolute; top:0; height:2px; background:var(--bdb-ink-faint); }
        .ft-kid:first-child::before { left:50%; right:0; }
        .ft-kid:last-child::before { left:0; right:50%; }
        .ft-kid::after { content:""; position:absolute; top:0; left:50%; width:2px; height:14px; background:var(--bdb-ink-faint); transform:translateX(-50%); }

        /* the landing line at the bottom of the panel */
        .ft-line { position:relative; width:calc(100% + 20px); margin:6px -10px 0; border-top:3px solid var(--bdb-ink); background:color-mix(in srgb, var(--bdb-ground) 55%, var(--bdb-card)); border-radius:0 0 13px 13px; min-height:72px; display:flex; gap:9px; align-items:center; justify-content:center; padding:12px 14px 14px; flex-wrap:wrap; }
        .ft-line-label { position:absolute; top:-12px; left:12px; font-size:0.66rem; font-weight:900; letter-spacing:0.09em; text-transform:uppercase; color:var(--bdb-ink-faint); background:var(--bdb-card); padding:0 8px; border-radius:999px; border:1px solid var(--bdb-line); }
        .ft-lc { min-width:44px; padding:6px 12px; border-radius:999px; border:2px solid var(--bdb-green); background:color-mix(in srgb, var(--bdb-green) 12%, var(--bdb-card)); color:var(--bdb-green); font-weight:900; font-size:1.2rem; text-align:center; font-variant-numeric:tabular-nums; transition:transform .28s ease, opacity .28s ease; }
        .ft-lc.pending { opacity:0; }
        .ft-lc.hot { border-color:var(--bdb-amber); background:color-mix(in srgb, var(--bdb-amber) 18%, var(--bdb-card)); color:var(--bdb-brown); animation:ftHot 1s ease-in-out infinite; }
        @keyframes ftHot { 50% { box-shadow:0 0 0 5px color-mix(in srgb, var(--bdb-amber) 38%, transparent); } }
        .ft-lc.m0 { transform:translateX(26px) scale(.7); opacity:0; }
        .ft-lc.m1 { transform:translateX(-26px) scale(.7); opacity:0; }
        .ft-lc.final { border-color:var(--bdb-ink); background:var(--bdb-ink); color:#fff; font-size:1.5rem; animation:ftBorn .4s cubic-bezier(.3,.8,.35,1); }
        @keyframes ftBorn { 0% { transform:scale(.5); opacity:0; } 60% { transform:scale(1.15); } 100% { transform:none; opacity:1; } }
        .ft-empty { color:var(--bdb-ink-faint); font-size:0.85rem; font-weight:650; }
        .ft-fly { position:fixed; z-index:60; display:grid; place-items:center; border:2px solid var(--bdb-green); background:color-mix(in srgb, var(--bdb-green) 14%, #fff); color:var(--bdb-green); font-family:var(--bdb-font); font-weight:900; font-size:1.1rem; border-radius:999px; pointer-events:none; }
        .ft-pop { position:absolute; bottom:calc(100% + 10px); transform:translateX(-50%); background:var(--bdb-card); border:2px solid var(--bdb-ink); border-radius:12px; padding:8px 12px; display:flex; gap:8px; align-items:center; font-weight:900; font-size:1.15rem; box-shadow:0 6px 0 color-mix(in srgb, var(--bdb-ink) 25%, transparent); animation:ftPopIn .26s cubic-bezier(.3,.8,.35,1) both; z-index:5; white-space:nowrap; }
        @keyframes ftPopIn { from { transform:translateX(-50%) translateY(10px) scale(.7); opacity:0; } to { transform:translateX(-50%) translateY(0) scale(1); opacity:1; } }
        .ft-pop input { width:76px; min-height:44px; border:2px solid var(--bdb-line); border-radius:9px; background:var(--bdb-ground); text-align:center; font-family:inherit; font-weight:900; font-size:1.15rem; color:var(--bdb-ink); }
        .ft-pop input:focus { outline:none; border-color:var(--bdb-amber); }
        .ft-pop button { min-height:44px; padding:0 14px; border:none; border-radius:9px; background:var(--bdb-ink); color:#fff; font-family:inherit; font-weight:800; cursor:pointer; }
        .ft-pop .hint { position:absolute; top:calc(100% + 6px); left:50%; transform:translateX(-50%); color:var(--bdb-coral); font-size:0.82rem; font-weight:750; white-space:nowrap; }

        .lm-splitform { display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:center; font-weight:800; font-size:1.1rem; margin-top:12px; }
        .lm-splitform input { width:70px; min-height:46px; border:2px dashed var(--bdb-amber); border-radius:10px; background:var(--bdb-card); text-align:center; font-family:inherit; font-weight:800; font-size:1.2rem; color:var(--bdb-ink); }
        .lm-splitform input:focus { outline:none; border-style:solid; }
        .lm-splitform button { min-height:46px; padding:0 18px; border:none; border-radius:10px; background:var(--bdb-coral); color:#fff; font-family:inherit; font-weight:800; cursor:pointer; }

        /* RIGHT - ladder results */
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

        @media (max-width: 940px) {
          .lm-cols, .lm-cols.treeseq { grid-template-columns:1fr; }
          .lm-fam { min-height:0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .lm-lrow, .lm-card, .ft-node, .lm-result, .ft-pop { animation:none !important; }
          .ft-node.flash { animation:none !important; box-shadow:0 0 0 4px color-mix(in srgb, var(--bdb-amber) 42%, transparent); }
          .ft-ring-c, .ft-ring-k { animation:none !important; stroke-dashoffset:0 !important; }
          .lm-row.hit.nudged { animation:none !important; }
          .ft-lc, .ft-lc.final { transition:none !important; animation:none !important; }
          .ft-lc.hot { animation:none !important; }
        }
      `}</style>

      <LiveToolBanner tool={liveTool} />

      <div className="lm-top">
        <div className="lm-seg" role="tablist" aria-label="tool mode">
          <button className={mode === "ladder" ? "on" : ""} onClick={() => switchMode("ladder")}>Ladder - GCF and LCM</button>
          <button className={mode === "trees" ? "on" : ""} onClick={() => switchMode("trees")}>Factor Trees</button>
        </div>
        {mode === "ladder" && LADDER_PROBLEMS.slice(0, 6).map(([a, b]) => (
          <button key={`${a}-${b}`} className={`lm-pill ${problem[0] === a && problem[1] === b ? "on" : ""}`} onClick={() => resetLadder([a, b])}>{a} and {b}</button>
        ))}
      </div>

      {treesActive && treePhase !== "wrap" && (
        <div className="lm-seqbar">
          <span className="cnt">Number {seqIdx + 1} of {seq.length}</span>
          <span className="lm-dots">
            {seq.map((_, i) => <span key={i} className={`lm-dot ${i < seqIdx ? "done" : i === seqIdx ? "now" : ""}`} />)}
          </span>
        </div>
      )}

      <div className="lm-feedback" role="status">{feedback}</div>

      {treesActive && treePhase === "wrap" ? (
        <div className="lm-card" style={{ maxWidth: 520, margin: "0 auto" }}>
          <p className="lm-h">Sequence complete</p>
          <p className="lm-sub">You factored all {seq.length} numbers down to primes and rebuilt every one of them.</p>
          <div className="lm-actions" style={{ marginTop: 0 }}>
            <button className="lm-btn primary" onClick={() => loadTreeProblem(seq, seqSig, 0)}>Run it again</button>
            <button className="lm-btn" onClick={() => switchMode("ladder")}>Try the Ladder</button>
          </div>
        </div>
      ) : (
      <div className={`lm-cols ${treesActive ? "treeseq" : ""}`.trim()}>
        {/* LEFT: the rule rail */}
        <div>
          <div className="lm-head">Division guidance</div>
          {RULES.map(([d, text]) => {
            const hit = litRules.includes(d);
            return (
              <button
                key={`${d}-${hit ? nudgeTick : "x"}`}
                type="button"
                className={`lm-row ${hit ? "hit" : "idle"} ${hit && nudgeTick > 0 ? "nudged" : ""}`.trim()}
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
              : "Splitting by primes keeps the tree short. Tap a lit rule to load that factor pair."}
          </div>
        </div>

        {/* CENTER: the workspace */}
        <div>
          <div className="lm-head">{mode === "ladder" ? "The ladder" : "The factor tree"}</div>

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

          {treesActive && (
            <>
              <div className="ft-panel">
                {renderNode(tree)}

                {/* the landing line - primes lift out of the tree and drop here */}
                <div className="ft-line" ref={lineRef}>
                  <span className="ft-line-label">The primes</span>
                  {line.length === 0 && <span className="ft-empty">Your confirmed primes will land here.</span>}
                  {line.map((v, i) => {
                    const isFinal = treePhase === "done" && line.length === 1;
                    const hot = treePhase === "collapse" && lineLanded && !merging && i < 2;
                    const mergeCls = merging && i === 0 ? "m0" : merging && i === 1 ? "m1" : "";
                    return (
                      <Fragment key={`${seqIdx}-${line.length}-${i}-${v}`}>
                        {i > 0 && <span className="lm-x">x</span>}
                        <span
                          ref={(el) => { lineChipRefs.current[i] = el; }}
                          className={`ft-lc ${!lineLanded ? "pending" : ""} ${hot ? "hot" : ""} ${mergeCls} ${isFinal ? "final" : ""}`.trim()}
                        >
                          {v}
                        </span>
                      </Fragment>
                    );
                  })}

                  {treePhase === "collapse" && lineLanded && popLeft != null && line.length >= 2 && (
                    <form className="ft-pop" style={{ left: popLeft }} onSubmit={submitCollapse}>
                      <span>{line[0]} x {line[1]} =</span>
                      <input inputMode="numeric" value={collapseDraft} autoFocus
                        onChange={(e) => { setCollapseDraft(e.target.value.replace(/\D/g, "")); setCollapseHint(null); }}
                        aria-label={`${line[0]} times ${line[1]}`} />
                      <button type="submit">Go</button>
                      {collapseHint && <span className="hint">{collapseHint}</span>}
                    </form>
                  )}
                </div>
              </div>

              {treePhase === "grow" && selNode && (
                <form className="lm-splitform" onSubmit={submitPair}>
                  <span>{selNode.v} =</span>
                  <input inputMode="numeric" value={fA}
                    onChange={(e) => setFA(e.target.value.replace(/\D/g, ""))}
                    aria-label="first factor" autoFocus />
                  <span className="lm-x">x</span>
                  <input inputMode="numeric" value={fB}
                    onChange={(e) => setFB(e.target.value.replace(/\D/g, ""))}
                    aria-label="second factor" />
                  <button type="submit">Split</button>
                </form>
              )}

              {treePhase === "done" && (
                <div className="lm-actions">
                  <button className="lm-btn primary" onClick={nextTreeProblem}>
                    {seqIdx + 1 >= seq.length ? "Finish the sequence" : "Next number"}
                  </button>
                  <button className="lm-btn" onClick={() => loadTreeProblem(seq, seqSig, seqIdx)}>Do this one again</button>
                </div>
              )}
            </>
          )}
        </div>

        {/* RIGHT: ladder results only - trees give the width to the tree */}
        {mode === "ladder" && (
          <div>
            <div className="lm-head">What you have earned</div>
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
          </div>
        )}
      </div>
      )}

      {mode === "ladder" && (
        <div className="lm-actions">
          <button className="lm-btn" onClick={() => resetLadder(problem)}>Start over</button>
          <button className="lm-btn" onClick={() => resetLadder(pickLadder(problem))}>New numbers</button>
        </div>
      )}
    </main>
  );
}
