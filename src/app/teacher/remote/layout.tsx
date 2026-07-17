import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Big Dog Math Lesson Remote",
  manifest: "/teacher-remote.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Lesson Remote",
  },
  icons: {
    apple: "/big-dog-mark.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fbf6ea",
};

export default function TeacherRemoteLayout({ children }: { children: ReactNode }) {
  return children;
}
