// The root layout applies shared metadata and the global stylesheet for the prototype.
// The Big Dog Board design-system font (Albert Sans) is loaded via globals.css.
import type { Metadata, Viewport } from "next";
import "./globals.css";
import ClassSync from "@/components/ClassSync";
import AbbieStudentBubble from "@/components/AbbieStudentBubble";

export const metadata: Metadata = {
  title: "Big Dog Math Classroom System",
  description:
    "A classroom math system with student lesson flow, teacher controls, Notion curriculum data, Google Forms warm-up automation, and interactive math tools.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}<ClassSync /><AbbieStudentBubble /></body>
    </html>
  );
}
