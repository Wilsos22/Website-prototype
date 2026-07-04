// Checkpoint results CSV parser — matches the Independent Proficiency System's
// export shape (checkpoint_results_sample.csv):
//   Date, Student, Email, Source, Checkpoint, Form, Item #, Lesson, Domain,
//   CCSS, Mode, Correct (Y/N), Misconception (if wrong)
// Pure functions (no deps) so the format is testable offline.

export interface CheckpointRow {
  date: string; // ISO date
  student: string;
  email: string; // lowercased
  checkpoint: string; // e.g. IDC-M1-CP1
  item: number; // 1-based item number
  lesson: string;
  ccss: string;
  correct: boolean;
  misconception: string | null;
}

// Minimal CSV parser with quoted-field support ("Beckett, Rio").
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9#]/g, "");

// Tolerant header matching — finds each needed column by normalized name.
const HEADERS: Record<keyof CheckpointRow, string[]> = {
  date: ["date"],
  student: ["student", "name", "studentname"],
  email: ["email", "studentemail", "emailaddress"],
  checkpoint: ["checkpoint", "checkpointid"],
  item: ["item#", "item", "itemnumber", "q#"],
  lesson: ["lesson"],
  ccss: ["ccss", "standard"],
  correct: ["correct", "iscorrect"],
  misconception: ["misconceptionifwrong", "misconception", "tag"],
};

export interface ParseResult {
  rows: CheckpointRow[];
  errors: string[];
  checkpoints: string[]; // distinct checkpoint ids, in file order
}

export function parseCheckpointCsv(text: string): ParseResult {
  const raw = parseCsv(text);
  const errors: string[] = [];
  if (raw.length < 2) return { rows: [], errors: ["CSV needs a header row and at least one data row."], checkpoints: [] };

  const header = raw[0].map(norm);
  const col: Partial<Record<keyof CheckpointRow, number>> = {};
  for (const key of Object.keys(HEADERS) as (keyof CheckpointRow)[]) {
    const idx = header.findIndex((h) => HEADERS[key].includes(h));
    if (idx !== -1) col[key] = idx;
  }
  for (const required of ["email", "checkpoint", "item", "ccss", "correct"] as const) {
    if (col[required] === undefined) errors.push(`Missing required column: ${required} (looked for: ${HEADERS[required].join(", ")}).`);
  }
  if (errors.length) return { rows: [], errors, checkpoints: [] };

  const rows: CheckpointRow[] = [];
  const checkpoints: string[] = [];
  for (let i = 1; i < raw.length; i += 1) {
    const r = raw[i];
    const get = (k: keyof CheckpointRow) => (col[k] !== undefined ? (r[col[k]!] || "").trim() : "");
    const email = get("email").toLowerCase();
    const checkpoint = get("checkpoint");
    const item = parseInt(get("item"), 10);
    const correctRaw = get("correct").toUpperCase();
    if (!email || !checkpoint || !Number.isFinite(item)) { errors.push(`Row ${i + 1}: missing email/checkpoint/item — skipped.`); continue; }
    if (correctRaw !== "Y" && correctRaw !== "N" && correctRaw !== "TRUE" && correctRaw !== "FALSE" && correctRaw !== "1" && correctRaw !== "0") {
      errors.push(`Row ${i + 1}: Correct must be Y/N — got "${get("correct")}" — skipped.`);
      continue;
    }
    if (!checkpoints.includes(checkpoint)) checkpoints.push(checkpoint);
    rows.push({
      date: get("date") || new Date().toISOString().slice(0, 10),
      student: get("student"),
      email,
      checkpoint,
      item,
      lesson: get("lesson"),
      ccss: get("ccss"),
      correct: correctRaw === "Y" || correctRaw === "TRUE" || correctRaw === "1",
      misconception: get("misconception") || null,
    });
  }
  return { rows, errors, checkpoints };
}
