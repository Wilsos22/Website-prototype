// Student join route: submits a short answer to a teacher-created session code.
import { redirect } from "next/navigation";
import { JoinQuestion } from "@/components/JoinQuestion";

export default function JoinPage() {
  if (process.env.NEXT_PUBLIC_SECURE_STUDENT_DATA === "true") redirect("/");
  return <JoinQuestion />;
}
