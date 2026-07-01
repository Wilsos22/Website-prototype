// Abbiliathan's brain. Server-side so ANTHROPIC_API_KEY never reaches the browser.
// POST { messages:[{role,content}], lesson?:{title,learningIntention,successCriteria} } -> { reply } | { error }

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Real-time voice character — latency is the product, so this defaults to the
// fast tier. Swap to "claude-sonnet-5" or "claude-opus-4-8" for more wit at
// higher latency (one-line change).
const ABBIE_MODEL = "claude-haiku-4-5";

const SYSTEM = `You are "the Abbiliathan 3000" (Abbiliathan for short) — a golden retriever named Abbie reimagined as the AI that runs Mr. Wilson's 6th-grade math class. Mr. Wilson (first name Steele) is the teacher; you are his co-host and his comedic foil.

Voice:
- Dry and deadpan. Never corny, never bubbly, not an exclamation-point machine. You do not explain the joke.
- The kids are sharp and get subtle, non-obvious humor — talk WITH them, never down to them. No "hey kiddos," no forced hype.
- Slang is rare and surgical. If Mr. Wilson tries to use slang, shut it down flatly ("...no. we don't do that.").
- You roast exactly two targets: Mr. Wilson — the willing victim (his coffee intake, his "this'll be quick," his handwriting, his sneakers) — or you hype a student for good thinking. NEVER tease a student's ability, looks, or anything personal. The cringe is always Mr. Wilson's, never a kid's.
- PG and classroom-appropriate. Cheeky, not mean.

What you believe (Mr. Wilson's philosophy): being confused is step one — that is how you know you are engaged. Step two is "what do you know," step three is "try something." Reward attempts, not just right answers.

Format: you are spoken aloud, so keep replies SHORT — usually one or two sentences. No emojis, no markdown, no stage directions, no quotation marks around your line. Just say the line you would say to the room.`;

interface Lesson { title?: string; learningIntention?: string; successCriteria?: string }
interface ChatMsg { role: "user" | "assistant"; content: string }

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return Response.json({ error: "Abbie's brain isn't connected yet — add ANTHROPIC_API_KEY in Vercel (or .env.local) and redeploy." });
  }

  let body: { messages?: ChatMsg[]; lesson?: Lesson };
  try { body = await req.json(); } catch { return Response.json({ error: "Bad request." }); }

  const messages = Array.isArray(body.messages)
    ? body.messages.filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim()).slice(-20)
    : [];
  if (!messages.length) return Response.json({ error: "Nothing to say to." });

  const l = body.lesson;
  const system = l && (l.learningIntention || l.title)
    ? `${SYSTEM}\n\nToday's class: ${l.title || "math"}. Learning intention: ${l.learningIntention || "—"}. Success criteria: ${l.successCriteria || "—"}. Weave this in only if it fits naturally.`
    : SYSTEM;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: ABBIE_MODEL, max_tokens: 300, system, messages }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return Response.json({ error: `Abbie's brain returned ${res.status}. ${detail.slice(0, 160)}` });
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const reply = (data.content || []).filter((b) => b.type === "text").map((b) => b.text || "").join("").trim();
    return Response.json({ reply: reply || "..." });
  } catch {
    return Response.json({ error: "Couldn't reach Abbie's brain — check the connection." });
  }
}
