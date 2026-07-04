// Full mastery rebuild for one period — replay every raw log (responses +
// checkpoint_results) through the golden-tested EWMA engine and rewrite
// mastery + mastery_history. Shared by /api/mastery/recompute and the
// checkpoint CSV upload (which recomputes affected periods automatically).
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DOMAINS, TOPIC_DOMAIN, DEFAULT_CONFIG, scaleToMastery, warmupScoreToPct,
  replayDomains, deriveStage, ewmaStep, alphaFor,
  type Domain, type MasteryEvent, type EvidenceSource, type MasteryConfig,
} from "@/lib/mastery";

const isDomain = (d: unknown): d is Domain => typeof d === "string" && (DOMAINS as readonly string[]).includes(d);

export interface RecomputeSummary {
  students: number;
  masteryRows: number;
  historyRows: number;
  domainEventsReplayed: number;
}

export async function recomputePeriod(
  db: SupabaseClient,
  periodId: string,
  cfg: MasteryConfig = DEFAULT_CONFIG,
): Promise<RecomputeSummary | { error: string; status: number }> {
  const { data: students, error: sErr } = await db
    .from("students").select("id").eq("period_id", periodId);
  if (sErr) return { error: sErr.message, status: 500 };
  const ids = (students || []).map((s) => s.id);
  if (!ids.length) return { error: "No students in period.", status: 404 };

  // Reference maps: CCSS → domain, problem → topic-derived domain.
  const { data: stds } = await db.from("standards").select("id,domain");
  const stdDomain = new Map<string, string>((stds || []).map((r) => [r.id, r.domain]));
  const { data: probs } = await db.from("problems").select("id,prompt");
  const probDomain = new Map<string, Domain>();
  for (const p of probs || []) {
    const topic = String(p.prompt || "").replace(/ warm-up item$/, "");
    if (TOPIC_DOMAIN[topic]) probDomain.set(p.id, TOPIC_DOMAIN[topic]);
  }

  // i-Ready Fall baseline (missing rows fall back to 50).
  const { data: irRows } = await db.from("iready_scores")
    .select("student_id,domain,scale_score").eq("window", "Fall").in("student_id", ids);
  const initByStudent = new Map<string, Record<Domain, number>>();
  for (const r of irRows || []) {
    if (!isDomain(r.domain)) continue;
    const rec = initByStudent.get(r.student_id)
      || (Object.fromEntries(DOMAINS.map((d) => [d, 50])) as Record<Domain, number>);
    rec[r.domain] = scaleToMastery(r.scale_score, cfg);
    initByStudent.set(r.student_id, rec);
  }

  // Raw log 1: responses (warm-ups + tools), oldest first.
  const { data: resp, error: rErr } = await db.from("responses")
    .select("student_id,problem_id,source,domain,standard_id,score,is_correct,submitted_at")
    .in("student_id", ids).order("submitted_at", { ascending: true }).limit(50000);
  if (rErr) return { error: rErr.message, status: 500 };

  // Raw log 2: checkpoint results joined to their runs (tier, SBAC flag, ccss).
  const { data: cpr, error: cErr } = await db.from("checkpoint_results")
    .select("student_id,is_correct,ccss,created_at,run_id,checkpoint_runs(checkpoint_id,tier,is_sbac,ccss)")
    .in("student_id", ids).order("created_at", { ascending: true }).limit(50000);
  if (cErr) return { error: cErr.message, status: 500 };

  const domainEvents = new Map<string, MasteryEvent[]>();
  const stdEvents = new Map<string, Map<string, MasteryEvent[]>>();
  const push = (studentId: string, e: MasteryEvent) => {
    (domainEvents.get(studentId) || domainEvents.set(studentId, []).get(studentId)!).push(e);
    if (e.standardId) {
      const m = stdEvents.get(studentId) || stdEvents.set(studentId, new Map()).get(studentId)!;
      (m.get(e.standardId) || m.set(e.standardId, []).get(e.standardId)!).push(e);
    }
  };

  for (const r of resp || []) {
    const explicit = isDomain(r.domain) ? r.domain : null;
    const derived = r.standard_id && isDomain(stdDomain.get(r.standard_id)) ? (stdDomain.get(r.standard_id) as Domain) : null;
    const fromProblem = r.problem_id ? probDomain.get(r.problem_id) || null : null;
    const domain = explicit || derived || fromProblem;
    if (!domain) continue;
    const scorePct = typeof r.score === "number" || typeof r.score === "string"
      ? warmupScoreToPct(Number(r.score))
      : r.is_correct === true ? 100 : r.is_correct === false ? 0 : null;
    if (scorePct === null) continue;
    push(r.student_id, {
      at: r.submitted_at, domain, standardId: r.standard_id || undefined,
      source: (r.source === "tool" ? "tool" : "warmup") as EvidenceSource, scorePct,
    });
  }

  // Checkpoints: aggregate per (student × checkpoint × domain) and (… × standard).
  interface CpAgg { correct: number; total: number; at: string; tier: number; sbacCorrect: boolean }
  const cpAgg = new Map<string, CpAgg>();
  for (const r of cpr || []) {
    const run = (Array.isArray(r.checkpoint_runs) ? r.checkpoint_runs[0] : r.checkpoint_runs) as
      { checkpoint_id: string; tier: number; is_sbac: boolean; ccss: string | null } | null;
    if (!run) continue;
    const ccss = r.ccss || run.ccss;
    const domain = ccss ? stdDomain.get(ccss) : null;
    if (!ccss || !isDomain(domain)) continue;
    for (const key of [`${r.student_id}|${run.checkpoint_id}|D:${domain}`, `${r.student_id}|${run.checkpoint_id}|S:${ccss}`]) {
      const a = cpAgg.get(key) || { correct: 0, total: 0, at: r.created_at, tier: run.tier ?? 2, sbacCorrect: false };
      a.total += 1;
      if (r.is_correct) a.correct += 1;
      if (r.created_at > a.at) a.at = r.created_at;
      if (run.is_sbac && r.is_correct) a.sbacCorrect = true;
      cpAgg.set(key, a);
    }
  }
  for (const [key, a] of cpAgg) {
    const [sid, , scope] = key.split("|");
    const source: EvidenceSource = a.tier === 1 ? "tier1" : "tier2";
    const scorePct = (a.correct / Math.max(1, a.total)) * 100;
    if (scope.startsWith("D:")) {
      push(sid, { at: a.at, domain: scope.slice(2) as Domain, source, scorePct });
    } else {
      const ccss = scope.slice(2);
      const domain = stdDomain.get(ccss);
      if (!isDomain(domain)) continue;
      push(sid, { at: a.at, domain, standardId: ccss, source, scorePct, sbacCorrect: a.sbacCorrect });
    }
  }

  // Replay every student; rewrite mastery + history.
  const defaultInit = Object.fromEntries(DOMAINS.map((d) => [d, 50])) as Record<Domain, number>;
  const masteryRows = [];
  const historyRows = [];
  for (const sid of ids) {
    const init = initByStudent.get(sid) || defaultInit;
    // Standard-scoped checkpoint events are already covered by the domain-scoped
    // aggregates, so exclude them from the bar replay.
    const barEvents = (domainEvents.get(sid) || []).filter((e) => !e.standardId);
    const sorted = [...barEvents].sort((a, b) => (a.at < b.at ? -1 : 1));
    const { percent } = replayDomains(init, sorted, cfg);
    for (const d of DOMAINS) {
      masteryRows.push({ student_id: sid, domain: d, standard_id: "", percent: percent[d], stage: "not_started", updated_at: new Date().toISOString() });
    }
    const running = { ...init };
    for (const d of DOMAINS) {
      historyRows.push({ student_id: sid, domain: d, standard_id: "", percent: init[d], stage: "not_started", source: "iready_init", at: sorted[0]?.at || new Date().toISOString() });
    }
    for (const e of sorted) {
      running[e.domain] = ewmaStep(running[e.domain], e.scorePct, alphaFor(e.source, cfg));
      historyRows.push({ student_id: sid, domain: e.domain, standard_id: "", percent: running[e.domain], stage: "not_started", source: e.source, at: e.at });
    }
    const byStd = stdEvents.get(sid);
    if (byStd) {
      for (const [stdId, list] of byStd) {
        const domain = stdDomain.get(stdId);
        if (!isDomain(domain)) continue;
        const ordered = [...list].sort((a, b) => (a.at < b.at ? -1 : 1));
        let pct = 0;
        for (const e of ordered) pct = ewmaStep(pct, e.scorePct, alphaFor(e.source, cfg));
        const stage = deriveStage(ordered, cfg);
        masteryRows.push({ student_id: sid, domain, standard_id: stdId, percent: pct, stage, updated_at: new Date().toISOString() });
        historyRows.push({ student_id: sid, domain, standard_id: stdId, percent: pct, stage, source: ordered[ordered.length - 1]?.source || null, at: ordered[ordered.length - 1]?.at || new Date().toISOString() });
      }
    }
  }

  const del1 = await db.from("mastery_history").delete().in("student_id", ids);
  if (del1.error) return { error: del1.error.message, status: 500 };
  const del2 = await db.from("mastery").delete().in("student_id", ids);
  if (del2.error) return { error: del2.error.message, status: 500 };
  for (let i = 0; i < masteryRows.length; i += 500) {
    const { error } = await db.from("mastery").insert(masteryRows.slice(i, i + 500));
    if (error) return { error: error.message, status: 500 };
  }
  for (let i = 0; i < historyRows.length; i += 500) {
    const { error } = await db.from("mastery_history").insert(historyRows.slice(i, i + 500));
    if (error) return { error: error.message, status: 500 };
  }

  return {
    students: ids.length,
    masteryRows: masteryRows.length,
    historyRows: historyRows.length,
    domainEventsReplayed: [...domainEvents.values()].reduce((a, l) => a + l.filter((e) => !e.standardId).length, 0),
  };
}
