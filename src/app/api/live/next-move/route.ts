// Teacher-only (middleware gates /api/live): a Claude-sharpened next move for a
// misconception cluster. The Right-now view sends the cluster it already
// computed; this returns ONE concrete, classroom-ready reteach the teacher can
// run in the next few minutes — grounded in the Big Dog Math manipulatives and
// tuned to the group's archetype. Falls back to the template on any failure, so
// the live view never breaks.
//
// Reuses ANTHROPIC_API_KEY (already set for Abbie) — no new configuration.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Occasional, teacher-facing, quality-over-latency → the strong model.
const MOVE_MODEL = "claude-opus-4-8";

const TOOLS =
  "In-class manipulatives you can send students to: Equation Builder, GEMS (order of operations), " +
  "Combine Like Terms, Fraction Bars, Number Line, Double Number Line, Percent Bar, Area Model, Coordinate Grid.";

const ARCHETYPE_INTENT: Record<string, string> = {
  strong_misc: "strong overall but this one misconception keeps slipping — go targeted/challenge, NOT remedial; make them articulate why the shortcut fails",
  leaper: "low baseline but climbing fast — one quick reteach then release; don't hold them back",
  plateau: "stuck flat with this misconception recurring — the misconception is likely WHY they've plateaued; break it with a fresh model + short daily checks",
  low: "chronically low — reteach from concrete/manipulative before symbols, 1:1 or tiny group, check the prerequisite skill first",
  high: "high and steady — extension or peer-teaching",
  growth: "developing steadily — one targeted practice at their level, confirm tomorrow",
  nonsub: "logistics not math — follow-through is the issue",
};

interface Body {
  misconception?: string;
  archetype?: string;
  standardId?: string;
  domain?: string;
  students?: string[];
  corroborated?: number;
  templateMove?: string;
}

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  let body: Body;
  try { body = await req.json(); } catch { return Response.json({ error: "Bad request." }, { status: 400 }); }

  const misconception = (body.misconception || "").trim();
  if (!misconception) return Response.json({ error: "misconception required" }, { status: 400 });

  // Graceful fallback if the AI key isn't present — return the template unchanged.
  if (!key) return Response.json({ move: body.templateMove || "", enriched: false });

  const archetype = body.archetype || "growth";
  const intent = ARCHETYPE_INTENT[archetype] || ARCHETYPE_INTENT.growth;
  const students = Array.isArray(body.students) ? body.students.filter(Boolean) : [];

  const system =
    "You are a 6th-grade math instructional coach helping a teacher act in the moment. Given a small " +
    "group that shares ONE misconception, write a single concrete reteach move the teacher can run in " +
    "the next few minutes. Rules: 2-3 sentences, no preamble, no bullet lists, no 'consider' or 'you " +
    "could' hedging — say exactly what to do. Reference a specific manipulative when it genuinely helps. " +
    "Match the group's archetype. Never shame students; the fix is always about the math, never the kid. " +
    TOOLS;

  const user =
    `Misconception: "${misconception}"` +
    (body.standardId ? ` (standard ${body.standardId}${body.domain ? `, ${body.domain}` : ""})` : "") + ".\n" +
    `Group archetype: ${archetype} — ${intent}.\n` +
    (students.length ? `Students (${students.length}): ${students.join(", ")}.\n` : "") +
    (body.corroborated ? `i-Ready corroborates the gap for ${body.corroborated} of them.\n` : "") +
    (body.templateMove ? `Starting template (sharpen it, make it specific to THIS misconception): "${body.templateMove}".\n` : "") +
    "Write the one move.";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: MOVE_MODEL, max_tokens: 320, system, messages: [{ role: "user", content: user }] }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return Response.json({ move: body.templateMove || "", enriched: false, error: `AI ${res.status}: ${detail.slice(0, 140)}` });
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const move = (data.content || []).filter((b) => b.type === "text").map((b) => b.text || "").join("").trim();
    return Response.json({ move: move || body.templateMove || "", enriched: Boolean(move) });
  } catch {
    return Response.json({ move: body.templateMove || "", enriched: false, error: "Couldn't reach the AI." });
  }
}
