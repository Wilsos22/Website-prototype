// Moderated "Ask Abbie" queue. Students submit written questions from their
// screen; the teacher approves (Abbie answers for the class) or dismisses.
// Prototype anon table (abbie_questions) - the teacher is always the gate, so
// this is fine on the browser client. See supabase/abbie-questions.sql.

import { getSupabase } from "@/lib/supabase";

export interface AbbieQuestion {
  id: string;
  session_id: string;
  student_id: string | null;
  display_name: string | null;
  question: string;
  status: "pending" | "answered" | "dismissed";
  answer: string | null;
  created_at: string;
  answered_at: string | null;
}

export type SubmitResult =
  | { ok: true }
  | { ok: false; reason: "no-db" | "no-session" | "empty" | "already-pending" | "error" };

// One outstanding question per student keeps the queue from flooding.
export async function submitAbbieQuestion(
  sessionId: string,
  student: { studentId?: string | null; name?: string | null },
  question: string,
): Promise<SubmitResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: "no-db" };
  if (!sessionId) return { ok: false, reason: "no-session" };
  const text = question.trim();
  if (!text) return { ok: false, reason: "empty" };

  if (student.studentId) {
    const { data: existing } = await supabase
      .from("abbie_questions")
      .select("id")
      .eq("session_id", sessionId)
      .eq("student_id", student.studentId)
      .eq("status", "pending")
      .limit(1);
    if (existing && existing.length > 0) return { ok: false, reason: "already-pending" };
  }

  const { error } = await supabase.from("abbie_questions").insert({
    session_id: sessionId,
    ...(student.studentId ? { student_id: student.studentId } : {}),
    display_name: student.name ?? null,
    question: text,
  });
  return error ? { ok: false, reason: "error" } : { ok: true };
}

export async function fetchPendingAbbieQuestions(sessionId: string): Promise<AbbieQuestion[]> {
  const supabase = getSupabase();
  if (!supabase || !sessionId) return [];
  const { data, error } = await supabase
    .from("abbie_questions")
    .select("*")
    .eq("session_id", sessionId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data as AbbieQuestion[]) ?? [];
}

export async function markAbbieQuestionAnswered(id: string, answer: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase
    .from("abbie_questions")
    .update({ status: "answered", answer, answered_at: new Date().toISOString() })
    .eq("id", id);
}

export async function dismissAbbieQuestion(id: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from("abbie_questions").update({ status: "dismissed" }).eq("id", id);
}
