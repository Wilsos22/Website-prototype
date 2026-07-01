"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import {
  LIVE_FLOW_MODE,
  getStoredStudentSession,
  getStoredStudentSessionId,
  leaveClassMode,
  type DiscussionPhaseId,
  type LiveClassFlowSnapshot,
} from "@/lib/liveClassFlow";

type SessionRow = {
  status: string;
  broadcast: string | null;
  live_flow: LiveClassFlowSnapshot | null;
};

type PollAnswer = {
  id: string;
  answer: string | null;
};

type DiscussionContent = {
  title: string;
  subtitle: string;
  directions?: string[];
  sentenceStems?: string[];
  keyVocabulary?: string[];
};

const DISCUSSION_CONTENT: Record<DiscussionPhaseId, DiscussionContent> = {
  think: {
    title: "🧠 Thinking Time",
    subtitle: "Silent — think on your own.",
    directions: ["Do not talk.", "Do not type.", "Think about your first move."],
  },
  marker: {
    title: "✍️ Commit Your Thinking",
    subtitle: "Write your first answer.",
    directions: ["No group talk yet.", "Mistakes are allowed.", "Blank boards are not."],
  },
  table: {
    title: "💬 Discuss with Your Table",
    subtitle: "Talk it through together.",
    sentenceStems: [
      "I started by…",
      "I noticed…",
      "I disagree because…",
      "Can you explain why…?",
      "I want to revise because…",
    ],
    keyVocabulary: [
      "strategy",
      "evidence",
      "justify",
      "represent",
      "revise",
    ],
  },
  revise: {
    title: "✏️ Revise Your Answer",
    subtitle: "Update your thinking.",
    directions: ["Add, change, or correct something based on your discussion."],
  },
  share: {
    title: "🎤 Share Out",
    subtitle: "Listen and be ready to respond.",
    directions: [
      "Listen for strategy.",
      "Listen for mistakes.",
      "Listen for revisions.",
      "Be ready to agree, disagree, or build.",
    ],
  },
};

function formatTime(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function missingLiveFlowColumn(message: string) {
  return message.includes("live_flow")
    || message.toLowerCase().includes("schema cache")
    || message.toLowerCase().includes("column");
}

export default function LiveFlowPage() {
  const router = useRouter();
  const supabase = getSupabase();
  const [flow, setFlow] = useState<LiveClassFlowSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [emptyMessage, setEmptyMessage] = useState("Waiting for the teacher.");
  const [pollAnswers, setPollAnswers] = useState<PollAnswer[]>([]);
  const [pollAnswer, setPollAnswer] = useState("");
  const [fistRating, setFistRating] = useState(3);
  const [submittedPollIds, setSubmittedPollIds] = useState<string[]>([]);

  useEffect(() => {
    const sessionId = getStoredStudentSessionId();
    if (!supabase || !sessionId) {
      setEmptyMessage(!supabase ? "Live sync is not set up." : "Join the class first.");
      setLoading(false);
      return;
    }

    let stopped = false;
    const connectionFallback = window.setTimeout(() => {
      if (!stopped) setLoading(false);
    }, 3500);
    const applySession = (row: SessionRow | null) => {
      if (stopped) return;
      window.clearTimeout(connectionFallback);
      const isLiveFlow = row?.status === "open" && row.broadcast === LIVE_FLOW_MODE;
      if (!row) {
        setEmptyMessage("This class session is not open.");
      } else if (row.status !== "open") {
        setEmptyMessage("This class session has ended.");
      } else if (row.broadcast !== LIVE_FLOW_MODE) {
        setEmptyMessage("Waiting for Live Class Flow.");
      } else {
        setEmptyMessage("Waiting for the teacher.");
      }
      setFlow(isLiveFlow ? row.live_flow : null);
      setLoading(false);
    };
    const readSession = async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("status,broadcast,live_flow")
        .eq("id", sessionId)
        .maybeSingle();
      if (error) {
        const fallback = await supabase
          .from("sessions")
          .select("status,broadcast")
          .eq("id", sessionId)
          .maybeSingle();
        if (fallback.error) {
          setEmptyMessage(fallback.error.message);
          setFlow(null);
          setLoading(false);
          return;
        }
        applySession({ ...(fallback.data as Omit<SessionRow, "live_flow"> | null), live_flow: null } as SessionRow | null);
        setEmptyMessage(
          error.message && missingLiveFlowColumn(error.message)
            ? "Live Flow database setup is missing."
            : error.message || "Live Flow could not load.",
        );
        return;
      }
      applySession(data as SessionRow | null);
    };

    void readSession();
    const poll = window.setInterval(readSession, 1000);
    const channel = supabase
      .channel(`live-flow-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
        (payload) => applySession(payload.new as SessionRow),
      )
      .subscribe();

    return () => {
      stopped = true;
      window.clearTimeout(connectionFallback);
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  const activePoll = flow?.poll ?? null;
  const activePollId = activePoll?.id ?? null;

  useEffect(() => {
    if (!supabase || !activePollId) {
      setPollAnswers([]);
      return;
    }
    let stopped = false;
    const loadAnswers = async () => {
      const { data } = await supabase
        .from("poll_answers")
        .select("id,answer")
        .eq("poll_id", activePollId)
        .order("created_at");
      if (!stopped) setPollAnswers((data as PollAnswer[]) || []);
    };
    void loadAnswers();
    const interval = window.setInterval(loadAnswers, 1000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [activePollId, supabase]);

  useEffect(() => {
    setPollAnswer("");
    setFistRating(3);
  }, [activePoll?.id]);

  async function submitPollAnswer(answer: string) {
    const student = getStoredStudentSession();
    if (!supabase || !activePoll || !student || !answer.trim() || submittedPollIds.includes(activePoll.id)) return;
    await supabase.from("poll_answers").insert({
      poll_id: activePoll.id,
      ...(student.studentId ? { student_id: student.studentId } : {}),
      display_name: student.name,
      answer: answer.trim(),
    });
    setSubmittedPollIds((current) => [...current, activePoll.id]);
    setPollAnswer("");
  }

  function exitLiveFlow() {
    leaveClassMode();
    router.replace("/");
  }

  const phase = flow?.phase ?? null;
  const discussion = phase ? DISCUSSION_CONTENT[phase.id] : null;
  const title = discussion?.title ?? flow?.state?.label ?? "Waiting for the teacher.";
  const subtitle = discussion?.subtitle ?? flow?.state?.description ?? "";
  const phaseMedia = phase?.media ?? null;
  const timer = flow?.timer ?? null;
  const showTimer = Boolean(timer && timer.totalSeconds > 0 && (!phase || phase.timed));
  const accent = flow?.state?.color ?? "#14b8a6";
  const status = phase?.finished ? "Time is up." : phase?.running ? "In progress" : "Ready";
  const pollSubmitted = activePoll ? submittedPollIds.includes(activePoll.id) : false;
  const sentenceStems = (phase?.sentenceStems ? phase.sentenceStems : discussion?.sentenceStems ?? [])
    .map((stem) => stem.trim())
    .filter(Boolean);
  const keyVocabulary = (phase?.keyVocabulary ? phase.keyVocabulary : discussion?.keyVocabulary ?? [])
    .map((word) => word.trim())
    .filter(Boolean);
  const showDiscussionSupports = !activePoll && (sentenceStems.length > 0 || keyVocabulary.length > 0);

  return (
    <main className="lf-page" style={{ "--lf-accent": accent } as CSSProperties}>
      <style>{`
        .lf-page { min-height:100vh; display:grid; place-items:center; box-sizing:border-box; overflow:hidden; background:#0b0d14; color:#fff; font-family:Inter,ui-sans-serif,system-ui,sans-serif; padding:clamp(20px,5vw,72px); }
        .lf-exit { position:fixed; top:16px; right:16px; z-index:5; min-height:42px; border:1px solid #29324a; border-radius:10px; background:#151a27; color:#5eead4; padding:0 14px; font:inherit; font-size:0.74rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; cursor:pointer; }
        .lf-exit:hover, .lf-exit:focus-visible { border-color:#14b8a6; outline:none; }
        .lf-shell { width:min(100%,960px); text-align:center; display:grid; justify-items:center; gap:clamp(20px,3.6vw,38px); }
        .lf-brand { margin:0; color:var(--lf-accent); font-size:0.76rem; font-weight:900; letter-spacing:0.14em; text-transform:uppercase; }
        .lf-title { margin:0; max-width:22ch; font-size:clamp(2.4rem,7vw,5.9rem); line-height:1.02; font-weight:900; letter-spacing:0; }
        .lf-subtitle { margin:0; max-width:34ch; color:#c8cedd; font-size:clamp(1.15rem,2.8vw,1.75rem); line-height:1.35; font-weight:700; }
        .lf-media-wrap { width:min(100%,760px); display:grid; place-items:center; }
        .lf-media { width:min(100%,720px); max-height:38vh; border:1px solid #29324a; border-radius:12px; background:#090b11; object-fit:contain; box-shadow:0 18px 48px rgb(0 0 0 / 30%); }
        .lf-media.embed { aspect-ratio:16 / 9; height:auto; }
        .lf-timer { display:grid; justify-items:center; gap:10px; }
        .lf-time { color:#fff; font-size:clamp(4.6rem,15vw,10rem); font-variant-numeric:tabular-nums; font-weight:900; line-height:0.9; letter-spacing:0; }
        .lf-status { color:var(--lf-accent); font-size:0.78rem; font-weight:900; letter-spacing:0.13em; text-transform:uppercase; }
        .lf-directions { width:min(100%,720px); display:grid; gap:10px; margin:0; padding:0; list-style:none; }
        .lf-direction { border-left:5px solid var(--lf-accent); background:#151a27; color:#f4f6fb; padding:clamp(13px,2vw,18px) clamp(17px,3vw,26px); text-align:left; font-size:clamp(1.05rem,2.5vw,1.45rem); font-weight:800; line-height:1.35; }
        .lf-supports { width:min(100%,1000px); display:grid; grid-template-columns:minmax(0,1.35fr) minmax(230px,0.75fr); gap:14px; text-align:left; }
        .lf-support-panel { min-width:0; display:grid; align-content:start; gap:13px; border:1px solid #29324a; border-top:5px solid var(--lf-accent); border-radius:12px; background:#151a27; padding:clamp(16px,2.5vw,24px); }
        .lf-support-title { margin:0; color:var(--lf-accent); font-size:clamp(0.78rem,1.6vw,0.98rem); font-weight:900; letter-spacing:0.12em; text-transform:uppercase; }
        .lf-stem-list { display:grid; gap:9px; margin:0; padding:0; list-style:none; }
        .lf-stem { display:flex; align-items:center; min-height:58px; border-left:4px solid var(--lf-accent); background:#0f1420; color:#f4f6fb; padding:10px 14px; font-size:clamp(1rem,2vw,1.22rem); font-weight:850; line-height:1.28; }
        .lf-vocab-list { display:flex; flex-wrap:wrap; gap:9px; margin:0; padding:0; list-style:none; }
        .lf-vocab { background:#0f1420; border:1px solid #34415e; border-radius:999px; color:#f4f6fb; padding:9px 12px; font-size:clamp(0.95rem,1.9vw,1.16rem); font-weight:900; line-height:1.1; }
        .lf-poll { width:min(100%,760px); display:grid; gap:18px; justify-items:center; }
        .lf-poll-question { margin:0; max-width:28ch; color:#fff; font-size:clamp(1.7rem,4.6vw,3.6rem); font-weight:900; line-height:1.12; }
        .lf-poll-help { margin:0; color:#c8cedd; font-size:clamp(1rem,2.2vw,1.3rem); font-weight:700; }
        .lf-poll-choices { width:min(100%,620px); display:grid; gap:10px; }
        .lf-poll-choice, .lf-poll-send { width:100%; min-height:62px; border:2px solid #34415e; border-radius:10px; background:#151a27; color:#fff; padding:14px 18px; font:inherit; font-size:clamp(1rem,2.4vw,1.3rem); font-weight:900; cursor:pointer; }
        .lf-poll-choice:hover, .lf-poll-choice:focus-visible, .lf-poll-send:hover, .lf-poll-send:focus-visible { border-color:var(--lf-accent); outline:none; }
        .lf-poll-entry { width:min(100%,620px); display:grid; gap:10px; }
        .lf-poll-text { width:100%; min-height:130px; box-sizing:border-box; border:2px solid #34415e; border-radius:10px; background:#151a27; color:#fff; padding:14px 16px; font:inherit; font-size:1.1rem; font-weight:700; resize:vertical; }
        .lf-poll-send { border-color:var(--lf-accent); background:var(--lf-accent); color:#061312; }
        .lf-fist { width:min(100%,650px); display:grid; gap:14px; }
        .lf-slider { width:100%; accent-color:var(--lf-accent); cursor:pointer; }
        .lf-fist-value { color:#fff; font-size:clamp(4rem,10vw,7rem); font-weight:900; line-height:0.9; }
        .lf-fist-labels { display:flex; justify-content:space-between; gap:6px; color:#8a93ad; font-size:0.76rem; font-weight:900; text-transform:uppercase; }
        .lf-poll-sent { color:#86efac; font-size:clamp(1.1rem,2.5vw,1.5rem); font-weight:900; }
        .lf-results { width:min(100%,760px); display:grid; gap:10px; }
        .lf-result { display:grid; grid-template-columns:minmax(70px,1fr) minmax(100px,3fr) auto; gap:10px; align-items:center; color:#dfe5f5; font-size:clamp(0.95rem,2vw,1.18rem); font-weight:800; }
        .lf-result-bar { height:13px; overflow:hidden; border-radius:999px; background:#20283b; }
        .lf-result-fill { height:100%; border-radius:inherit; background:var(--lf-accent); transition:width 220ms ease; }
        .lf-wait { color:#c8cedd; font-size:clamp(2rem,5vw,4.2rem); font-weight:900; line-height:1.1; }
        .lf-switches { display:flex; flex-wrap:wrap; justify-content:center; gap:10px; }
        .lf-switch { display:inline-flex; align-items:center; justify-content:center; min-height:48px; border:1px solid #29324a; border-radius:10px; background:#151a27; color:#5eead4; padding:0 18px; text-decoration:none; font-size:0.9rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; }
        .lf-switch:hover, .lf-switch:focus-visible { border-color:#14b8a6; outline:none; }
        .lf-loading { color:#8a93ad; font-weight:800; }
        @media (max-width:760px) { .lf-supports { grid-template-columns:1fr; } }
        @media (max-width:600px) { .lf-page { padding:26px 18px; } }
      `}</style>

      <button className="lf-exit" type="button" onClick={exitLiveFlow}>Exit Live Flow</button>

      <section className="lf-shell" aria-live="polite">
        <p className="lf-brand">Big Dog Math</p>
        {loading ? (
          <p className="lf-loading">Connecting to class…</p>
        ) : !flow?.state ? (
          <>
            <h1 className="lf-wait">{emptyMessage}</h1>
            <div className="lf-switches">
              <a className="lf-switch" href="/?leaveClass=1">Return to website</a>
              <a className="lf-switch" href="/join?leaveClass=1">Join a different session</a>
            </div>
          </>
        ) : (
          <>
            {!activePoll && <h1 className="lf-title">{title}</h1>}
            {!activePoll && subtitle && <p className="lf-subtitle">{subtitle}</p>}
            {!activePoll && phaseMedia && (
              <div className="lf-media-wrap">
                {phaseMedia.type === "video" ? (
                  <video className="lf-media" src={phaseMedia.url} autoPlay muted loop playsInline />
                ) : phaseMedia.type === "embed" ? (
                  <iframe
                    className="lf-media embed"
                    src={phaseMedia.url}
                    title={`${title} media`}
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <img className="lf-media" src={phaseMedia.url} alt="" />
                )}
              </div>
            )}
            {showTimer && timer && (
              <div className="lf-timer">
                <div className="lf-time">{formatTime(timer.secondsLeft)}</div>
                <div className="lf-status">{status}</div>
              </div>
            )}
            {activePoll ? activePoll.stage === "responding" ? (
              <section className="lf-poll">
                <h1 className="lf-poll-question">{activePoll.question}</h1>
                {activePoll.kind === "fist-to-five" ? (
                  <>
                    <p className="lf-poll-help">Slide to show your current understanding.</p>
                    <div className="lf-fist">
                      <div className="lf-fist-value">{fistRating}</div>
                      <input
                        className="lf-slider"
                        type="range"
                        min="0"
                        max="5"
                        step="1"
                        value={fistRating}
                        aria-label="Understanding from 0 to 5"
                        disabled={pollSubmitted}
                        onChange={(event) => setFistRating(Number(event.target.value))}
                      />
                      <div className="lf-fist-labels"><span>0 · Not yet</span><span>5 · Can explain</span></div>
                    </div>
                    {pollSubmitted ? <p className="lf-poll-sent">Check-in sent.</p> : <button className="lf-poll-send" onClick={() => submitPollAnswer(String(fistRating))}>Send check-in</button>}
                  </>
                ) : activePoll.kind === "multiple-choice" ? (
                  <div className="lf-poll-choices">
                    {activePoll.choices?.map((choice) => (
                      <button className="lf-poll-choice" key={choice} disabled={pollSubmitted} onClick={() => submitPollAnswer(choice)}>{choice}</button>
                    ))}
                    {pollSubmitted && <p className="lf-poll-sent">Answer sent.</p>}
                  </div>
                ) : (
                  <div className="lf-poll-entry">
                    <textarea className="lf-poll-text" value={pollAnswer} disabled={pollSubmitted} onChange={(event) => setPollAnswer(event.target.value)} placeholder="Type your answer" />
                    {pollSubmitted ? <p className="lf-poll-sent">Answer sent.</p> : <button className="lf-poll-send" onClick={() => submitPollAnswer(pollAnswer)}>Send answer</button>}
                  </div>
                )}
              </section>
            ) : (
              <section className="lf-poll">
                <h1 className="lf-poll-question">Results</h1>
                <p className="lf-poll-help">{activePoll.question}</p>
                {activePoll.kind === "short-answer" ? (
                  <p className="lf-poll-sent">{pollAnswers.length} response{pollAnswers.length === 1 ? "" : "s"} submitted.</p>
                ) : (
                  <div className="lf-results">
                    {(activePoll.choices || []).map((choice) => {
                      const count = pollAnswers.filter((answer) => answer.answer === choice).length;
                      const percent = pollAnswers.length ? Math.round((count / pollAnswers.length) * 100) : 0;
                      return (
                        <div className="lf-result" key={choice}>
                          <span>{activePoll.kind === "fist-to-five" ? `${choice} / 5` : choice}</span>
                          <div className="lf-result-bar"><div className="lf-result-fill" style={{ width: `${percent}%` }} /></div>
                          <span>{count}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : null}
            {!activePoll && discussion?.directions && (
              <ul className="lf-directions">
                {discussion.directions.map((direction) => <li className="lf-direction" key={direction}>{direction}</li>)}
              </ul>
            )}
            {showDiscussionSupports && (
              <section className="lf-supports" aria-label="Discussion supports">
                {sentenceStems.length > 0 && (
                  <div className="lf-support-panel">
                    <h2 className="lf-support-title">Sentence Stems</h2>
                    <ul className="lf-stem-list">
                      {sentenceStems.map((stem) => <li className="lf-stem" key={stem}>{stem}</li>)}
                    </ul>
                  </div>
                )}
                {keyVocabulary.length > 0 && (
                  <div className="lf-support-panel">
                    <h2 className="lf-support-title">Key Vocabulary</h2>
                    <ul className="lf-vocab-list">
                      {keyVocabulary.map((word) => <li className="lf-vocab" key={word}>{word}</li>)}
                    </ul>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </section>
    </main>
  );
}
