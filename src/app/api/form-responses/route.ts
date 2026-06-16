import { getAllFormResponses } from "@/lib/notionFormAnalytics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const responses = await getAllFormResponses();
    return Response.json({ responses });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

