"use client";

// Teacher: scheduled Google Form exit tickets come from published Notion lessons.
// Older in-app tickets remain available as a clearly separated legacy record.

import { useCallback, useEffect, useMemo, useState } from "react";
import SiteNav from "@/components/SiteNav";
import { teacherApiRequest } from "@/lib/teacherApi";
import type { ExitResponseRow, ExitTicket } from "@/lib/exitTickets";

interface PublishedLessonSummary {
  id: string;
  date: string;
  lessonCode: string;
  title: string;
  exitTicketLink: string;
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " at " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function dateOnly(value: string): string {
  return value.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || "";
}

function fmtLessonDate(value: string): string {
  const iso = dateOnly(value);
  if (!iso) return "Date not scheduled";
  const parsed = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function todayInLosAngeles(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function safeHttpUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

const KIND_LABEL: Record<string, string> = {
  "short-answer": "Short answer",
  "multiple-choice": "Multiple choice",
  "fist-to-five": "Fist to five",
};

export default function TeacherExitTicketsPage() {
  const [scheduled, setScheduled] = useState<PublishedLessonSummary[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [legacyTickets, setLegacyTickets] = useState<ExitTicket[]>([]);
  const [legacyMissing, setLegacyMissing] = useState(false);
  const [legacyLoading, setLegacyLoading] = useState(true);
  const [legacyError, setLegacyError] = useState<string | null>(null);
  const [openLegacy, setOpenLegacy] = useState<ExitTicket | null>(null);
  const [responses, setResponses] = useState<ExitResponseRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadSchedule = async () => {
      try {
        const result = await teacherApiRequest<{ lessons: PublishedLessonSummary[] }>("/api/teacher/lessons");
        const linked = (result.lessons || []).flatMap((lesson) => {
          const exitTicketLink = safeHttpUrl(lesson.exitTicketLink || "");
          return exitTicketLink ? [{ ...lesson, exitTicketLink }] : [];
        });
        if (!cancelled) setScheduled(linked);
      } catch (error) {
        if (!cancelled) {
          setScheduleError(error instanceof Error ? error.message : "Published lessons could not be loaded.");
        }
      } finally {
        if (!cancelled) setScheduleLoading(false);
      }
    };

    const loadLegacy = async () => {
      try {
        const result = await teacherApiRequest<{ tickets: ExitTicket[]; missing: boolean }>("/api/teacher/exit-ticket");
        if (!cancelled) {
          setLegacyTickets(result.tickets);
          setLegacyMissing(result.missing);
        }
      } catch (error) {
        if (!cancelled) {
          setLegacyError(error instanceof Error ? error.message : "Legacy in-app tickets could not be loaded.");
        }
      } finally {
        if (!cancelled) setLegacyLoading(false);
      }
    };

    void Promise.all([loadSchedule(), loadLegacy()]);
    return () => { cancelled = true; };
  }, []);

  const groupedSchedule = useMemo(() => {
    const today = todayInLosAngeles();
    const upcoming = scheduled
      .filter((lesson) => dateOnly(lesson.date) >= today)
      .toSorted((a, b) => dateOnly(a.date).localeCompare(dateOnly(b.date)) || a.lessonCode.localeCompare(b.lessonCode));
    const earlier = scheduled
      .filter((lesson) => dateOnly(lesson.date) < today)
      .toSorted((a, b) => dateOnly(b.date).localeCompare(dateOnly(a.date)) || b.lessonCode.localeCompare(a.lessonCode));
    return { upcoming, earlier };
  }, [scheduled]);

  const openLegacyTicket = useCallback(async (ticket: ExitTicket) => {
    setOpenLegacy(ticket);
    setDetailLoading(true);
    setResponses([]);
    try {
      const result = await teacherApiRequest<{ responses: ExitResponseRow[] }>(
        `/api/teacher/exit-ticket?ticketId=${encodeURIComponent(ticket.id)}`,
      );
      setResponses(result.responses);
    } catch (error) {
      setLegacyError(error instanceof Error ? error.message : "Legacy responses could not be loaded.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const tally = useMemo(() => {
    if (!openLegacy || openLegacy.kind === "short-answer") return null;
    const buckets = openLegacy.kind === "fist-to-five"
      ? ["0", "1", "2", "3", "4", "5"]
      : (openLegacy.choices || []);
    return buckets.map((label) => ({
      label,
      count: responses.filter((response) => (response.response || "") === label).length,
    }));
  }, [openLegacy, responses]);

  return (
    <main className="ex">
      <style>{styles}</style>
      <SiteNav variant="teacher" />
      <div className="ex-wrap">
        <header className="ex-head">
          <h1 className="ex-h1">Exit tickets</h1>
          <p className="ex-sub">Google Forms scheduled from published Notion lessons.</p>
        </header>

        <section className="ex-section" aria-labelledby="scheduled-exit-tickets">
          <div className="ex-section-head">
            <div>
              <p className="ex-kicker">Current source</p>
              <h2 className="ex-h2" id="scheduled-exit-tickets">Scheduled Google Forms</h2>
            </div>
            {!scheduleLoading && !scheduleError && (
              <span className="ex-count">{scheduled.length} linked</span>
            )}
          </div>
          <p className="ex-section-copy">Each form below comes from the Exit Ticket Link on a published lesson.</p>

          {scheduleLoading && <p className="ex-soft">Loading published lessons.</p>}
          {scheduleError && <div className="ex-warn" role="alert">{scheduleError}</div>}
          {!scheduleLoading && !scheduleError && scheduled.length === 0 && (
            <div className="ex-card"><p className="ex-soft">No published lessons currently have an Exit Ticket Link in Notion.</p></div>
          )}

          {groupedSchedule.upcoming.length > 0 && (
            <div className="ex-form-list">
              {groupedSchedule.upcoming.map((lesson) => <ScheduledFormRow key={lesson.id} lesson={lesson} />)}
            </div>
          )}

          {groupedSchedule.earlier.length > 0 && (
            <details className="ex-disclosure">
              <summary>Earlier published forms ({groupedSchedule.earlier.length})</summary>
              <div className="ex-form-list ex-disclosure-body">
                {groupedSchedule.earlier.map((lesson) => <ScheduledFormRow key={lesson.id} lesson={lesson} />)}
              </div>
            </details>
          )}
        </section>

        <details className="ex-legacy">
          <summary>Legacy in-app exit tickets{legacyTickets.length ? ` (${legacyTickets.length})` : ""}</summary>
          <div className="ex-legacy-body">
            <p className="ex-section-copy">These are older Big Dog response records. They are not the scheduled exit tickets for current lessons.</p>
            {legacyLoading && <p className="ex-soft">Loading legacy records.</p>}
            {legacyError && <div className="ex-warn" role="alert">{legacyError}</div>}
            {legacyMissing && (
              <div className="ex-warn">Legacy in-app tables are not configured. This does not affect the Google Forms above.</div>
            )}
            {!legacyLoading && !legacyError && !legacyMissing && legacyTickets.length === 0 && (
              <p className="ex-soft">No legacy in-app exit tickets.</p>
            )}

            {!openLegacy && legacyTickets.length > 0 && (
              <div className="ex-list">
                {legacyTickets.map((ticket) => (
                  <button key={ticket.id} className="ex-row" onClick={() => { void openLegacyTicket(ticket); }}>
                    <span className="ex-row-main">
                      <span className="ex-row-title">{ticket.prompt}</span>
                      <span className="ex-row-meta">
                        {fmtWhen(ticket.created_at)} · {KIND_LABEL[ticket.kind] || ticket.kind}{ticket.status === "open" ? " · open" : ""}
                      </span>
                    </span>
                    <span className="ex-row-go">View responses</span>
                  </button>
                ))}
              </div>
            )}

            {openLegacy && (
              <LegacyTicketDetail
                ticket={openLegacy}
                responses={responses}
                tally={tally}
                loading={detailLoading}
                onBack={() => setOpenLegacy(null)}
              />
            )}
          </div>
        </details>
      </div>
    </main>
  );
}

function ScheduledFormRow({ lesson }: { lesson: PublishedLessonSummary }) {
  const title = lesson.title || lesson.lessonCode || "Published lesson";
  const iso = dateOnly(lesson.date);
  return (
    <article className="ex-form-row">
      <div className="ex-form-date">
        <time dateTime={iso || undefined}>{fmtLessonDate(lesson.date)}</time>
        {lesson.lessonCode && <span className="ex-code">{lesson.lessonCode}</span>}
      </div>
      <h3 className="ex-form-title">{title}</h3>
      <a className="ex-open-form" href={lesson.exitTicketLink} target="_blank" rel="noopener noreferrer">
        Open Google Form
      </a>
    </article>
  );
}

function LegacyTicketDetail({
  ticket,
  responses,
  tally,
  loading,
  onBack,
}: {
  ticket: ExitTicket;
  responses: ExitResponseRow[];
  tally: Array<{ label: string; count: number }> | null;
  loading: boolean;
  onBack: () => void;
}) {
  return (
    <div className="ex-detail">
      <button className="ex-back" onClick={onBack}>Back to legacy tickets</button>
      <div className="ex-card">
        <div className="ex-d-title">{ticket.prompt}</div>
        <div className="ex-row-meta">
          {fmtWhen(ticket.created_at)} · {KIND_LABEL[ticket.kind] || ticket.kind} · {responses.length} responses
        </div>
      </div>

      {loading ? <p className="ex-soft">Loading responses.</p> : responses.length === 0 ? (
        <div className="ex-card"><p className="ex-soft">No responses yet.</p></div>
      ) : tally ? (
        <div className="ex-card">
          <h3 className="ex-ch">Tally</h3>
          <div className="ex-tally">
            {tally.map((bucket) => {
              const pct = responses.length ? Math.round((bucket.count / responses.length) * 100) : 0;
              return (
                <div className="ex-tally-row" key={bucket.label}>
                  <span className="ex-tally-lab">{bucket.label}</span>
                  <span className="ex-tally-bar"><span className="ex-tally-fill" style={{ width: `${pct}%` }} /></span>
                  <span className="ex-tally-n">{bucket.count}</span>
                </div>
              );
            })}
          </div>
          <h3 className="ex-ch ex-ch-spaced">Who answered</h3>
          <div className="ex-names">
            {responses.map((response) => (
              <span className="ex-name" key={response.id}>{response.display_name || "Student"}: <b>{response.response}</b></span>
            ))}
          </div>
        </div>
      ) : (
        <div className="ex-card">
          <h3 className="ex-ch">Responses</h3>
          <div className="ex-answers">
            {responses.map((response) => (
              <div className="ex-answer" key={response.id}>
                <span className="ex-answer-name">{response.display_name || "Student"}</span>
                <span className="ex-answer-text">{response.response}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = `
  .ex { min-height:100vh; background:var(--bdb-ground); font-family:var(--bdb-font); color:var(--bdb-ink); padding-bottom:50px; }
  .ex-wrap { max-width:880px; margin:0 auto; padding:0 16px; display:grid; gap:18px; }
  .ex-head { display:grid; gap:4px; }
  .ex-h1 { font-size:clamp(1.7rem,5vw,2.4rem); font-weight:800; letter-spacing:-0.02em; margin:8px 0 0; }
  .ex-sub, .ex-section-copy { color:var(--bdb-ink-soft); font-weight:500; margin:0; line-height:1.5; }
  .ex-section { display:grid; gap:12px; }
  .ex-section-head { display:flex; align-items:end; justify-content:space-between; gap:16px; }
  .ex-kicker { margin:0 0 3px; color:var(--bdb-teal); font-size:0.72rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; }
  .ex-h2 { margin:0; font-size:clamp(1.25rem,3vw,1.6rem); font-weight:850; letter-spacing:-0.015em; }
  .ex-count { flex:none; border:1px solid color-mix(in srgb, var(--bdb-teal) 35%, var(--bdb-line)); border-radius:999px; padding:6px 10px; color:#176f70; background:#edf8f6; font-size:0.78rem; font-weight:800; }
  .ex-soft { color:var(--bdb-ink-soft); font-weight:500; margin:0; }
  .ex-warn { background:#fff7e6; border:1px solid #ffe2a8; color:#92660a; border-radius:14px; padding:14px 16px; font-weight:650; }
  .ex-card { background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r-lg); box-shadow:var(--bdb-shadow-sm); padding:18px 20px; }
  .ex-form-list { display:grid; gap:8px; }
  .ex-form-row { display:grid; grid-template-columns:minmax(170px,auto) minmax(220px,1fr) auto; gap:16px; align-items:center; background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r); padding:15px 16px; box-shadow:var(--bdb-shadow-sm); content-visibility:auto; contain-intrinsic-size:72px; }
  .ex-form-date { display:grid; gap:4px; color:var(--bdb-ink-soft); font-size:0.84rem; font-weight:700; }
  .ex-code { color:#176f70; font-size:0.74rem; font-weight:900; letter-spacing:0.05em; }
  .ex-form-title { margin:0; font-size:1rem; font-weight:800; line-height:1.3; }
  .ex-open-form { border-radius:10px; background:var(--bdb-teal); color:#fff; padding:10px 14px; text-decoration:none; font-size:0.86rem; font-weight:850; white-space:nowrap; }
  .ex-open-form:hover { filter:brightness(1.04); }
  .ex-disclosure, .ex-legacy { border:1px solid var(--bdb-line); border-radius:var(--bdb-r); background:color-mix(in srgb, var(--bdb-card) 74%, var(--bdb-ground)); }
  .ex-disclosure > summary, .ex-legacy > summary { cursor:pointer; padding:14px 16px; color:var(--bdb-ink-soft); font-weight:800; }
  .ex-disclosure-body { padding:0 12px 12px; }
  .ex-legacy-body { display:grid; gap:12px; border-top:1px solid var(--bdb-line); padding:16px; }
  .ex-list { display:grid; gap:8px; }
  .ex-row { display:flex; align-items:center; gap:13px; text-align:left; width:100%; background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r); padding:14px 16px; cursor:pointer; box-shadow:var(--bdb-shadow-sm); }
  .ex-row:hover { border-color:var(--bdb-teal); }
  .ex-row-main { display:flex; flex-direction:column; flex:1; min-width:0; }
  .ex-row-title { font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ex-row-meta { font-size:0.82rem; color:var(--bdb-ink-faint); font-weight:600; }
  .ex-row-go { font-weight:800; color:var(--bdb-teal); font-size:0.84rem; white-space:nowrap; }
  .ex-detail { display:grid; gap:12px; }
  .ex-back { justify-self:start; background:none; border:none; color:var(--bdb-ink-soft); font-weight:800; cursor:pointer; font-size:0.9rem; padding:4px 0; }
  .ex-d-title { font-size:1.2rem; font-weight:900; margin-bottom:4px; }
  .ex-ch { margin:0 0 12px; font-size:1.05rem; font-weight:900; }
  .ex-ch-spaced { margin-top:16px; }
  .ex-tally { display:flex; flex-direction:column; gap:8px; }
  .ex-tally-row { display:flex; align-items:center; gap:12px; }
  .ex-tally-lab { width:80px; font-weight:800; }
  .ex-tally-bar { flex:1; height:14px; background:var(--bdb-ground-2,#efe7d6); border-radius:999px; overflow:hidden; }
  .ex-tally-fill { display:block; height:100%; background:var(--bdb-teal); border-radius:999px; transition:width 300ms ease; }
  .ex-tally-n { font-weight:900; color:var(--bdb-ink); min-width:28px; text-align:right; }
  .ex-names { display:flex; flex-wrap:wrap; gap:8px; }
  .ex-name { background:var(--bdb-ground); border:1px solid var(--bdb-line); border-radius:999px; padding:7px 13px; font-weight:600; font-size:0.85rem; }
  .ex-answers { display:flex; flex-direction:column; gap:8px; }
  .ex-answer { display:flex; flex-direction:column; gap:2px; padding:11px 14px; border-radius:11px; background:var(--bdb-ground); }
  .ex-answer-name { font-weight:800; font-size:0.84rem; color:var(--bdb-ink-soft); }
  .ex-answer-text { font-weight:600; color:var(--bdb-ink); }
  @media (max-width:680px) {
    .ex-form-row { grid-template-columns:1fr; gap:9px; }
    .ex-open-form { justify-self:start; }
    .ex-row { align-items:flex-start; flex-direction:column; }
  }
`;
