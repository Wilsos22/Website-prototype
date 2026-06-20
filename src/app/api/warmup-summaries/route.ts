import { getWeeklySummaries, getRecentWarmupForms } from "@/lib/notionWarmupSummaries";

export const runtime = "nodejs";
// Cache the response for ~5 min; the data layer also caches per warm instance.
export const revalidate = 300;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const daysRaw = Number(searchParams.get("days"));
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 120) : 14;

  try {
    const [summaries, forms] = await Promise.all([
      getWeeklySummaries(days),
      getRecentWarmupForms(days),
    ]);
    return Response.json({ summaries, forms, days });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
