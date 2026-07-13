"use client";

import { useEffect, useState } from "react";
import RatioBuilder from "@/components/RatioBuilder";

export default function RatioBuilderPage() {
  const [prompt, setPrompt] = useState<string | undefined>();
  const [presentation, setPresentation] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setPrompt(params.get("prompt") || undefined);
    setPresentation(params.get("presentation") === "1");
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "var(--bdb-ground)" }}>
      <RatioBuilder prompt={prompt} presentation={presentation} />
    </main>
  );
}
