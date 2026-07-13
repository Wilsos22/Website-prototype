// Supabase helpers + scoring for live Challenges.
// Tables live in supabase/challenges.sql (run once in the Supabase SQL editor).

import type { SupabaseClient } from "@supabase/supabase-js";
import { SECURE_STUDENT_DATA, studentApiRequest } from "@/lib/studentApi";
import { isTeacherSurface, teacherApiRequest, teacherPost } from "@/lib/teacherApi";

export interface ChallengeRow {
  id: string;
  session_id: string;
  skill: string;
  title: string;
  level: number;
  duration_seconds: number;
  status: "open" | "closed";
  started_at: string;
  ended_at: string | null;
}

export interface AttemptInput {
  challenge_id: string;
  session_id: string;
  student_id: string | null;
  display_name: string | null;
  prompt: string;
  correct_answer: string;
  answer: string;
  is_correct: boolean;
  points: number;
  time_ms: number;
}

export interface LeaderRow {
  key: string; // student_id or display_name fallback
  name: string;
  points: number;
  correct: number;
  total: number;
}

// Correct answers earn a base score plus a bonus for speed. Answer within the
// first moment earns about +100; the bonus fades to 0 across the window. Wrong earns 0.
export const SPEED_WINDOW_MS = 12000;
export const BASE_POINTS = 100;
export const MAX_SPEED_BONUS = 100;

export function scoreAttempt(isCorrect: boolean, timeMs: number): number {
  if (!isCorrect) return 0;
  const frac = Math.max(0, Math.min(1, (SPEED_WINDOW_MS - timeMs) / SPEED_WINDOW_MS));
  return BASE_POINTS + Math.round(MAX_SPEED_BONUS * frac);
}

// True when the error looks like "table doesn't exist yet" — used to show a
// friendly "run challenges.sql" note instead of a scary error.
export function isMissingTable(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const m = (err.message || "").toLowerCase();
  return err.code === "42P01" || m.includes("does not exist") || m.includes("could not find the table");
}

export async function getLatestChallenge(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{ challenge: ChallengeRow | null; missing: boolean }> {
  if (SECURE_STUDENT_DATA) {
    try {
      const result = await studentApiRequest<{ challenge: ChallengeRow | null }>(
        `/api/student/challenge-attempt?sessionId=${encodeURIComponent(sessionId)}`,
      );
      return { challenge: result.challenge, missing: false };
    } catch {
      return { challenge: null, missing: false };
    }
  }
  const { data, error } = await supabase
    .from("challenges")
    .select("*")
    .eq("session_id", sessionId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { challenge: null, missing: isMissingTable(error) };
  return { challenge: (data as ChallengeRow) || null, missing: false };
}

export async function launchChallenge(
  supabase: SupabaseClient,
  input: { sessionId: string; skill: string; title: string; level: number; durationSeconds: number },
): Promise<{ challenge: ChallengeRow | null; error: string | null }> {
  if (isTeacherSurface()) {
    try {
      const result = await teacherPost<{ challenge: ChallengeRow }>("/api/teacher/challenge", {
        action: "launch",
        sessionId: input.sessionId,
        skill: input.skill,
        title: input.title,
        level: input.level,
        durationSeconds: input.durationSeconds,
      });
      return { challenge: result.challenge, error: null };
    } catch (error) {
      return { challenge: null, error: error instanceof Error ? error.message : "Challenge could not be launched." };
    }
  }
  // Close any still-open challenge for this session first.
  await supabase
    .from("challenges")
    .update({ status: "closed", ended_at: new Date().toISOString() })
    .eq("session_id", input.sessionId)
    .eq("status", "open");
  const { data, error } = await supabase
    .from("challenges")
    .insert({
      session_id: input.sessionId,
      skill: input.skill,
      title: input.title,
      level: input.level,
      duration_seconds: input.durationSeconds,
      status: "open",
    })
    .select("*")
    .single();
  if (error) {
    return { challenge: null, error: isMissingTable(error) ? "SETUP" : error.message };
  }
  return { challenge: data as ChallengeRow, error: null };
}

export async function endChallenge(supabase: SupabaseClient, challengeId: string): Promise<void> {
  if (isTeacherSurface()) {
    await teacherPost("/api/teacher/challenge", { action: "close", challengeId });
    return;
  }
  await supabase
    .from("challenges")
    .update({ status: "closed", ended_at: new Date().toISOString() })
    .eq("id", challengeId);
}

export async function recordAttempt(supabase: SupabaseClient, input: AttemptInput): Promise<void> {
  if (SECURE_STUDENT_DATA) {
    await studentApiRequest("/api/student/challenge-attempt", {
      method: "POST",
      body: JSON.stringify({
        challengeId: input.challenge_id,
        sessionId: input.session_id,
        prompt: input.prompt,
        correctAnswer: input.correct_answer,
        answer: input.answer,
        timeMs: input.time_ms,
      }),
    });
    return;
  }
  await supabase.from("challenge_attempts").insert(input);
}

export async function fetchLeaderboard(
  supabase: SupabaseClient,
  challengeId: string,
): Promise<LeaderRow[]> {
  if (isTeacherSurface()) {
    try {
      const result = await teacherApiRequest<{ leaderboard: LeaderRow[] }>(
        `/api/teacher/challenge?challengeId=${encodeURIComponent(challengeId)}`,
      );
      return result.leaderboard;
    } catch {
      return [];
    }
  }
  if (SECURE_STUDENT_DATA) {
    try {
      const sessionId = typeof window === "undefined"
        ? ""
        : JSON.parse(localStorage.getItem("bdm-student-session") || "{}").sessionId || "";
      const result = await studentApiRequest<{ leaderboard: LeaderRow[] }>(
        `/api/student/challenge-attempt?sessionId=${encodeURIComponent(sessionId)}&challengeId=${encodeURIComponent(challengeId)}`,
      );
      return result.leaderboard;
    } catch {
      return [];
    }
  }
  const { data, error } = await supabase
    .from("challenge_attempts")
    .select("student_id,display_name,points,is_correct")
    .eq("challenge_id", challengeId);
  if (error || !data) return [];
  const rows = data as { student_id: string | null; display_name: string | null; points: number; is_correct: boolean }[];
  const map = new Map<string, LeaderRow>();
  for (const r of rows) {
    const key = r.student_id || r.display_name || "anon";
    const name = r.display_name || "Student";
    const entry = map.get(key) || { key, name, points: 0, correct: 0, total: 0 };
    entry.points += r.points || 0;
    entry.total += 1;
    if (r.is_correct) entry.correct += 1;
    entry.name = name;
    map.set(key, entry);
  }
  return Array.from(map.values()).sort((a, b) => b.points - a.points || b.correct - a.correct);
}
