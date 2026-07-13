// Lesson presets — saved control sequences (the day's lineup + each state's
// minutes). Stored in Supabase (table: lesson_presets) so the library follows
// the teacher across devices. See supabase/lesson-presets.sql.

import { teacherApiRequest, teacherPost } from "@/lib/teacherApi";

export interface PresetStep {
  stateId: string;
}

export interface LessonSequence {
  lineup: PresetStep[];
  minutes: Record<string, number>;
}

export interface LessonPreset {
  id: string;
  code: string;
  title: string;
  lineup: PresetStep[];
  minutes: Record<string, number>;
  updatedAt?: string;
}

interface PresetRow {
  id: string;
  code: string | null;
  title: string | null;
  sequence: Partial<LessonSequence> | null;
  updated_at?: string | null;
}

function rowToPreset(r: PresetRow): LessonPreset {
  const seq = r.sequence ?? {};
  return {
    id: r.id,
    code: r.code ?? "",
    title: r.title ?? "",
    lineup: Array.isArray(seq.lineup) ? seq.lineup : [],
    minutes: seq.minutes && typeof seq.minutes === "object" ? seq.minutes : {},
    updatedAt: r.updated_at ?? undefined,
  };
}

export async function listLessonPresets(search?: string): Promise<LessonPreset[]> {
  let saved: LessonPreset[] = [];
  try {
    const result = await teacherApiRequest<{ presets: PresetRow[] }>("/api/teacher/lesson-preset");
    saved = result.presets.map(rowToPreset);
  } catch {
    saved = [];
  }
  let all = saved;
  const term = (search ?? "").trim().toLowerCase();
  if (term) {
    all = all.filter((r) => r.code.toLowerCase().includes(term) || r.title.toLowerCase().includes(term));
  }
  return all;
}

export async function getLessonPreset(id: string): Promise<LessonPreset | null> {
  try {
    const result = await teacherApiRequest<{ preset: PresetRow | null }>(
      `/api/teacher/lesson-preset?id=${encodeURIComponent(id)}`,
    );
    return result.preset ? rowToPreset(result.preset) : null;
  } catch {
    return null;
  }
}

export async function saveLessonPreset(input: {
  id?: string;
  code: string;
  title: string;
  lineup: PresetStep[];
  minutes: Record<string, number>;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const result = await teacherPost<{ id?: string }>("/api/teacher/lesson-preset", {
      action: "save",
      id: input.id,
      code: input.code.trim(),
      title: input.title.trim(),
      sequence: { lineup: input.lineup, minutes: input.minutes } as LessonSequence,
    });
    return { ok: true, id: result.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Lesson preset could not be saved." };
  }
}

export async function deleteLessonPreset(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await teacherPost("/api/teacher/lesson-preset", { action: "delete", id, confirm: true });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Lesson preset could not be deleted." };
  }
}
