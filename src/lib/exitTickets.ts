// Supabase helpers for daily exit tickets — the end-of-lesson check the teacher
// authors per lesson (and saves with the lesson preset). Launched from the Exit
// Ticket bank state during a live session; students answer on /exit-ticket and
// responses land in exit_ticket_responses for the "Today's Exit Tickets" read.
// Tables live in supabase/formative.sql.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTable } from "@/lib/challenges";
import { isTeacherSurface, teacherApiRequest, teacherPost } from "@/lib/teacherApi";

export type ExitKind = "short-answer" | "multiple-choice" | "fist-to-five";

export interface ExitTicket {
  id: string;
  session_id: string | null;
  period_id: string | null;
  lesson_code: string | null;
  prompt: string;
  kind: ExitKind;
  choices: string[] | null;
  status: "open" | "closed";
  created_at: string;
}

export interface ExitResponseRow {
  id: string;
  student_id: string | null;
  display_name: string | null;
  response: string | null;
  created_at: string;
}

export async function launchExitTicket(
  supabase: SupabaseClient,
  input: { sessionId: string | null; periodId: string | null; lessonCode: string | null; prompt: string; kind: ExitKind; choices: string[] | null },
): Promise<{ ticket: ExitTicket | null; error: string | null }> {
  if (isTeacherSurface()) {
    try {
      const result = await teacherPost<{ ticket: ExitTicket }>("/api/teacher/exit-ticket", {
        action: "launch",
        sessionId: input.sessionId,
        periodId: input.periodId,
        lessonCode: input.lessonCode,
        prompt: input.prompt,
        kind: input.kind,
        choices: input.choices,
      });
      return { ticket: result.ticket, error: null };
    } catch (error) {
      return { ticket: null, error: error instanceof Error ? error.message : "Exit ticket could not be launched." };
    }
  }
  if (input.sessionId) {
    await supabase.from("exit_tickets").update({ status: "closed" }).eq("session_id", input.sessionId).eq("status", "open");
  }
  const { data, error } = await supabase
    .from("exit_tickets")
    .insert({
      session_id: input.sessionId,
      period_id: input.periodId,
      lesson_code: input.lessonCode,
      prompt: input.prompt,
      kind: input.kind,
      choices: input.choices,
      status: "open",
    })
    .select("*")
    .single();
  if (error) return { ticket: null, error: isMissingTable(error) ? "SETUP" : error.message };
  return { ticket: data as ExitTicket, error: null };
}

export async function closeExitTicket(supabase: SupabaseClient, id: string): Promise<void> {
  if (isTeacherSurface()) {
    await teacherPost("/api/teacher/exit-ticket", { action: "close", ticketId: id });
    return;
  }
  await supabase.from("exit_tickets").update({ status: "closed" }).eq("id", id);
}

export async function getOpenExitTicket(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<ExitTicket | null> {
  const { data } = await supabase
    .from("exit_tickets")
    .select("*")
    .eq("session_id", sessionId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ExitTicket) || null;
}

export async function submitExitResponse(
  supabase: SupabaseClient,
  input: { exitTicketId: string; sessionId: string | null; studentId: string | null; displayName: string | null; response: string },
): Promise<void> {
  // One response per student per ticket — clear any prior answer first.
  let del = supabase.from("exit_ticket_responses").delete().eq("exit_ticket_id", input.exitTicketId);
  del = input.studentId
    ? del.eq("student_id", input.studentId)
    : del.eq("display_name", input.displayName ?? "");
  await del;
  await supabase.from("exit_ticket_responses").insert({
    exit_ticket_id: input.exitTicketId,
    session_id: input.sessionId,
    student_id: input.studentId,
    display_name: input.displayName,
    response: input.response,
  });
}

export async function listRecentExitTickets(
  supabase: SupabaseClient,
  limit = 30,
): Promise<{ tickets: ExitTicket[]; missing: boolean }> {
  if (isTeacherSurface()) {
    try {
      return await teacherApiRequest<{ tickets: ExitTicket[]; missing: boolean }>("/api/teacher/exit-ticket");
    } catch {
      return { tickets: [], missing: false };
    }
  }
  const { data, error } = await supabase
    .from("exit_tickets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { tickets: [], missing: isMissingTable(error) };
  return { tickets: (data as ExitTicket[]) || [], missing: false };
}

export async function getExitResponses(
  supabase: SupabaseClient,
  ticketId: string,
): Promise<ExitResponseRow[]> {
  if (isTeacherSurface()) {
    try {
      const result = await teacherApiRequest<{ responses: ExitResponseRow[] }>(
        `/api/teacher/exit-ticket?ticketId=${encodeURIComponent(ticketId)}`,
      );
      return result.responses;
    } catch {
      return [];
    }
  }
  const { data } = await supabase
    .from("exit_ticket_responses")
    .select("id,student_id,display_name,response,created_at")
    .eq("exit_ticket_id", ticketId)
    .order("created_at", { ascending: true });
  return (data as ExitResponseRow[]) || [];
}
