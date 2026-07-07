import { redirect } from "next/navigation";

// The board display lives at /board; keep the teacher-namespaced URL working.
export default function TeacherBoardRedirect() {
  redirect("/board");
}
