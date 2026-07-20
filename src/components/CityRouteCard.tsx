"use client";

// The student's private City Route card on /live-flow. Shows ONE city with
// its destination, materials, and first action - never a score, tier, route
// meaning, or any other student's assignment. Renders nothing until the
// teacher releases routes.

import { useEffect, useRef, useState } from "react";
import { SECURE_STUDENT_DATA, studentApiRequest } from "@/lib/studentApi";

interface CityCard {
  city: string;
  destination: string;
  materials: string;
  firstAction: string;
  releasedAt: string | null;
}

interface CardResponse {
  status?: string;
  card?: CityCard;
}

interface Props {
  sessionId: string;
  studentId: string | null;
  studentName: string;
  active: boolean;
}

const POLL_MS = 6000;

export default function CityRouteCard({ sessionId, studentId, studentName, active }: Props) {
  const [card, setCard] = useState<CityCard | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active || !sessionId) return;
    let alive = true;

    const fetchCard = async () => {
      try {
        const params = new URLSearchParams({ sessionId });
        let body: CardResponse;
        if (SECURE_STUDENT_DATA) {
          // Secure rollout: identity comes from the verified student token,
          // never from claimed query params.
          body = await studentApiRequest<CardResponse>(`/api/student/city-route?${params.toString()}`);
        } else {
          if (studentId) params.set("studentId", studentId);
          if (studentName) params.set("name", studentName);
          const res = await fetch(`/api/student/city-route?${params.toString()}`, { cache: "no-store" });
          if (!res.ok) return;
          body = await res.json();
        }
        if (!alive) return;
        setCard(body.status === "released" && body.card ? body.card : null);
      } catch {
        // Network blip or expired student session - keep whatever we last
        // knew and try again next tick.
      }
    };

    fetchCard();
    timerRef.current = setInterval(fetchCard, POLL_MS);
    return () => {
      alive = false;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [active, sessionId, studentId, studentName]);

  if (!active || !card) return null;

  return (
    <section className="lfcr" aria-label="Your route for today">
      <style>{`
        .lfcr { max-width:560px; margin:14px auto 0; text-align:left; background:#fff; border:2px solid var(--lf-accent, var(--bdb-teal)); border-radius:16px; padding:16px 18px; box-shadow:0 10px 26px rgba(32,30,26,0.08); }
        .lfcr-eyebrow { margin:0 0 2px; font-size:0.66rem; font-weight:900; letter-spacing:0.09em; text-transform:uppercase; color:var(--bdb-ink-faint); }
        .lfcr-city { margin:0 0 10px; font-size:clamp(1.5rem,4.4vw,2.1rem); font-weight:900; color:var(--bdb-ink); line-height:1.1; }
        .lfcr-row { display:flex; gap:10px; align-items:baseline; padding:5px 0; border-top:1px solid var(--bdb-line); }
        .lfcr-label { flex:none; width:86px; font-size:0.64rem; font-weight:900; letter-spacing:0.07em; text-transform:uppercase; color:var(--bdb-ink-soft); }
        .lfcr-body { margin:0; font-size:0.92rem; font-weight:650; color:var(--bdb-ink); line-height:1.4; }
      `}</style>
      <p className="lfcr-eyebrow">Your route</p>
      <h2 className="lfcr-city">{card.city}</h2>
      <div className="lfcr-row"><span className="lfcr-label">Go to</span><p className="lfcr-body">{card.destination}</p></div>
      <div className="lfcr-row"><span className="lfcr-label">Bring</span><p className="lfcr-body">{card.materials}</p></div>
      <div className="lfcr-row"><span className="lfcr-label">First</span><p className="lfcr-body">{card.firstAction}</p></div>
    </section>
  );
}
