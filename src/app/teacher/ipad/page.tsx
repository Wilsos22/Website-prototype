import { redirect } from "next/navigation";

// The iPad pen surface lives at /ipad; keep the teacher-namespaced URL working.
export default function TeacherIpadRedirect() {
  redirect("/ipad");
}
