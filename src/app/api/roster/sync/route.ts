// Roster sync: Notion "All Contact Information" DB → Supabase periods/students.
// Add a row in Notion and it appears on the site — run via the Rosters page
// button, or automatically by the daily Vercel cron (vercel.json).
//
// Rules: email is the match key (site-unique); period is created if missing;
// name/period updates follow Notion; rows without an email match by name+period.
// NEVER deletes site students — students missing from Notion are only reported,
// so evidence history and the mock fixtures can't be wiped by a roster change.
//
// Auth: teacher basic-auth via middleware; the cron bypasses with CRON_SECRET.
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { fetchNotionRoster } from "@/lib/notionRoster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function sync() {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });

  let roster;
  try { roster = await fetchNotionRoster(); }
  catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Notion read failed." }, { status: 502 }); }
  if (!roster.length) return Response.json({ error: "Notion roster returned 0 rows — not syncing." }, { status: 422 });

  const [{ data: pData, error: pErr }, { data: sData, error: sErr }] = await Promise.all([
    db.from("periods").select("id,name,sort_order"),
    db.from("students").select("id,period_id,full_name,email"),
  ]);
  if (pErr || sErr) return Response.json({ error: (pErr || sErr)!.message }, { status: 500 });

  const periods = new Map<string, string>((pData || []).map((p) => [p.name.trim().toLowerCase(), p.id]));
  const maxSort = Math.max(0, ...((pData || []).map((p) => p.sort_order || 0)));

  // Create any periods Notion mentions that the site doesn't have yet.
  const wanted = [...new Set(roster.map((r) => r.period.trim()))];
  let periodsCreated = 0;
  for (const name of wanted) {
    if (periods.has(name.toLowerCase())) continue;
    const numeric = name.match(/\d+/)?.[0];
    const { data, error } = await db.from("periods")
      .insert({ name, sort_order: numeric ? Number(numeric) : maxSort + 10 + periodsCreated })
      .select("id").single();
    if (error) return Response.json({ error: `Creating period "${name}": ${error.message}` }, { status: 500 });
    periods.set(name.toLowerCase(), (data as { id: string }).id);
    periodsCreated += 1;
  }

  const byEmail = new Map<string, { id: string; full_name: string; period_id: string }>();
  const byNamePeriod = new Map<string, string>();
  for (const s of sData || []) {
    if (s.email) byEmail.set(String(s.email).toLowerCase(), s);
    byNamePeriod.set(`${s.full_name.trim().toLowerCase()}|${s.period_id}`, s.id);
  }

  let created = 0, updated = 0, unchanged = 0, skipped = 0;
  const notionEmails = new Set<string>();
  for (const r of roster) {
    const periodId = periods.get(r.period.trim().toLowerCase())!;
    if (r.email) {
      notionEmails.add(r.email);
      const existing = byEmail.get(r.email);
      if (existing) {
        if (existing.full_name !== r.name || existing.period_id !== periodId) {
          const { error } = await db.from("students").update({ full_name: r.name, period_id: periodId }).eq("id", existing.id);
          if (error) { skipped += 1; continue; }
          updated += 1;
        } else unchanged += 1;
      } else {
        const { error } = await db.from("students").insert({ period_id: periodId, full_name: r.name, email: r.email });
        if (error) { skipped += 1; continue; }
        created += 1;
      }
    } else {
      // no email in Notion — match by name within the period, insert if new
      if (byNamePeriod.has(`${r.name.trim().toLowerCase()}|${periodId}`)) { unchanged += 1; continue; }
      const { error } = await db.from("students").insert({ period_id: periodId, full_name: r.name });
      if (error) { skipped += 1; continue; }
      created += 1;
    }
  }

  // Report-only: site students Notion doesn't know (mock fixtures excluded).
  const onSiteNotInNotion = (sData || [])
    .filter((s) => s.email && !String(s.email).includes("@mock.bigdogmath.example") && !notionEmails.has(String(s.email).toLowerCase()))
    .map((s) => s.full_name);

  return Response.json({
    notionRows: roster.length, periodsCreated, created, updated, unchanged, skipped,
    onSiteNotInNotion,
  });
}

export async function POST() { return sync(); }
export async function GET() { return sync(); } // Vercel cron invokes with GET
