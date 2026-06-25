// Lesson presets — saved control sequences (the day's lineup + each state's
// minutes). Stored in Supabase (table: lesson_presets) so the library follows
// the teacher across devices. See supabase/lesson-presets.sql.

import { getSupabase } from "@/lib/supabase";

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
  const supabase = getSupabase();
  let saved: LessonPreset[] = [];
  if (supabase) {
    const { data, error } = await supabase
      .from("lesson_presets")
      .select("id,code,title,sequence,updated_at")
      .order("code", { ascending: true });
    if (!error && data) saved = (data as PresetRow[]).map(rowToPreset);
  }
  let all = saved;
  const term = (search ?? "").trim().toLowerCase();
  if (term) {
    all = all.filter((r) => r.code.toLowerCase().includes(term) || r.title.toLowerCase().includes(term));
  }
  return all;
}

export async function getLessonPreset(id: string): Promise<LessonPreset | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("lesson_presets")
    .select("id,code,title,sequence,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return rowToPreset(data as PresetRow);
}

export async function saveLessonPreset(input: {
  id?: string;
  code: string;
  title: string;
  lineup: PresetStep[];
  minutes: Record<string, number>;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Supabase isn't connected." };
  const payload = {
    code: input.code.trim(),
    title: input.title.trim(),
    sequence: { lineup: input.lineup, minutes: input.minutes } as LessonSequence,
    updated_at: new Date().toISOString(),
  };
  const query = input.id
    ? supabase.from("lesson_presets").update(payload).eq("id", input.id).select("id").maybeSingle()
    : supabase.from("lesson_presets").insert(payload).select("id").maybeSingle();
  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: string } | null)?.id };
}

export async function deleteLessonPreset(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Supabase isn't connected." };
  const { error } = await supabase.from("lesson_presets").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
