// Teacher-only (middleware gates /api/outreach): parent-outreach candidates from
// the Notion roster + writing Draft entries into the Notion Parent Contact Log.
//   GET  -> { connected, daily, concern[], praise[], roster[] }
//   POST { action: 'draft', kind, studentPageId, studentName, parentEmail, ... }
//        -> creates a Draft in the Contact Log; returns { ok, notionUrl, gmailUrl }
// Everything runs server-side with NOTION_TOKEN; parent emails never travel over
// the browser anon path (they arrive only on this gated teacher route).
import { fetchOutreachRoster, createContactLogDraft, outreachConfigured, type OutreachStudent } from "@/lib/notionOutreach";
import { buildEmail, gmailComposeUrl, firstName, type OutreachKind } from "@/lib/parentOutreach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NON_SUBMIT_RATE = 0.45; // below this share of the class-high submissions = behind
const PRAISE_TOP = 8;         // how many top warm-up averages to surface

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
// Stable day-based index so the "parent of the day" pick is the same all day and
// rotates through the roster over the year.
function dayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86400000);
}

function pub(s: OutreachStudent) {
  return { studentPageId: s.pageId, name: s.name, period: s.period, parentEmail: s.parentEmail, hasEmail: Boolean(s.parentEmail) };
}

export async function GET() {
  if (!outreachConfigured()) return Response.json({ connected: false, daily: null, concern: [], praise: [], roster: [] });
  try {
    const roster = await fetchOutreachRoster();
    if (!roster.length) return Response.json({ connected: true, daily: null, concern: [], praise: [], roster: [] });

    // Behind on warm-ups: fewest submissions, relative to the class high.
    const submitted = roster.map((s) => s.warmupsSubmitted).filter((n): n is number => n != null);
    const classHigh = submitted.length ? Math.max(...submitted) : 0;
    const concern = classHigh >= 3
      ? roster
          .filter((s) => s.warmupsSubmitted != null && (s.warmupsSubmitted as number) < classHigh * NON_SUBMIT_RATE)
          .sort((a, b) => (a.warmupsSubmitted as number) - (b.warmupsSubmitted as number))
          .map((s) => ({ ...pub(s), submitted: s.warmupsSubmitted as number, possible: classHigh }))
      : [];

    // Bright spots: highest warm-up averages, above the class average.
    const avgs = roster.map((s) => s.warmupAvg).filter((n): n is number => n != null);
    const classAvg = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : 0;
    const praise = roster
      .filter((s) => s.warmupAvg != null && (s.warmupAvg as number) >= classAvg)
      .sort((a, b) => (b.warmupAvg as number) - (a.warmupAvg as number))
      .slice(0, PRAISE_TOP)
      .map((s) => ({ ...pub(s), avg: Math.round((s.warmupAvg as number) * 10) / 10, reason: `${firstName(s.name)} is one of your top warm-up performers (avg ${Math.round((s.warmupAvg as number) * 10) / 10})` }));

    // Parent of the day: rotates by date, positive by default.
    const sorted = [...roster].sort((a, b) => a.name.localeCompare(b.name));
    const daily = sorted.length ? pub(sorted[dayOfYear() % sorted.length]) : null;

    const rosterList = sorted.map((s) => ({ studentPageId: s.pageId, name: s.name, period: s.period, parentEmail: s.parentEmail, hasEmail: Boolean(s.parentEmail) }));
    return Response.json({ connected: true, daily, concern, praise, roster: rosterList });
  } catch (e) {
    return Response.json({ connected: true, daily: null, concern: [], praise: [], roster: [], error: e instanceof Error ? e.message : "Outreach unavailable." });
  }
}

interface PostBody {
  action?: "draft";
  kind?: OutreachKind | "note";
  studentPageId?: string;
  studentName?: string;
  parentEmail?: string | null;
  submitted?: number;
  possible?: number;
  reason?: string;
}

export async function POST(req: Request) {
  let b: PostBody;
  try { b = await req.json(); } catch { return Response.json({ error: "Bad request." }, { status: 400 }); }
  if (b.action !== "draft" || !b.studentPageId || !b.studentName || !b.kind) {
    return Response.json({ error: "Missing draft fields." }, { status: 400 });
  }
  const kind: "concern" | "praise" | "note" = b.kind === "praise" ? "praise" : b.kind === "note" ? "note" : "concern";
  const { subject, body } = buildEmail(kind === "note" ? "praise" : kind, b.studentName, { submitted: b.submitted, possible: b.possible, reason: b.reason });
  try {
    const { url } = await createContactLogDraft({
      studentPageId: b.studentPageId, studentName: b.studentName, parentEmail: b.parentEmail || null,
      kind, subject, body, date: todayIso(),
    });
    const gmailUrl = b.parentEmail ? gmailComposeUrl(b.parentEmail, subject, body) : null;
    return Response.json({ ok: true, notionUrl: url, gmailUrl });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Draft failed." }, { status: 500 });
  }
}
