import { getSupabaseAdmin } from "@/lib/supabaseServer";

type SecurityEvent = {
  eventType: string;
  outcome: "allowed" | "denied" | "conflict" | "error";
  authUserId?: string | null;
  studentId?: string | null;
  sessionId?: string | null;
  details?: Record<string, string | number | boolean | null>;
};

export async function recordSecurityEvent(event: SecurityEvent): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) return;

  const { error } = await db.from("security_audit_events").insert({
    event_type: event.eventType,
    outcome: event.outcome,
    auth_user_id: event.authUserId ?? null,
    student_id: event.studentId ?? null,
    session_id: event.sessionId ?? null,
    details: event.details ?? {},
  });

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return;
    console.error("Security audit event could not be saved.", {
      eventType: event.eventType,
      outcome: event.outcome,
      code: error.code,
    });
  }
}
