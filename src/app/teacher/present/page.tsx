"use client";

import { useEffect, useState, type CSSProperties } from "react";
import InkBoard from "@/components/InkBoard";
import { getSupabase } from "@/lib/supabase";
import { LIVE_FLOW_MODE, type LiveClassFlowSnapshot } from "@/lib/liveClassFlow";

interface StageSession {
  id: string;
  status: string;
  broadcast: string | null;
  live_flow: LiveClassFlowSnapshot | null;
}

interface PollAnswer {
  id: string;
  answer: string | null;
}

function formatTime(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function toolUrl(flow: LiveClassFlowSnapshot) {
  const tool = flow.tool;
  if (!tool) return null;
  const params = new URLSearchParams({ presentation: "1", prompt: tool.prompt });
  for (const [key, value] of Object.entries(tool.config)) params.set(key, String(value));
  return `${tool.route}?${params.toString()}`;
}

export default function ClassroomStagePage() {
  const supabase = getSupabase();
  const [session, setSession] = useState<StageSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [pollAnswers, setPollAnswers] = useState<PollAnswer[]>([]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let stopped = false;
    const load = async () => {
      const { data } = await supabase
        .from("sessions")
        .select("id,status,broadcast,live_flow")
        .eq("status", "open")
        .eq("broadcast", LIVE_FLOW_MODE)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!stopped) {
        setSession((data as StageSession | null) ?? null);
        setLoading(false);
      }
    };
    void load();
    const interval = window.setInterval(load, 1000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [supabase]);

  const flow = session?.live_flow ?? null;
  const pollId = flow?.poll?.id ?? null;

  useEffect(() => {
    if (!supabase || !pollId) {
      setPollAnswers([]);
      return;
    }
    let stopped = false;
    const load = async () => {
      const { data } = await supabase.from("poll_answers").select("id,answer").eq("poll_id", pollId).order("created_at");
      if (!stopped) setPollAnswers((data as PollAnswer[]) || []);
    };
    void load();
    const interval = window.setInterval(load, 1000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [pollId, supabase]);

  const state = flow?.state ?? null;
  const timer = flow?.timer ?? null;
  const poll = flow?.poll ?? null;
  const resource = flow?.resource ?? null;
  const presentation = flow?.presentation ?? null;
  const accent = state?.color || "#14b8a6";
  const embeddedResourceUrl = resource?.url.includes("docs.google.com/forms")
    ? `${resource.url}${resource.url.includes("?") ? "&" : "?"}embedded=true`
    : null;
  const liveToolUrl = flow ? toolUrl(flow) : null;

  return (
    <main className="stage-page" style={{ "--stage-accent": accent } as CSSProperties}>
      <style>{`
        .stage-page { position:fixed; inset:0; box-sizing:border-box; display:grid; grid-template-rows:auto minmax(0,1fr) auto; background:#15120d; color:#201e1a; font-family:Inter,ui-sans-serif,system-ui,sans-serif; padding:14px; overflow:hidden; }
        .stage-frame { display:contents; }
        .stage-top { display:grid; grid-template-columns:1fr auto; align-items:center; gap:24px; min-height:78px; border:1px solid #3b3327; border-bottom:none; border-radius:18px 18px 0 0; background:#211c14; color:#fff; padding:10px 18px 10px 24px; }
        .stage-step { min-width:0; }
        .stage-kicker { margin:0 0 3px; color:var(--stage-accent); font-size:0.7rem; font-weight:900; letter-spacing:0.14em; text-transform:uppercase; }
        .stage-title { margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:clamp(1.35rem,3vw,2.35rem); line-height:1.05; font-weight:900; }
        .stage-timer { min-width:148px; text-align:right; color:#fff; font-size:clamp(2.5rem,6vw,4.7rem); line-height:0.9; font-weight:900; font-variant-numeric:tabular-nums; letter-spacing:-0.04em; }
        .stage-work { position:relative; min-height:0; border:1px solid #3b3327; background:#fff; overflow:hidden; }
        .stage-empty { position:absolute; inset:0; display:grid; place-items:center; padding:30px; text-align:center; background:#fbf7ef; }
        .stage-empty h1 { margin:0; max-width:22ch; color:#201e1a; font-size:clamp(2.4rem,6vw,5.8rem); line-height:1.02; }
        .stage-empty p { margin:14px 0 0; color:#766d5f; font-size:clamp(1rem,2vw,1.45rem); font-weight:700; }
        .stage-directions { position:absolute; inset:0; display:grid; place-items:center; padding:clamp(28px,6vw,90px); background:#fbf7ef; }
        .stage-directions-inner { width:min(100%,1100px); display:grid; gap:18px; }
        .stage-directions h2 { margin:0; max-width:20ch; color:#201e1a; font-size:clamp(2.4rem,6.8vw,6.6rem); line-height:1.02; letter-spacing:-0.035em; }
        .stage-directions p { margin:0; max-width:48ch; border-left:8px solid var(--stage-accent); padding-left:22px; color:#4d463b; white-space:pre-wrap; font-size:clamp(1.2rem,2.7vw,2.15rem); line-height:1.35; font-weight:760; }
        .stage-resource, .stage-tool { position:absolute; inset:0; width:100%; height:100%; border:0; background:#fff; }
        .stage-resource-link { position:absolute; inset:0; display:grid; place-items:center; background:#fbf7ef; }
        .stage-resource-link a { display:flex; min-height:72px; align-items:center; justify-content:center; border:2px solid var(--stage-accent); border-radius:14px; background:var(--stage-accent); color:#08211f; padding:0 30px; text-decoration:none; font-size:1.25rem; font-weight:900; }
        .stage-poll { position:absolute; inset:0; display:grid; align-content:center; justify-items:center; gap:26px; padding:clamp(24px,5vw,70px); background:#fbf7ef; text-align:center; }
        .stage-question { margin:0; max-width:24ch; color:#201e1a; font-size:clamp(2rem,5.3vw,5rem); line-height:1.08; letter-spacing:-0.025em; }
        .stage-response-count { margin:0; color:#766d5f; font-size:clamp(1rem,2.2vw,1.5rem); font-weight:850; }
        .stage-results { width:min(100%,900px); display:grid; gap:13px; }
        .stage-result { display:grid; grid-template-columns:minmax(80px,1fr) minmax(180px,4fr) 60px; align-items:center; gap:14px; font-size:clamp(1rem,2.2vw,1.45rem); font-weight:850; text-align:left; }
        .stage-bar { height:22px; border-radius:999px; background:#e4ddcf; overflow:hidden; }
        .stage-fill { height:100%; border-radius:inherit; background:var(--stage-accent); }
        .stage-bottom { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:20px; min-height:62px; border:1px solid #3b3327; border-top:none; border-radius:0 0 18px 18px; background:#211c14; color:#d8d0c3; padding:8px 20px 8px 24px; }
        .stage-description { margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:clamp(0.9rem,1.6vw,1.2rem); font-weight:750; }
        .stage-status { color:var(--stage-accent); font-size:0.72rem; font-weight:900; letter-spacing:0.12em; text-transform:uppercase; }
      `}</style>

      <section className="stage-frame">
        <header className="stage-top">
          <div className="stage-step">
            <p className="stage-kicker">Big Dog Math Classroom Stage</p>
            <h1 className="stage-title">{presentation?.title || state?.label || "Waiting for the lesson"}</h1>
          </div>
          <div className="stage-timer">{timer ? formatTime(timer.secondsLeft) : "--:--"}</div>
        </header>

        <section className="stage-work">
          {loading ? (
            <div className="stage-empty"><div><h1>Connecting to the classroom</h1><p>The stage will update when Live Class Flow opens.</p></div></div>
          ) : !session || !flow || !state ? (
            <div className="stage-empty"><div><h1>Ready for class</h1><p>Start a session and select Live Class Flow.</p></div></div>
          ) : resource ? (
            embeddedResourceUrl ? <iframe className="stage-resource" src={embeddedResourceUrl} title={resource.label} /> : (
              <div className="stage-resource-link"><a href={resource.url} target="_blank" rel="noreferrer">{resource.label}</a></div>
            )
          ) : poll ? (
            <div className="stage-poll">
              <h2 className="stage-question">{poll.stage === "results" ? "Class Results" : poll.question}</h2>
              {poll.stage === "responding" || poll.kind === "short-answer" ? (
                <p className="stage-response-count">{pollAnswers.length} response{pollAnswers.length === 1 ? "" : "s"} received</p>
              ) : (
                <div className="stage-results">
                  {(poll.choices || []).map((choice) => {
                    const count = pollAnswers.filter((answer) => answer.answer === choice).length;
                    const percent = pollAnswers.length ? Math.round((count / pollAnswers.length) * 100) : 0;
                    return (
                      <div className="stage-result" key={choice}>
                        <span>{poll.kind === "fist-to-five" ? `${choice} / 5` : choice}</span>
                        <div className="stage-bar"><div className="stage-fill" style={{ width: `${percent}%` }} /></div>
                        <span>{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {poll.stage === "results" ? <p className="stage-response-count">{poll.question}</p> : null}
            </div>
          ) : liveToolUrl ? (
            <iframe className="stage-tool" src={liveToolUrl} title={flow.tool?.label || "Lesson tool"} />
          ) : presentation?.mode === "board" ? (
            <InkBoard room={session.id} interactive={false} problem={presentation.body} />
          ) : (
            <div className="stage-directions">
              <div className="stage-directions-inner">
                <h2>{presentation?.title || state.label}</h2>
                <p>{presentation?.body || state.description}</p>
              </div>
            </div>
          )}
        </section>

        <footer className="stage-bottom">
          <p className="stage-description">{state?.description || "The work stays at the center of the screen."}</p>
          <span className="stage-status">{timer?.finished ? "Time is up" : timer?.running ? "In progress" : "Ready"}</span>
        </footer>
      </section>
    </main>
  );
}
