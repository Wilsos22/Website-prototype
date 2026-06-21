import ToolNav from "@/components/ToolNav";
import { CountdownTimer } from "@/components/CountdownTimer";

export default function TimerPage() {
  return (
    <>
      <ToolNav title="Timer" />
      <CountdownTimer />
    </>
  );
}
