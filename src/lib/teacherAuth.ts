// Lightweight teacher gate (soft auth).
// This hides the teacher area from students and gives a UI entry point. It is
// NOT real security — the PIN check runs in the browser. Before storing real
// student data, upgrade to real auth (Supabase Auth / Google sign-in).
//
// Set your own PIN with the NEXT_PUBLIC_TEACHER_PIN env var in Vercel.
// If unset, it falls back to the default below.

export const TEACHER_OK_KEY = "bdm-teacher-ok";

export function teacherPin(): string {
  return (process.env.NEXT_PUBLIC_TEACHER_PIN || "bigdog").trim();
}

export function isTeacherUnlocked(): boolean {
  try {
    return localStorage.getItem(TEACHER_OK_KEY) === "1";
  } catch {
    return false;
  }
}

export function tryUnlockTeacher(pin: string): boolean {
  const ok = pin.trim().toLowerCase() === teacherPin().toLowerCase();
  if (ok) {
    try {
      localStorage.setItem(TEACHER_OK_KEY, "1");
    } catch {
      /* ignore */
    }
  }
  return ok;
}

export function lockTeacher(): void {
  try {
    localStorage.removeItem(TEACHER_OK_KEY);
  } catch {
    /* ignore */
  }
}
