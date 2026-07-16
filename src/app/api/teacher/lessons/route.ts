import { getPublishedLessonArchive } from "@/lib/notionLessonArchive";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const lessons = await getPublishedLessonArchive();
    return Response.json({ lessons }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("The teacher lesson archive could not be loaded.", error);
    return Response.json(
      { error: "Published lessons could not be loaded." },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
