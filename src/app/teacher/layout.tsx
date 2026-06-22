import type { ReactNode } from "react";
import TeacherGate from "@/components/TeacherGate";

export default function TeacherLayout({ children }: { children: ReactNode }) {
  return <TeacherGate>{children}</TeacherGate>;
}
