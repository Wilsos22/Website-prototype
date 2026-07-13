import { requireVerifiedStudent, studentIdentityResponse } from "@/lib/studentIdentity";

export async function POST(request: Request) {
  try {
    const student = await requireVerifiedStudent(request);
    return Response.json({
      student: {
        id: student.id,
        name: student.fullName,
        email: student.email,
      },
    });
  } catch (error) {
    return studentIdentityResponse(error);
  }
}
