// Teacher-only (middleware gates /api/outreach): parent-outreach candidates +
// the draft queue. All computation is server-side with the service-role client,
// so guardian emails and student data never travel over the browser anon path.
//   GET  -> { connected, concern[], praise[], queue[], possibleDays }
//   POST -> { action: 'queue' | 'send' | 'dismiss' | 'update', ... }
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { buildEmail, gmailComposeUrl, type OutreachKind } from "@/lib/parentOutreach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NON_SUBMIT_RATE = 0.45; // below this share of warm-up days = a nudge candidate
const MIN_DAYS = 3;           // need at least this many warm-up days to judge
const PERFECT_WINDOW_DAYS = 7;
const STAGE_WINDOW_DAYS = 21;

function daysAgoIso(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}
function humanStage(s: string): string {
  return s === "complete" ? "Complete" : s === "mastered" ? "Mastered" : s;
}

interface StudentRow { id: string; full_name: string; period_id: string }

export async function GET() {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ connected: false, concern: [], praise: [], queue: [], possibleDays: 0 });

  try {
    const [{ data: students }, { data: periods }, { data: guardians }] = await Promise.all([
      db.from("students").select("id,full_name,period_id"),
      db.from("periods").select("id,name"),
      db.from("student_guardians").select("student_id,email,name"),
    ]);
    const roster = (students || []) as StudentRow[];
    if (!roster.length) return Response.json({ connected: true, concern: [], praise: [], queue: [], roster: [], possibleDays: 0 });

    const periodName = new Map(((periods || []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
    const guardian = new Map(((guardians || []) as { student_id: string; email: string | null; name: string | null }[]).map((g) => [g.student_id, g]));
    const nameOf = new Map(roster.map((s) => [s.id, s.full_name]));

    // Warm-up submission history (aggregate rows only: standard_id null, source 'warmup').
    const { data: warm } = await db
      .from("responses")
      .select("student_id,score,submitted_at")
      .eq("source", "warmup")
      .is("standard_id", null)
      .gte("submitted_at", daysAgoIso(35))
      .limit(50000);
    const warmRows = (warm || []) as { student_id: string; score: number | null; submitted_at: string }[];

    const classDays = new Set<string>();
    const studentDays = new Map<string, Set<string>>();
    const perfectRecent = new Map<string, string>(); // student_id -> most recent perfect date
    const perfectCutoff = daysAgoIso(PERFECT_WINDOW_DAYS);
    for (const r of warmRows) {
      const day = String(r.submitted_at).slice(0, 10);
      classDays.add(day);
      (studentDays.get(r.student_id) || studentDays.set(r.student_id, new Set()).get(r.student_id)!).add(day);
      if (Number(r.score) >= 5 && r.submitted_at >= perfectCutoff) {
        const prev = perfectRecent.get(r.student_id);
        if (!prev || r.submitted_at > prev) perfectRecent.set(r.student_id, day);
      }
    }
    const possibleDays = classDays.size;

    // Concern candidates: below the submission-rate floor, with enough data to judge.
    const concern = possibleDays >= MIN_DAYS
      ? roster
          .map((s) => ({ s, submitted: studentDays.get(s.id)?.size || 0 }))
          .filter(({ submitted }) => submitted / possibleDays < NON_SUBMIT_RATE)
          .map(({ s, submitted }) => {
            const g = guardian.get(s.id);
            return { studentId: s.id, name: s.full_name, period: periodName.get(s.period_id) || "", submitted, possible: possibleDays, email: g?.email || null, hasEmail: Boolean(g?.email) };
          })
          .sort((a, b) => a.submitted - b.submitted)
      : [];

    // Praise candidates: a recent perfect warm-up, or a recent Mastered/Complete stage.
    const { data: mastery } = await db
      .from("mastery")
      .select("student_id,domain,stage,updated_at")
      .in("stage", ["mastered", "complete"])
      .gte("updated_at", daysAgoIso(STAGE_WINDOW_DAYS))
      .limit(20000);
    const praiseMap = new Map<string, { reason: string }>();
    for (const [sid, day] of perfectRecent) {
      praiseMap.set(sid, { reason: `${(nameOf.get(sid) || "").split(/\s+/)[0] || "your student"} earned a perfect warm-up score on ${day}` });
    }
    for (const m of (mastery || []) as { student_id: string; domain: string; stage: string }[]) {
      if (praiseMap.has(m.student_id)) continue; // one reason per student is enough
      const fn = (nameOf.get(m.student_id) || "").split(/\s+/)[0] || "your student";
      praiseMap.set(m.student_id, { reason: `${fn} reached ${humanStage(m.stage)} in ${m.domain}` });
    }
    const praise = [...praiseMap.entries()]
      .filter(([sid]) => nameOf.has(sid))
      .map(([sid, v]) => {
        const s = roster.find((r) => r.id === sid)!;
        const g = guardian.get(sid);
        return { studentId: sid, name: s.full_name, period: periodName.get(s.period_id) || "", reason: v.reason, email: g?.email || null, hasEmail: Boolean(g?.email) };
      });

    // The current draft queue (unsent).
    const { data: q } = await db
      .from("parent_outreach")
      .select("id,kind,student_id,to_email,to_name,subject,body,reason,status,created_at")
      .eq("status", "draft")
      .order("created_at", { ascending: true });
    const queue = ((q || []) as { id: string; kind: string; student_id: string; to_email: string | null; to_name: string | null; subject: string; body: string; reason: string | null }[]).map((d) => ({
      id: d.id, kind: d.kind, name: nameOf.get(d.student_id) || d.to_name || "Student",
      toEmail: d.to_email, subject: d.subject, body: d.body, reason: d.reason,
      gmailUrl: d.to_email ? gmailComposeUrl(d.to_email, d.subject, d.body) : null,
    }));

    // Names only (no guardian PII) so the page can offer a "praise anyone" picker.
    const rosterList = roster
      .map((s) => ({ id: s.id, name: s.full_name, period: periodName.get(s.period_id) || "" }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return Response.json({ connected: true, possibleDays, concern, praise, queue, roster: rosterList });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Outreach unavailable.";
    // Most likely the proficiency/outreach migrations haven't been run yet.
    return Response.json({ connected: true, concern: [], praise: [], queue: [], roster: [], possibleDays: 0, error: msg });
  }
}

interface PostBody {
  action?: "queue" | "send" | "dismiss" | "update";
  id?: string;
  kind?: OutreachKind;
  studentId?: string;
  reason?: string;
  subject?: string;
  body?: string;
}

export async function POST(req: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });
  let b: PostBody;
  try { b = await req.json(); } catch { return Response.json({ error: "Bad request." }, { status: 400 }); }

  try {
    if (b.action === "send" && b.id) {
      await db.from("parent_outreach").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", b.id);
      return Response.json({ ok: true });
    }
    if (b.action === "dismiss" && b.id) {
      await db.from("parent_outreach").update({ status: "dismissed" }).eq("id", b.id);
      return Response.json({ ok: true });
    }
    if (b.action === "update" && b.id) {
      const patch: Record<string, string> = {};
      if (typeof b.subject === "string") patch.subject = b.subject;
      if (typeof b.body === "string") patch.body = b.body;
      if (Object.keys(patch).length) await db.from("parent_outreach").update(patch).eq("id", b.id);
      return Response.json({ ok: true });
    }
    if (b.action === "queue" && b.studentId && (b.kind === "concern" || b.kind === "praise")) {
      const { data: s } = await db.from("students").select("id,full_name").eq("id", b.studentId).single();
      if (!s) return Response.json({ error: "Student not found." }, { status: 404 });
      const name = (s as { full_name: string }).full_name;
      const { data: g } = await db.from("student_guardians").select("email,name").eq("student_id", b.studentId).maybeSingle();
      const guardian = g as { email: string | null; name: string | null } | null;

      // For a concern, recompute this student's warm-up counts server-side.
      let submitted = 0, possible = 0;
      if (b.kind === "concern") {
        const { data: warm } = await db.from("responses").select("submitted_at").eq("source", "warmup").is("standard_id", null).gte("submitted_at", daysAgoIso(35)).limit(50000);
        const all = new Set<string>(); const mine = new Set<string>();
        const { data: mineRows } = await db.from("responses").select("submitted_at").eq("source", "warmup").is("standard_id", null).eq("student_id", b.studentId).gte("submitted_at", daysAgoIso(35));
        for (const r of (warm || []) as { submitted_at: string }[]) all.add(String(r.submitted_at).slice(0, 10));
        for (const r of (mineRows || []) as { submitted_at: string }[]) mine.add(String(r.submitted_at).slice(0, 10));
        possible = all.size; submitted = mine.size;
      }

      const { subject, body } = buildEmail(b.kind, name, { submitted, possible, reason: b.reason });
      const { data: inserted, error } = await db.from("parent_outreach").insert({
        student_id: b.studentId, kind: b.kind, to_email: guardian?.email || null, to_name: guardian?.name || null,
        subject, body, reason: b.reason || null, status: "draft",
      }).select("id").single();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true, id: (inserted as { id: string }).id, hasEmail: Boolean(guardian?.email) });
    }
    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Outreach action failed." }, { status: 500 });
  }
}
