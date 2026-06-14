// The root layout applies shared metadata and the global stylesheet for the prototype.
import type { Metadata, Viewport } from "next";
import "./globals.css";
import ClassSync from "@/components/ClassSync";

export const metadata: Metadata = {
  title: "Big Dog Board",
  description: "A small classroom board prototype for teachers.",
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
      <body>{children}<ClassSync /></body>
    </html>
  );
}
