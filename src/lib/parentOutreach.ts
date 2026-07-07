// Parent-outreach email templates + a Gmail compose link. Pure functions, no
// PII stored here — the API fills names/emails at build time. Two kinds:
// 'concern' (a student behind on warm-ups) and 'praise' (a bright spot).

export type OutreachKind = "concern" | "praise";

const POSITIVE_NOTES = [
  "It has been a pleasure having {name} in class this year.",
  "{name} brings good energy to our math room.",
  "I have really enjoyed having {name} in math this year.",
  "{name} has a lot of potential in math.",
  "I appreciate having {name} as part of our class.",
];

// Deterministic pick (seeded by the name) so re-opening a draft is stable.
function positiveNote(name: string, seed: number): string {
  const note = POSITIVE_NOTES[Math.abs(seed) % POSITIVE_NOTES.length];
  return note.replace(/\{name\}/g, name);
}

export function firstName(full: string): string {
  return (full || "").trim().split(/\s+/)[0] || (full || "").trim() || "your student";
}

function seedFrom(text: string): number {
  let s = 0;
  for (let i = 0; i < text.length; i++) s = (s * 31 + text.charCodeAt(i)) | 0;
  return s;
}

export interface ConcernInput { name: string; submitted: number; possible: number }
export interface PraiseInput { name: string; reason: string }

export function buildConcernEmail(i: ConcernInput): { subject: string; body: string } {
  const fn = firstName(i.name);
  const subject = `Checking in about ${fn} in math`;
  const body =
    `Hi,\n\n` +
    `${positiveNote(fn, seedFrom(i.name))}\n\n` +
    `I am reaching out because I care about ${fn}'s success in math. So far ${fn} has turned in ${i.submitted} of our ${i.possible} daily warm-ups. Those warm-ups are how I check each student's thinking and catch small misunderstandings early, so I want to make sure I am giving ${fn} the support they need — and the best way I can do that is to review their work.\n\n` +
    `Could we connect on how to help ${fn} stay on top of the daily warm-ups? I am glad to share what we are working on and how you can support at home.\n\n` +
    `Thank you,\nMr. Wilson\n6th Grade Math`;
  return { subject, body };
}

export function buildPraiseEmail(i: PraiseInput): { subject: string; body: string } {
  const fn = firstName(i.name);
  const subject = `Great news about ${fn} in math`;
  const body =
    `Hi,\n\n` +
    `I wanted to share some good news — ${i.reason}. I am proud of the work ${fn} is putting in.\n\n` +
    `${positiveNote(fn, seedFrom(i.name))}\n\n` +
    `Please pass along a well-earned "great job" from me. Thank you for your support at home — it makes a real difference.\n\n` +
    `Thank you,\nMr. Wilson\n6th Grade Math`;
  return { subject, body };
}

export function buildEmail(kind: OutreachKind, name: string, opts: { submitted?: number; possible?: number; reason?: string }): { subject: string; body: string } {
  if (kind === "praise") return buildPraiseEmail({ name, reason: opts.reason || `${firstName(name)} is doing great work in math` });
  return buildConcernEmail({ name, submitted: opts.submitted ?? 0, possible: opts.possible ?? 0 });
}

// A Gmail compose deep-link — opens a pre-filled draft in the teacher's Gmail.
export function gmailComposeUrl(to: string, subject: string, body: string): string {
  const p = new URLSearchParams({ view: "cm", fs: "1", to, su: subject, body });
  return `https://mail.google.com/mail/?${p.toString()}`;
}
