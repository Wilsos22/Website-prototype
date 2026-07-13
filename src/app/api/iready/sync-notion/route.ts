// Teacher-only sync from the server-only i-Ready baseline table to related
// Notion student profile records. No student names are returned in the result.
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { fetchNotionRoster } from "@/lib/notionRoster";
import { fetchIReadyEvaluationPages, writeIReadyEvaluation } from "@/lib/notionIReady";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function POST() {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });
  try {
    const [{ data: students, error: studentError }, { data: scores, error: scoreError }, roster, existing] = await Promise.all([
      db.from("students").select("id,full_name"),
      db.from("iready_scores").select("student_id,window,domain,scale_score"),
      fetchNotionRoster(),
      fetchIReadyEvaluationPages(),
    ]);
    if (studentError) throw studentError;
    if (scoreError) throw scoreError;

    const studentNames = new Map(((students || []) as { id: string; full_name: string }[]).map((student) => [student.id, student.full_name]));
    const rosterByName = new Map(roster.map((student) => [normalized(student.name), student]));
    const groups = new Map<string, { name: string; studentPageId: string; window: "Fall" | "Winter" | "Spring"; domains: Record<string, number> }>();
    let unmatchedStudents = 0;

    for (const row of (scores || []) as { student_id: string; window: string; domain: string; scale_score: number | null }[]) {
      const name = studentNames.get(row.student_id);
      const rosterStudent = name ? rosterByName.get(normalized(name)) : undefined;
      if (!name || !rosterStudent) {
        unmatchedStudents++;
        continue;
      }
      const window = row.window.startsWith("Spring") ? "Spring" : row.window === "Winter" ? "Winter" : "Fall";
      const key = `${rosterStudent.pageId}:${window}`;
      const group = groups.get(key) || { name, studentPageId: rosterStudent.pageId, window, domains: {} };
      if (row.scale_score != null) group.domains[row.domain] = Number(row.scale_score);
      groups.set(key, group);
    }

    let created = 0;
    let updated = 0;
    for (const group of groups.values()) {
      const ranked = Object.entries(group.domains).sort((a, b) => b[1] - a[1]);
      if (!ranked.length) continue;
      const title = `${group.name} — ${group.window}`;
      const result = await writeIReadyEvaluation({
        title,
        studentPageId: group.studentPageId,
        window: group.window,
        domains: group.domains,
        strengths: `${ranked[0][0]} (${ranked[0][1]})`,
        growthAreas: `${ranked[ranked.length - 1][0]} (${ranked[ranked.length - 1][1]})`,
        notes: "Domain scale scores synced from the server-only Big Dog Math i-Ready baseline. Overall score and official placement remain blank unless supplied by the diagnostic report.",
      }, existing.get(title));
      if (result === "created") created++;
      else updated++;
    }
    return Response.json({ ok: true, created, updated, evaluations: groups.size, unmatchedScoreRows: unmatchedStudents });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "i-Ready sync failed." }, { status: 500 });
  }
}
