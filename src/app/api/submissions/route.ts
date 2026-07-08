// Teacher-only (middleware gates /api/submissions): end-of-day roll-up of in-app
// tool work into the Notion "Student Submissions" database.
//   GET  -> { activities: [...] }        (today's per-student-per-tool work)
//   POST -> { written, skipped }         (push those into Notion, dedup by title)
// Runs server-side with the service-role client + NOTION_TOKEN. Cron-capable
// (Bearer CRON_SECRET) so it can also fire automatically after the school day.
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { submissionsConfigured, fetchTodaysSubmissionTitles, createSubmissionRow } from "@/lib/notionSubmissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TOOL_LABEL: Record<string, string> = {
  "equation-builder": "Equation Builder", "gems": "GEMS", "combine-like-terms": "Combine Like Terms",
  "balance-beam": "Balance Beam", "area-model": "Area Model",
};

function classroomDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function periodTag(name: string): string | null {
  const m = (name || "").match(/([1-7])/);
  return m ? `P${m[1]}` : null;
}

interface Activity { student: string; period: string | null; tool: string; toolLabel: string; score: number; misconception: string | null }

async function collect(): Promise<{ today: string; activities: Activity[] } | { error: string }> {
  const db = getSupabaseAdmin();
  if (!db) return { error: "Database not configured." };
  const today = classroomDate();
  try {
    const [{ data: students }, { data: periods }] = await Promise.all([
      db.from("students").select("id,full_name,period_id"),
      db.from("periods").select("id,name"),
    ]);
    const periodName = new Map(((periods || []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
    const info = new Map(((students || []) as { id: string; full_name: string; period_id: string }[]).map((s) => [s.id, { name: s.full_name, period: periodTag(periodName.get(s.period_id) || "") }]));

    // The per-(student x tool x day) aggregate rows written by the tools.
    const since = new Date(Date.now() - 18 * 3600 * 1000).toISOString();
    const { data: rows } = await db
      .from("responses")
      .select("student_id,score,misconception,item_ref,submitted_at")
      .eq("source", "tool").is("standard_id", null).gte("submitted_at", since)
      .limit(20000);

    // Keep the latest row per student x tool.
    const seen = new Map<string, Activity>();
    for (const r of (rows || []) as { student_id: string; score: number | null; misconception: string | null; item_ref: string | null }[]) {
      const who = info.get(r.student_id);
      const tool = r.item_ref || "";
      if (!who || !tool) continue;
      seen.set(`${r.student_id}:${tool}`, {
        student: who.name, period: who.period, tool,
        toolLabel: TOOL_LABEL[tool] || tool,
        score: r.score != null ? Math.round(Number(r.score) * 10) / 10 : 0,
        misconception: r.misconception || null,
      });
    }
    return { today, activities: [...seen.values()].sort((a, b) => a.student.localeCompare(b.student)) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't read today's work." };
  }
}

export async function GET() {
  const r = await collect();
  if ("error" in r) return Response.json({ activities: [], error: r.error });
  return Response.json({ connected: true, today: r.today, activities: r.activities });
}

export async function POST() {
  if (!submissionsConfigured()) return Response.json({ error: "Notion is not configured (NOTION_TOKEN)." }, { status: 503 });
  const r = await collect();
  if ("error" in r) return Response.json({ error: r.error }, { status: 500 });
  try {
    const existing = await fetchTodaysSubmissionTitles(r.today);
    let written = 0, skipped = 0;
    for (const a of r.activities) {
      const title = `${a.toolLabel} — ${a.student} — ${r.today}`;
      if (existing.has(title)) { skipped++; continue; }
      await createSubmissionRow({
        title, student: a.student, period: a.period,
        response: `${a.toolLabel}: scored ${a.score}/5 across today's problems${a.misconception ? ` — watch: ${a.misconception}` : ""}`,
        misconception: Boolean(a.misconception), dateIso: r.today,
      });
      written++;
    }
    return Response.json({ ok: true, written, skipped, total: r.activities.length });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Push failed." }, { status: 500 });
  }
}
