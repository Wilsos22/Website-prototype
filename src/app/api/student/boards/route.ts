import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireVerifiedStudent, StudentIdentityError, studentIdentityResponse } from "@/lib/studentIdentity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireVerifiedStudent(request);
    const date = new URL(request.url).searchParams.get("date") || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new StudentIdentityError("A valid lesson date is required.", 400, "invalid_board_date");
    }
    const db = getSupabaseAdmin();
    if (!db) throw new StudentIdentityError("Board storage is not configured.", 503, "boards_not_configured");
    const { data, error } = await db.storage.from("boards").list(date, {
      limit: 100,
      sortBy: { column: "created_at", order: "asc" },
    });
    if (error) throw new StudentIdentityError("Board images could not be loaded.", 500, "boards_list_failed");
    const paths = (data ?? [])
      .filter((item) => item.name.toLowerCase().endsWith(".png"))
      .map((item) => `${date}/${item.name}`);
    if (!paths.length) return Response.json({ urls: [] }, { headers: { "cache-control": "no-store" } });
    const { data: signed, error: signedError } = await db.storage.from("boards").createSignedUrls(paths, 600);
    if (signedError) throw new StudentIdentityError("Board links could not be created.", 500, "boards_sign_failed");
    return Response.json(
      { urls: (signed ?? []).flatMap((item) => item.signedUrl ? [item.signedUrl] : []) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return studentIdentityResponse(error);
  }
}
