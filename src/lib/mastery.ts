// Mastery engine — faithful TypeScript port of the validated prototype
// ("Big Dog Math - Mock Data"/build_dashboard.py + the semester mastery feed),
// plus the per-standard stage gates from FABLE_WORKORDER_data_spine.md §3.
//
// Pure functions, no dependencies — verified against the Python prototype by
// scripts/mastery-golden.mjs (golden file generated from the real mock CSVs).

// Canonical i-Ready domain names (match supabase/proficiency.sql + iready CSV).
export const DOMAINS = [
  "Number and Operations",
  "Algebra and Algebraic Thinking",
  "Measurement and Data",
  "Geometry",
] as const;
export type Domain = (typeof DOMAINS)[number];

// Warm-up Topic → domain (port of build_dashboard.py TOPIC_DOMAIN).
export const TOPIC_DOMAIN: Record<string, Domain> = {
  "Ratios & Proportional Reasoning": "Number and Operations",
  "Fractions & Decimals Operations": "Number and Operations",
  "Expressions": "Algebra and Algebraic Thinking",
  "Equations & Inequalities": "Algebra and Algebraic Thinking",
  "Geometry: Area & Volume": "Geometry",
  "Statistics & Data": "Measurement and Data",
};

export type EvidenceSource = "warmup" | "tier1" | "tier2" | "tool";
export type Stage = "not_started" | "developing" | "approaching" | "mastered" | "complete";

export interface MasteryEvent {
  at: string; // ISO date (YYYY-MM-DD or full timestamp) — chronological order matters
  domain: Domain;
  standardId?: string;
  source: EvidenceSource;
  scorePct: number; // 0..100 (use warmupScoreToPct for 0–5 warm-up scores)
  sbacCorrect?: boolean; // tier2 only: the SBAC-modeled item was answered correctly
}

// Mirrors the mastery_config table (supabase/proficiency.sql). DB values can
// override these defaults at read time; keep the two in sync.
export interface MasteryConfig {
  alphaTier2: number;
  alphaTier1: number;
  alphaWarmup: number;
  cutGotIt: number;
  cutAlmost: number;
  initScaleMin: number;
  initScaleMax: number;
  initFloor: number;
  initCeiling: number;
  completeMinCheckpoints: number;
  completeMinSpanDays: number;
  approachingMinEvents: number; // accuracy-only evidence needed to reach 'approaching'
}

export const DEFAULT_CONFIG: MasteryConfig = {
  alphaTier2: 0.4,
  alphaTier1: 0.2,
  alphaWarmup: 0.3,
  cutGotIt: 80,
  cutAlmost: 50,
  initScaleMin: 480,
  initScaleMax: 660,
  initFloor: 5,
  initCeiling: 98,
  completeMinCheckpoints: 2,
  completeMinSpanDays: 21,
  approachingMinEvents: 3,
};

// i-Ready Fall scale score → 0–100 starting mastery (exact port of
// scale_to_mastery: unparseable input falls back to 50).
export function scaleToMastery(scale: number | string | null | undefined, cfg: MasteryConfig = DEFAULT_CONFIG): number {
  const x = typeof scale === "number" ? scale : parseFloat(String(scale ?? ""));
  if (!Number.isFinite(x)) return 50;
  const pct = ((x - cfg.initScaleMin) / (cfg.initScaleMax - cfg.initScaleMin)) * 100;
  return Math.max(cfg.initFloor, Math.min(cfg.initCeiling, pct));
}

export function warmupScoreToPct(score0to5: number): number {
  return (score0to5 / 5) * 100;
}

export function alphaFor(source: EvidenceSource, cfg: MasteryConfig = DEFAULT_CONFIG): number {
  if (source === "tier2") return cfg.alphaTier2;
  if (source === "tier1") return cfg.alphaTier1;
  return cfg.alphaWarmup; // warmup + tool work carry the daily weight
}

// One EWMA step: m_new = (1 − α)·m_old + α·score%
export function ewmaStep(prev: number, scorePct: number, alpha: number): number {
  return (1 - alpha) * prev + alpha * scorePct;
}

export interface DomainMastery {
  percent: Record<Domain, number>;
  history: Record<Domain, number[]>; // starts at init, appends after each event
}

// Replay all events (chronological) over the initial per-domain values —
// port of compute() in build_dashboard.py, generalized to per-source α.
export function replayDomains(
  init: Record<Domain, number>,
  events: MasteryEvent[],
  cfg: MasteryConfig = DEFAULT_CONFIG,
): DomainMastery {
  const percent = { ...init };
  const history = Object.fromEntries(DOMAINS.map((d) => [d, [init[d]]])) as Record<Domain, number[]>;
  const sorted = [...events].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  for (const e of sorted) {
    percent[e.domain] = ewmaStep(percent[e.domain], e.scorePct, alphaFor(e.source, cfg));
    history[e.domain].push(percent[e.domain]);
  }
  return { percent, history };
}

const DAY_MS = 24 * 60 * 60 * 1000;
function spanDays(aIso: string, bIso: string): number {
  return Math.abs(new Date(bIso).getTime() - new Date(aIso).getTime()) / DAY_MS;
}

// Stage gates for ONE standard's events. The teacher's rule: accuracy alone can
// never claim mastery —
//   not_started  — no evidence
//   developing   — evidence accruing (accuracy-only, below the approaching bar)
//   approaching  — the CEILING for MC/accuracy-only work, however high the avg;
//                  also where a regressed (bombed-latest-checkpoint) student lands
//   mastered     — a Tier-2 checkpoint ≥ cutGotIt (paper, work shown = produced reasoning)
//   complete     — sustained: ≥ completeMinCheckpoints Tier-2s ≥ cutGotIt spanning
//                  ≥ completeMinSpanDays, AND the SBAC-modeled (transfer) item correct
// Regression: latest Tier-2 < cutAlmost contradicts mastered/complete → approaching.
export function deriveStage(events: MasteryEvent[], cfg: MasteryConfig = DEFAULT_CONFIG): Stage {
  if (events.length === 0) return "not_started";
  const sorted = [...events].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const tier2 = sorted.filter((e) => e.source === "tier2");

  if (tier2.length > 0) {
    const latest = tier2[tier2.length - 1];
    const gotIt = tier2.filter((e) => e.scorePct >= cfg.cutGotIt);
    const regressed = latest.scorePct < cfg.cutAlmost;

    if (!regressed && gotIt.length >= cfg.completeMinCheckpoints) {
      const span = spanDays(gotIt[0].at, gotIt[gotIt.length - 1].at);
      const transfer = gotIt.some((e) => e.sbacCorrect === true);
      if (span >= cfg.completeMinSpanDays && transfer) return "complete";
    }
    if (!regressed && gotIt.length >= 1) return "mastered";
    return "approaching"; // attempted checkpoints (or regressed) — reasoning bar not currently met
  }

  // Accuracy-only path (warm-ups, quick-checks, tools): capped at 'approaching'.
  return sorted.length >= cfg.approachingMinEvents ? "approaching" : "developing";
}

// Live flags — port of flagFor(): submission rate < 50% → not submitting;
// mean domain mastery < 45 → consistently low; else on track.
export type Flag = "not_submitting" | "consistently_low" | "on_track";
export function flagFor(meanMastery: number, submitted: number, possible: number): Flag {
  const subRate = submitted / Math.max(1, possible);
  if (subRate < 0.5) return "not_submitting";
  if (meanMastery < 45) return "consistently_low";
  return "on_track";
}
