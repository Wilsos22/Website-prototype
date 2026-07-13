import { closeExitTicket, getExitResponses, launchExitTicket, listRecentExitTickets, type ExitKind } from "@/lib/exitTickets";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(request: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });
  const ticketId = new URL(request.url).searchParams.get("ticketId") || "";
  if (ticketId) {
    const [{ data: ticket, error }, responses] = await Promise.all([
      db.from("exit_tickets").select("*").eq("id", ticketId).maybeSingle(),
      getExitResponses(db, ticketId),
    ]);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!ticket) return Response.json({ error: "Exit ticket not found." }, { status: 404 });
    return Response.json({ ticket, responses }, { headers: { "cache-control": "no-store" } });
  }
  const result = await listRecentExitTickets(db, 60);
  return Response.json({ tickets: result.tickets, missing: result.missing }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = text(body.action, 20);

  if (action === "launch") {
    const prompt = text(body.prompt, 4000);
    const rawKind = text(body.kind, 40);
    const kind: ExitKind = rawKind === "multiple-choice" || rawKind === "fist-to-five" ? rawKind : "short-answer";
    const choices = Array.isArray(body.choices)
      ? body.choices.filter((choice): choice is string => typeof choice === "string").map((choice) => text(choice, 500)).filter(Boolean).slice(0, 12)
      : null;
    if (!prompt) return Response.json({ error: "Exit-ticket prompt is required." }, { status: 400 });
    const result = await launchExitTicket(db, {
      sessionId: text(body.sessionId, 80) || null,
      periodId: text(body.periodId, 80) || null,
      lessonCode: text(body.lessonCode, 120) || null,
      prompt,
      kind,
      choices: choices?.length ? choices : null,
    });
    if (result.error) return Response.json({ error: result.error }, { status: 500 });
    return Response.json({ ticket: result.ticket }, { status: 201 });
  }

  if (action === "close") {
    const ticketId = text(body.ticketId, 80);
    if (!ticketId) return Response.json({ error: "Exit ticket is required." }, { status: 400 });
    await closeExitTicket(db, ticketId);
    return Response.json({ closed: true });
  }

  return Response.json({ error: "Unknown exit-ticket action." }, { status: 400 });
}
