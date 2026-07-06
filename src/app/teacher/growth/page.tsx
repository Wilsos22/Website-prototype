import { redirect } from "next/navigation";

// "Growth" is the friendly name for the Right Now grouping view — keep one
// page and let both URLs land on it.
export default function GrowthPage() {
  redirect("/teacher/rightnow");
}
