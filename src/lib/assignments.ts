// Supabase helpers for practice assignments — the non-live, target-based
// practice ("do 10 rounds of the Expression Simplifier") students complete in a
// lesson or as homework. Each attempt is logged to assignment_attempts, mirroring
// the live-game tracking so it feeds the same per-skill mastery read.
// Tables live in supabase/formative.sql.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTable } from "@/lib/challenges";
import { SECURE_STUDENT_DATA, studentApiRequest } from "@/lib/studentApi";
import { isTeacherSurface, teacherApiRequest, teacherPost } from "@/lib/teacherApi";

export interface Assignment {
  id: string;
  period_id: string | null;
  skill: string;
  title: string;
  level: number;
  target_rounds: number;
  due_label: string | null;
  status: "open" | "closed";
  created_at: string;
}

export interface AssignmentAttemptInput {
  assignment_id: string;
  student_id: string | null;
  display_name: string | null;
  skill: string;
  prompt: string;
  correct_answer: string;
  answer: string;
  is_correct: boolean;
  points: number;
  time_ms: number;
  round_index: number;
}

export interface AssignmentStudentAgg {
  key: string;
  name: string;
  correct: number;
  total: number;
  points: number;
  done: boolean; // reached target_rounds
}

export interface AssignmentMissAgg {
  prompt: string;
  correct_answer: string;
  wrong: number;
  total: number;
}

export interface SecureAssignmentContext {
  assignment: Assignment | null;
  attemptCount: number;
  student: { id: string; fullName: string };
}

export async function getSecureAssignmentContext(id: string): Promise<SecureAssignmentContext | null> {
  if (!SECURE_STUDENT_DATA) return null;
  try {
    return await studentApiRequest<SecureAssignmentContext>(
      `/api/student/practice-attempt?assignmentId=${encodeURIComponent(id)}`,
    );
  } catch {
    return null;
  }
}

export async function listAssignments(
  supabase: SupabaseClient,
  opts?: { periodId?: string | null; includeClosed?: boolean },
): Promise<{ assignments: Assignment[]; missing: boolean }> {
  if (isTeacherSurface()) {
    try {
      const result = await teacherApiRequest<{ assignments: Assignment[] }>("/api/teacher/practice-assignment");
      return { assignments: result.assignments, missing: false };
    } catch {
      return { assignments: [], missing: false };
    }
  }
  if (SECURE_STUDENT_DATA && !opts?.includeClosed) {
    try {
      const result = await studentApiRequest<{ assignments: Assignment[] }>("/api/student/practice-attempt");
      return { assignments: result.assignments, missing: false };
    } catch {
      return { assignments: [], missing: false };
    }
  }
  let query = supabase.from("practice_assignments").select("*").order("created_at", { ascending: false }).limit(80);
  if (!opts?.includeClosed) query = query.eq("status", "open");
  const { data, error } = await query;
  if (error) return { assignments: [], missing: isMissingTable(error) };
  let rows = (data as Assignment[]) || [];
  // When a period is given, show that class's assignments plus the open-to-all ones.
  if (opts?.periodId) {
    rows = rows.filter((a) => a.period_id === opts.periodId || a.period_id === null);
  }
  return { assignments: rows, missing: false };
}

export async function getAssignment(
  supabase: SupabaseClient,
  id: string,
): Promise<Assignment | null> {
  if (SECURE_STUDENT_DATA) {
    try {
      const result = await studentApiRequest<{ assignment: Assignment | null }>(
        `/api/student/practice-attempt?assignmentId=${encodeURIComponent(id)}`,
      );
      return result.assignment;
    } catch {
      return null;
    }
  }
  const { data, error } = await supabase.from("practice_assignments").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return data as Assignment;
}

export async function createAssignment(
  supabase: SupabaseClient,
  input: { periodId: string | null; skill: string; title: string; level: number; targetRounds: number; dueLabel: string | null },
): Promise<{ assignment: Assignment | null; error: string | null }> {
  if (isTeacherSurface()) {
    try {
      const result = await teacherPost<{ assignment: Assignment }>("/api/teacher/practice-assignment", {
        action: "create",
        periodId: input.periodId,
        skill: input.skill,
        title: input.title,
        level: input.level,
        targetRounds: input.targetRounds,
        dueLabel: input.dueLabel,
      });
      return { assignment: result.assignment, error: null };
    } catch (error) {
      return { assignment: null, error: error instanceof Error ? error.message : "Assignment could not be created." };
    }
  }
  const { data, error } = await supabase
    .from("practice_assignments")
    .insert({
      period_id: input.periodId,
      skill: input.skill,
      title: input.title,
      level: input.level,
      target_rounds: input.targetRounds,
      due_label: input.dueLabel,
      status: "open",
    })
    .select("*")
    .single();
  if (error) return { assignment: null, error: isMissingTable(error) ? "SETUP" : error.message };
  return { assignment: data as Assignment, error: null };
}

export async function setAssignmentStatus(
  supabase: SupabaseClient,
  id: string,
  status: "open" | "closed",
): Promise<void> {
  if (isTeacherSurface()) {
    await teacherPost("/api/teacher/practice-assignment", { action: "set-status", assignmentId: id, status });
    return;
  }
  await supabase.from("practice_assignments").update({ status }).eq("id", id);
}

export async function deleteAssignment(supabase: SupabaseClient, id: string): Promise<void> {
  if (isTeacherSurface()) {
    await teacherPost("/api/teacher/practice-assignment", { action: "delete", assignmentId: id, confirm: true });
    return;
  }
  await supabase.from("practice_assignments").delete().eq("id", id);
}

export async function recordAssignmentAttempt(
  supabase: SupabaseClient,
  input: AssignmentAttemptInput,
): Promise<void> {
  if (SECURE_STUDENT_DATA) {
    await studentApiRequest("/api/student/practice-attempt", {
      method: "POST",
      body: JSON.stringify({
        assignmentId: input.assignment_id,
        prompt: input.prompt,
        correctAnswer: input.correct_answer,
        answer: input.answer,
        timeMs: input.time_ms,
        roundIndex: input.round_index,
      }),
    });
    return;
  }
  await supabase.from("practice_assignment_attempts").insert(input);
}

interface RawAttempt {
  student_id: string | null;
  display_name: string | null;
  prompt: string;
  correct_answer: string;
  answer: string | null;
  is_correct: boolean;
  points: number;
}

// How many problems has this student already logged for an assignment? Lets the
// player resume toward the target instead of restarting the count.
export async function countStudentAttempts(
  supabase: SupabaseClient,
  assignmentId: string,
  studentKey: { studentId: string | null; name: string | null },
): Promise<number> {
  if (SECURE_STUDENT_DATA) {
    try {
      const result = await studentApiRequest<{ attemptCount: number }>(
        `/api/student/practice-attempt?assignmentId=${encodeURIComponent(assignmentId)}`,
      );
      return result.attemptCount;
    } catch {
      return 0;
    }
  }
  let query = supabase
    .from("practice_assignment_attempts")
    .select("id", { count: "exact", head: true })
    .eq("assignment_id", assignmentId);
  query = studentKey.studentId
    ? query.eq("student_id", studentKey.studentId)
    : query.eq("display_name", studentKey.name ?? "");
  const { count } = await query;
  return count || 0;
}

export async function getAssignmentResults(
  supabase: SupabaseClient,
  assignmentId: string,
  targetRounds: number,
): Promise<{ students: AssignmentStudentAgg[]; misses: AssignmentMissAgg[] }> {
  if (isTeacherSurface()) {
    try {
      const result = await teacherApiRequest<{ results: { students: AssignmentStudentAgg[]; misses: AssignmentMissAgg[] } }>(
        `/api/teacher/practice-assignment?assignmentId=${encodeURIComponent(assignmentId)}`,
      );
      return result.results;
    } catch {
      return { students: [], misses: [] };
    }
  }
  const { data } = await supabase
    .from("practice_assignment_attempts")
    .select("student_id,display_name,prompt,correct_answer,answer,is_correct,points")
    .eq("assignment_id", assignmentId);
  const rows = (data as RawAttempt[]) || [];
  const sMap = new Map<string, AssignmentStudentAgg>();
  const mMap = new Map<string, AssignmentMissAgg>();
  for (const r of rows) {
    const key = r.student_id || r.display_name || "anon";
    const s = sMap.get(key) || { key, name: r.display_name || "Student", correct: 0, total: 0, points: 0, done: false };
    s.total += 1; s.points += r.points || 0; if (r.is_correct) s.correct += 1;
    s.done = s.total >= targetRounds;
    sMap.set(key, s);
    const m = mMap.get(r.prompt) || { prompt: r.prompt, correct_answer: r.correct_answer, wrong: 0, total: 0 };
    m.total += 1; if (!r.is_correct) m.wrong += 1;
    mMap.set(r.prompt, m);
  }
  return {
    students: Array.from(sMap.values()).sort((a, b) => b.points - a.points),
    misses: Array.from(mMap.values()).filter((m) => m.wrong > 0).sort((a, b) => b.wrong - a.wrong).slice(0, 12),
  };
}
