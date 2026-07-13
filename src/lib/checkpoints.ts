// Supabase helpers for SBAC checkpoint delivery + capture. The teacher launches
// a checkpoint item (from the bundled SBAC bank, src/lib/sbacCheckpoints.ts)
// during a lesson; students answer on /checkpoint, the answer is auto-graded
// against the key and the matching misconception is flagged. Results feed the
// checkpoint dashboard and (later) the Notion roll-up.
// Tables live in supabase/checkpoints.sql.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTable } from "@/lib/challenges";
import type { CheckpointMiss } from "@/lib/sbacCheckpoints";
import { isTeacherSurface, teacherApiRequest, teacherPost } from "@/lib/teacherApi";

export interface CheckpointRun {
  id: string;
  session_id: string | null;
  period_id: string | null;
  lesson_key: string | null;
  checkpoint_id: string;
  item_index: number;
  ccss: string | null;
  prompt: string;
  correct_answer: string;
  misses: CheckpointMiss[] | null;
  status: "open" | "closed";
  created_at: string;
}

export interface CheckpointResultRow {
  id: string;
  student_id: string | null;
  display_name: string | null;
  answer: string | null;
  is_correct: boolean;
  misconception: string | null;
  created_at: string;
}

export async function launchCheckpoint(
  supabase: SupabaseClient,
  input: {
    sessionId: string | null; periodId: string | null; lessonKey: string | null;
    checkpointId: string; itemIndex: number; ccss: string | null;
    prompt: string; correctAnswer: string; misses: CheckpointMiss[];
  },
): Promise<{ run: CheckpointRun | null; error: string | null }> {
  if (isTeacherSurface()) {
    try {
      const result = await teacherPost<{ run: CheckpointRun }>("/api/teacher/checkpoint", {
        action: "launch",
        sessionId: input.sessionId,
        periodId: input.periodId,
        lessonKey: input.lessonKey,
        checkpointId: input.checkpointId,
        itemIndex: input.itemIndex,
        ccss: input.ccss,
        prompt: input.prompt,
        correctAnswer: input.correctAnswer,
        misses: input.misses,
      });
      return { run: result.run, error: null };
    } catch (error) {
      return { run: null, error: error instanceof Error ? error.message : "Checkpoint could not be launched." };
    }
  }
  if (input.sessionId) {
    await supabase.from("checkpoint_runs").update({ status: "closed" }).eq("session_id", input.sessionId).eq("status", "open");
  }
  const { data, error } = await supabase
    .from("checkpoint_runs")
    .insert({
      session_id: input.sessionId,
      period_id: input.periodId,
      lesson_key: input.lessonKey,
      checkpoint_id: input.checkpointId,
      item_index: input.itemIndex,
      ccss: input.ccss,
      prompt: input.prompt,
      correct_answer: input.correctAnswer,
      misses: input.misses,
      status: "open",
    })
    .select("*")
    .single();
  if (error) return { run: null, error: isMissingTable(error) ? "SETUP" : error.message };
  return { run: data as CheckpointRun, error: null };
}

export async function closeCheckpoint(supabase: SupabaseClient, id: string): Promise<void> {
  if (isTeacherSurface()) {
    await teacherPost("/api/teacher/checkpoint", { action: "close", runId: id });
    return;
  }
  await supabase.from("checkpoint_runs").update({ status: "closed" }).eq("id", id);
}

export async function getOpenCheckpoint(supabase: SupabaseClient, sessionId: string): Promise<CheckpointRun | null> {
  const { data } = await supabase
    .from("checkpoint_runs")
    .select("*")
    .eq("session_id", sessionId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as CheckpointRun) || null;
}

export async function submitCheckpointResult(
  supabase: SupabaseClient,
  input: { runId: string; sessionId: string | null; studentId: string | null; displayName: string | null; answer: string; isCorrect: boolean; misconception: string | null; ccss: string | null },
): Promise<void> {
  let del = supabase.from("checkpoint_results").delete().eq("run_id", input.runId);
  del = input.studentId ? del.eq("student_id", input.studentId) : del.eq("display_name", input.displayName ?? "");
  await del;
  await supabase.from("checkpoint_results").insert({
    run_id: input.runId,
    session_id: input.sessionId,
    student_id: input.studentId,
    display_name: input.displayName,
    answer: input.answer,
    is_correct: input.isCorrect,
    misconception: input.misconception,
    ccss: input.ccss,
  });
}

export async function listCheckpointRuns(
  supabase: SupabaseClient,
  limit = 40,
): Promise<{ runs: CheckpointRun[]; missing: boolean }> {
  if (isTeacherSurface()) {
    try {
      const result = await teacherApiRequest<{ runs: CheckpointRun[]; missing: boolean }>("/api/teacher/checkpoint");
      return result;
    } catch {
      return { runs: [], missing: false };
    }
  }
  const { data, error } = await supabase
    .from("checkpoint_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { runs: [], missing: isMissingTable(error) };
  return { runs: (data as CheckpointRun[]) || [], missing: false };
}

export async function getCheckpointResults(supabase: SupabaseClient, runId: string): Promise<CheckpointResultRow[]> {
  if (isTeacherSurface()) {
    try {
      const result = await teacherApiRequest<{ results: CheckpointResultRow[] }>(
        `/api/teacher/checkpoint?runId=${encodeURIComponent(runId)}`,
      );
      return result.results;
    } catch {
      return [];
    }
  }
  const { data } = await supabase
    .from("checkpoint_results")
    .select("id,student_id,display_name,answer,is_correct,misconception,created_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });
  return (data as CheckpointResultRow[]) || [];
}
