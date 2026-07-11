import { NextRequest } from "next/server";
import { buildWarmupSet } from "@/lib/warmupEngine";
import { getAllPublishedLessons } from "@/lib/notionLessons";

// Parametric warm-up generator. Returns the day's 6 questions (5 multiple choice
// + 1 short answer), correct-by-construction with misconception-tagged Q4/Q5.
//
// Topic resolution:
//   ?topic=...   explicit override (wins)
//   otherwise    look the ?date up in the Notion lesson calendar and use that
//                lesson's Topic, plus the PREVIOUS taught day's Topic for the
//                retention questions ("the basis of the previous lesson or two")
//   fallback     if Notion isn't configured/reachable, build a strand-rotated
//                set so it still never fails
//
// The Apps Script side can therefore just call /api/warmup?date=YYYY-MM-DD (or
// with no date for today) and feed the result to buildForm_.
//
// POC note: this exposes the answer key, so gate it (e.g. Authorization: Bearer
// CRON_SECRET, which Apps Script can send) before wiring it to production forms.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const strand = searchParams.get("strand") || undefined;
  const seedParam = searchParams.get("seed") || undefined;

  let topic = searchParams.get("topic") || "";
  let prevTopic = searchParams.get("prevTopic") || "";
  let topicSource: "query" | "notion" | "fallback" = topic ? "query" : "fallback";

  if (!topic) {
    try {
      const lessons = await getAllPublishedLessons(); // sorted by Date, descending
      const onDate = lessons.find((l) => l.date === date);
      const prior = lessons
        .filter((l) => l.date && l.date < date)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      if (onDate?.topic || prior?.topic) {
        topic = onDate?.topic || "";
        if (!prevTopic) prevTopic = prior?.topic || "";
        topicSource = "notion";
      }
    } catch {
      // Notion not configured or unreachable — fall through to a strand-rotated build.
    }
  }

  // Stable per (topic|date) so the same day rebuilds identically; pass ?seed= to force a fresh set.
  const seed = seedParam || `${topic || date}|${date}`;
  const set = buildWarmupSet({ topic, prevTopic, strand, date, seed });

  return Response.json({ ...set, meta: { date, topicSource, prevTopic: prevTopic || null } });
}
