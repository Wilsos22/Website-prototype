"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

function safeNext(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default function StudentAuthCallbackPage() {
  const [message, setMessage] = useState("Finishing your school sign-in.");

  useEffect(() => {
    const finish = async () => {
      const supabase = getSupabase();
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const next = safeNext(params.get("next"));
      if (!supabase || !code) {
        setMessage("The sign-in link is incomplete. Return to Big Dog Math and try again.");
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        setMessage(`Sign-in could not be completed: ${error.message}`);
        return;
      }
      window.location.replace(next);
    };
    void finish();
  }, []);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "var(--bdb-ground)" }}>
      <section style={{ maxWidth: 520, padding: 28, borderRadius: 18, background: "var(--bdb-card)", border: "1px solid var(--bdb-line)", textAlign: "center" }}>
        <h1 style={{ margin: "0 0 10px" }}>School sign-in</h1>
        <p style={{ margin: 0, color: "var(--bdb-ink-soft)" }}>{message}</p>
      </section>
    </main>
  );
}
