import { requireVerifiedStudent, studentIdentityResponse } from "@/lib/studentIdentity";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const student = await requireVerifiedStudent(request);
    return Response.json(
      {
        student: {
          id: student.id,
          name: student.fullName,
          email: student.email,
          identityMethod: student.identityMethod,
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return studentIdentityResponse(error);
  }
}
