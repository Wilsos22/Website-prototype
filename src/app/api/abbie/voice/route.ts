// Abbie's real voice. Server-side so ELEVENLABS_API_KEY never reaches the browser.
// POST { text } -> audio/mpeg bytes | JSON { error } (client falls back to browser TTS).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read an optional numeric env var, clamped to a safe range. Lets you tune Abbie's
// cadence live from Vercel (no code push) — set the vars below, then redeploy.
function envNum(name: string, def: number, min: number, max: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}

// Flash v2.5 is ElevenLabs' lowest-latency model — the right pick for live,
// spoken-aloud classroom use. Set ELEVENLABS_MODEL=eleven_turbo_v2_5 for a richer,
// slightly slower read.
const VOICE_MODEL = process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5";

// Default voice = "Jessica", one of ElevenLabs' built-in DEFAULT voices (usable on
// the free API tier). NOTE: community "Voice Library" voices require a PAID plan via
// the API (free tier returns 402 paid_plan_required). Override with ELEVENLABS_VOICE_ID
// — but only with a Default voice's ID unless you're on a paid ElevenLabs plan.
const DEFAULT_VOICE_ID = "cgSgspJ2msm6clMCkdW9";

export async function POST(req: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return Response.json({ error: "no-voice-key" }, { status: 503 });

  let body: { text?: string };
  try { body = await req.json(); } catch { return Response.json({ error: "bad-request" }, { status: 400 }); }
  const text = (body.text || "").trim().slice(0, 800);
  if (!text) return Response.json({ error: "empty" }, { status: 400 });

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": key,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: VOICE_MODEL,
          // All tunable live from Vercel env vars (then redeploy):
          //   ELEVENLABS_SPEED     0.7–1.2  (higher = talks faster)
          //   ELEVENLABS_STABILITY 0–1      (lower = more expressive/conversational)
          //   ELEVENLABS_STYLE     0–1      (higher = more attitude/emphasis)
          voice_settings: {
            stability: envNum("ELEVENLABS_STABILITY", 0.4, 0, 1),
            similarity_boost: envNum("ELEVENLABS_SIMILARITY", 0.8, 0, 1),
            style: envNum("ELEVENLABS_STYLE", 0.35, 0, 1),
            use_speaker_boost: true,
            speed: envNum("ELEVENLABS_SPEED", 1.0, 0.7, 1.2),
          },
        }),
      },
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return Response.json({ error: `elevenlabs-${res.status}`, detail: detail.slice(0, 200) }, { status: 502 });
    }

    const audio = await res.arrayBuffer();
    return new Response(audio, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "voice-unreachable" }, { status: 502 });
  }
}
