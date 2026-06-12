// Shared header used by every tool page so the teacher can quickly return home.
import Link from "next/link";
import type { ReactNode } from "react";

interface ToolHeaderProps {
  title: string;
  children?: ReactNode;
}

export function ToolHeader({ title, children }: ToolHeaderProps) {
  return (
    <header className="tool-header">
      <Link className="small-button" href="/">
        Home
      </Link>
      <h1 className="tool-title">{title}</h1>
      <div className="toolbar">{children}</div>
    </header>
  );
}
