import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireOpenJoinedSession,
  requireVerifiedStudent,
  StudentIdentityError,
  studentIdentityResponse,
} from "@/lib/studentIdentity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const student = await requireVerifiedStudent(request);
    const sessionId = new URL(request.url).searchParams.get("sessionId") || "";
    await requireOpenJoinedSession(student, sessionId);

    const db = getSupabaseAdmin();
    if (!db) throw new StudentIdentityError("Exit tickets are not configured.", 503, "exit_tickets_not_configured");
    const { data, error } = await db
      .from("exit_tickets")
      .select("id,session_id,lesson_code,prompt,kind,choices,status,created_at")
      .eq("session_id", sessionId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new StudentIdentityError("The exit ticket could not be loaded.", 500, "exit_ticket_lookup_failed");

    return Response.json({ exitTicket: data ?? null }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return studentIdentityResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const student = await requireVerifiedStudent(request);
    const body = await request.json().catch(() => ({})) as {
      exitTicketId?: unknown;
      sessionId?: unknown;
      response?: unknown;
    };
    const exitTicketId = typeof body.exitTicketId === "string" ? body.exitTicketId : "";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const response = typeof body.response === "string" ? body.response.trim() : "";
    if (!exitTicketId || !response || response.length > 4000) {
      throw new StudentIdentityError("A valid exit-ticket response is required.", 400, "invalid_exit_response");
    }
    await requireOpenJoinedSession(student, sessionId);

    const db = getSupabaseAdmin();
    if (!db) throw new StudentIdentityError("Exit tickets are not configured.", 503, "exit_tickets_not_configured");
    const { data: ticket, error: ticketError } = await db
      .from("exit_tickets")
      .select("id,session_id,status")
      .eq("id", exitTicketId)
      .maybeSingle();
    if (ticketError) throw new StudentIdentityError("The exit ticket could not be checked.", 500, "exit_ticket_lookup_failed");
    if (!ticket || ticket.status !== "open" || ticket.session_id !== sessionId) {
      throw new StudentIdentityError("This exit ticket is not open for your class.", 409, "exit_ticket_closed");
    }

    const { error: saveError } = await db.from("exit_ticket_responses").upsert(
      {
        exit_ticket_id: ticket.id,
        session_id: sessionId,
        student_id: student.id,
        display_name: student.fullName,
        response,
      },
      { onConflict: "exit_ticket_id,student_id" },
    );
    if (saveError) throw new StudentIdentityError("Your exit ticket could not be saved.", 500, "exit_ticket_save_failed");

    return Response.json({ saved: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return studentIdentityResponse(error);
  }
}
