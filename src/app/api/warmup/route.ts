import { NextRequest } from "next/server";
import { buildWarmupSet } from "@/lib/warmupEngine";

// Parametric warm-up generator. Returns the day's 6 questions (5 multiple choice
// + 1 short answer), correct-by-construction with misconception-tagged Q4/Q5.
// The Apps Script side fetches this and feeds the existing buildForm_ pipeline,
// so it no longer needs an LLM key or the fragile validation gauntlet.
//
// POC note: this exposes the answer key, so before wiring it to production forms
// it should be gated (e.g. Authorization: Bearer CRON_SECRET, which Apps Script
// can send) rather than left public.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const topic = searchParams.get("topic") || "";
  const strand = searchParams.get("strand") || undefined;
  const prevTopic = searchParams.get("prevTopic") || undefined;
  const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);
  // Stable per (topic, date) so the same day rebuilds identically; pass ?seed= to force a fresh set.
  const seed = searchParams.get("seed") || `${topic}|${date}`;

  const set = buildWarmupSet({ topic, strand, prevTopic, date, seed });
  return Response.json(set);
}
