"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const SCREEN_KEYS = ["learning", "success", "week", "bells"] as const;
const SCREEN_INTERVAL_MS = 20_000;

type WeekdayKey = (typeof WEEKDAY_KEYS)[number];
type ScreenKey = (typeof SCREEN_KEYS)[number];

interface DisplayLesson {
  id: string;
  lessonCode: string;
  title: string;
  standard: string;
  learningIntention: string;
  successCriteria: string;
  discussionVocabulary: string;
  topic: string;
  moduleTopic: string;
  classroomMode: string;
}

interface DisplayDay {
  weekday: string;
  date: string;
  lessons: DisplayLesson[];
}

interface WeeklyDisplayPayload {
  today: string;
  timeZone: string;
  weekStart: string;
  weekEnd: string;
  days: DisplayDay[];
  error?: string;
}

interface WeekdayTheme {
  dark: string;
  light: string;
  ink: string;
  action: string;
  vocabulary: string;
  vocabularyOnDark: string;
  soft: string;
  layout: "left" | "top" | "right" | "bottom";
}

interface BellRow {
  label: string;
  time: string;
  emphasis?: boolean;
}

const WEEKDAY_THEMES: Record<WeekdayKey, WeekdayTheme> = {
  monday: {
    dark: "#3f1647",
    light: "#fbf7ef",
    ink: "#4d164f",
    action: "#f5ad00",
    vocabulary: "#6d7b38",
    vocabularyOnDark: "#dce6b5",
    soft: "#ff9d7f",
    layout: "left",
  },
  tuesday: {
    dark: "#224b3c",
    light: "#fff8e8",
    ink: "#214a3a",
    action: "#e7aa2f",
    vocabulary: "#6b7d43",
    vocabularyOnDark: "#d9e7b5",
    soft: "#e8c08a",
    layout: "top",
  },
  wednesday: {
    dark: "#573a2c",
    light: "#fff4dd",
    ink: "#57352b",
    action: "#dc9d27",
    vocabulary: "#708044",
    vocabularyOnDark: "#dce8b0",
    soft: "#d7b39a",
    layout: "right",
  },
  thursday: {
    dark: "#6b5823",
    light: "#fff9e8",
    ink: "#5f4e20",
    action: "#d9902f",
    vocabulary: "#64783c",
    vocabularyOnDark: "#e0ebba",
    soft: "#e8b98c",
    layout: "bottom",
  },
  friday: {
    dark: "#67405f",
    light: "#fff3dc",
    ink: "#5f3a58",
    action: "#dda228",
    vocabulary: "#697b3e",
    vocabularyOnDark: "#dce8ad",
    soft: "#efbd86",
    layout: "left",
  },
};

const BELL_SCHEDULE: { start: string; end: string; rows: BellRow[] } = {
  start: "7:30 AM",
  end: "1:41 PM",
  rows: [],
};

const ACTION_VERBS = new Set([
  "analyze", "apply", "build", "calculate", "classify", "compare", "construct", "convert", "create",
  "define", "demonstrate", "describe", "determine", "divide", "estimate", "evaluate", "explain", "find",
  "graph", "identify", "interpret", "justify", "measure", "model", "multiply", "plot",
  "prove", "reason", "represent", "scale", "show", "simplify", "solve", "use", "verify", "write",
]);

const COMMON_MATH_WORDS = new Set([
  "area", "decimal", "decimals", "denominator", "equation", "equations", "equivalent", "expression",
  "expressions", "factor", "factors", "fraction", "fractions", "graph", "graphs", "integer", "integers",
  "mean", "median", "numerator", "parttopart", "parttowhole", "percent", "percents", "proportion",
  "proportions", "quantity", "quantities", "rate", "rates", "ratio", "ratios", "table", "tables", "unit",
  "variable", "variables", "volume",
]);

const SCREEN_LABELS: Record<ScreenKey, string> = {
  learning: "Learning intention",
  success: "Success criteria",
  week: "Weekly schedule",
  bells: "Bell schedule",
};

function normalizeWord(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

function vocabularyWords(lesson: DisplayLesson): Set<string> {
  const source = [lesson.discussionVocabulary, lesson.topic, lesson.moduleTopic]
    .filter(Boolean)
    .join(",");
  const words = source
    .split(/[\s,;|/]+/)
    .map(normalizeWord)
    .filter((word) => word.length > 2);
  return new Set([...COMMON_MATH_WORDS, ...words]);
}

function copySize(text: string): string {
  if (text.length > 175) return "clamp(2.15rem, 4.35vw, 5.25rem)";
  if (text.length > 120) return "clamp(2.5rem, 5vw, 6rem)";
  return "clamp(3rem, 5.8vw, 7rem)";
}

function KineticText({ text, vocabulary }: { text: string; vocabulary: Set<string> }) {
  const pieces = text.match(/\s+|[A-Za-z0-9]+(?:[.'’-][A-Za-z0-9]+)*|[^\sA-Za-z0-9]+/g) ?? [text];
  let wordIndex = 0;

  return (
    <>
      {pieces.map((piece, index) => {
        if (/^\s+$/.test(piece)) return <span key={`${index}-${piece}`}>{piece}</span>;
        const normalized = normalizeWord(piece);
        const isWord = Boolean(normalized);
        const isVerb = ACTION_VERBS.has(normalized);
        const isVocabulary = vocabulary.has(normalized) && !isVerb;
        const currentWord = wordIndex;
        if (isWord) wordIndex += 1;
        const style = isWord ? ({ "--word-index": currentWord } as CSSProperties) : undefined;
        const className = [
          isWord ? "wld-word" : "",
          isVerb ? "wld-verb" : "",
          isVocabulary ? "wld-vocabulary" : "",
        ].filter(Boolean).join(" ");
        return <span className={className || undefined} style={style} key={`${index}-${piece}`}>{piece}</span>;
      })}
    </>
  );
}

function formatDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function weekdayIndex(isoDate: string): number {
  const day = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
  if (day === 0) return 0;
  return Math.min(4, Math.max(0, day - 1));
}

function trackMatches(lesson: DisplayLesson, track: string): boolean {
  const haystack = [lesson.lessonCode, lesson.title, lesson.classroomMode].join(" ");
  const isAcc = /\bacc\b/i.test(haystack);
  return track === "acc" ? isAcc : !isAcc;
}

function lessonForTrack(day: DisplayDay, track: string): DisplayLesson | null {
  return day.lessons.find((lesson) => trackMatches(lesson, track)) ?? day.lessons[0] ?? null;
}

function weekdayKey(day: DisplayDay): WeekdayKey {
  const normalized = day.weekday.toLocaleLowerCase();
  return WEEKDAY_KEYS.includes(normalized as WeekdayKey) ? normalized as WeekdayKey : "monday";
}

function themeStyle(theme: WeekdayTheme): CSSProperties {
  return {
    "--wld-dark": theme.dark,
    "--wld-light": theme.light,
    "--wld-ink": theme.ink,
    "--wld-action": theme.action,
    "--wld-vocab": theme.vocabulary,
    "--wld-vocab-dark": theme.vocabularyOnDark,
    "--wld-soft": theme.soft,
  } as CSSProperties;
}

function DayRail({ day }: { day: DisplayDay }) {
  return (
    <header className="wld-rail">
      <strong className="wld-rail-day">{day.weekday}</strong>
      <span className="wld-rail-rule" aria-hidden="true" />
      <time className="wld-rail-date" dateTime={day.date}>{formatDisplayDate(day.date)}</time>
    </header>
  );
}

function Shapes() {
  return (
    <div className="wld-shapes" aria-hidden="true">
      <span className="wld-shape-circle" />
      <span className="wld-shape-square" />
      <span className="wld-shape-rule wld-shape-rule-main" />
      <span className="wld-shape-rule wld-shape-rule-echo" />
    </div>
  );
}

function TargetScreen({
  activeLesson,
  screen,
  vocabulary,
}: {
  activeLesson: DisplayLesson | null;
  screen: "learning" | "success";
  vocabulary: Set<string>;
}) {
  const text = screen === "learning"
    ? activeLesson?.learningIntention.trim() ?? ""
    : activeLesson?.successCriteria.trim() ?? "";

  return (
    <section className="wld-target" aria-labelledby="wld-target-label">
      {activeLesson?.standard && <div className="wld-standard-block">{activeLesson.standard}</div>}
      <h1 className="wld-screen-label" id="wld-target-label">{SCREEN_LABELS[screen]}</h1>
      {text ? (
        <p className="wld-target-copy" style={{ fontSize: copySize(text) }}>
          <KineticText text={text} vocabulary={vocabulary} />
        </p>
      ) : (
        <div className="wld-missing" role="status">
          <strong>Not published yet.</strong>
          <span>This screen will update when the target is ready in Notion.</span>
        </div>
      )}
    </section>
  );
}

function WeekScreen({ days, activeDay, track }: { days: DisplayDay[]; activeDay: DisplayDay; track: string }) {
  return (
    <section className="wld-week" aria-labelledby="wld-week-title">
      <h1 className="wld-page-title" id="wld-week-title">This week</h1>
      <div className="wld-week-list">
        {days.map((day, index) => {
          const lesson = lessonForTrack(day, track);
          const topic = lesson?.topic.trim() || lesson?.moduleTopic.trim() || "Topic not published";
          const isActive = day.date === activeDay.date;
          return (
            <article
              className={`wld-week-row${isActive ? " active" : ""}`}
              aria-current={isActive ? "date" : undefined}
              style={{ "--row-index": index } as CSSProperties}
              key={day.date}
            >
              <span className="wld-week-marker" aria-hidden="true" />
              <strong>{day.weekday.slice(0, 3)}</strong>
              <span>{topic}</span>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function BellScreen() {
  const hasRows = BELL_SCHEDULE.rows.length > 0;
  return (
    <section className="wld-bells" aria-labelledby="wld-bells-title">
      <h1 className="wld-page-title" id="wld-bells-title">Bell schedule</h1>
      {hasRows ? (
        <div className="wld-bell-list" style={{ "--bell-count": BELL_SCHEDULE.rows.length } as CSSProperties}>
          {BELL_SCHEDULE.rows.map((row, index) => (
            <div
              className={`wld-bell-row${row.emphasis ? " emphasis" : ""}`}
              style={{ "--row-index": index } as CSSProperties}
              key={`${row.label}-${row.time}`}
            >
              <strong>{row.label}</strong>
              <span>{row.time}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="wld-bell-preview">
          <div className="wld-bell-preview-row">
            <strong>School starts</strong>
            <span>{BELL_SCHEDULE.start}</span>
          </div>
          <div className="wld-bell-preview-row">
            <strong>School ends</strong>
            <span>{BELL_SCHEDULE.end}</span>
          </div>
          <p>Period schedule coming soon.</p>
        </div>
      )}
    </section>
  );
}

export default function WeeklyDisplayPage() {
  const [payload, setPayload] = useState<WeeklyDisplayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dayOverride, setDayOverride] = useState<WeekdayKey | null>(null);
  const [track, setTrack] = useState("math6");
  const [screenIndex, setScreenIndex] = useState(0);
  const [rotation, setRotation] = useState(true);
  const [motion, setMotion] = useState(true);
  const [animationKey, setAnimationKey] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedDay = params.get("day")?.toLocaleLowerCase() ?? "";
    const requestedScreen = params.get("screen")?.toLocaleLowerCase() ?? "";
    if (WEEKDAY_KEYS.includes(requestedDay as WeekdayKey)) setDayOverride(requestedDay as WeekdayKey);
    if (SCREEN_KEYS.includes(requestedScreen as ScreenKey)) {
      setScreenIndex(SCREEN_KEYS.indexOf(requestedScreen as ScreenKey));
      setRotation(false);
    }
    setTrack(params.get("track")?.toLocaleLowerCase() === "acc" ? "acc" : "math6");
  }, []);

  const loadWeek = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch("/api/weekly-display", { cache: "no-store" });
      const result = await response.json().catch(() => ({})) as WeeklyDisplayPayload;
      if (!response.ok || result.error) throw new Error(result.error || "The weekly display could not load.");
      setPayload(result);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The weekly display could not load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWeek(true);
    const refresh = window.setInterval(() => void loadWeek(false), 60_000);
    return () => window.clearInterval(refresh);
  }, [loadWeek]);

  const activeDay = useMemo(() => {
    if (!payload?.days.length) return null;
    if (dayOverride) return payload.days.find((day) => day.weekday.toLocaleLowerCase() === dayOverride) ?? null;
    return payload.days.find((day) => day.date === payload.today) ?? payload.days[weekdayIndex(payload.today)] ?? payload.days[0];
  }, [dayOverride, payload]);

  const activeLesson = useMemo(() => activeDay ? lessonForTrack(activeDay, track) : null, [activeDay, track]);
  const vocabulary = useMemo(() => activeLesson ? vocabularyWords(activeLesson) : new Set<string>(), [activeLesson]);
  const screen = SCREEN_KEYS[screenIndex];
  const dayKey = activeDay ? weekdayKey(activeDay) : "monday";
  const theme = WEEKDAY_THEMES[dayKey];

  useEffect(() => {
    if (!rotation || !activeDay) return;
    const timer = window.setTimeout(() => {
      setScreenIndex((value) => (value + 1) % SCREEN_KEYS.length);
    }, SCREEN_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [activeDay, rotation, screenIndex]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        setScreenIndex((value) => (value + 1) % SCREEN_KEYS.length);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setScreenIndex((value) => (value - 1 + SCREEN_KEYS.length) % SCREEN_KEYS.length);
      } else if (/^[1-4]$/.test(event.key)) {
        setScreenIndex(Number(event.key) - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const chooseDay = (day: WeekdayKey | null) => {
    setDayOverride(day);
    setScreenIndex(0);
    const url = new URL(window.location.href);
    if (day) url.searchParams.set("day", day);
    else url.searchParams.delete("day");
    window.history.replaceState({}, "", url);
    setAnimationKey((value) => value + 1);
  };

  const chooseScreen = (nextScreen: ScreenKey) => {
    setScreenIndex(SCREEN_KEYS.indexOf(nextScreen));
    setAnimationKey((value) => value + 1);
  };

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen?.();
  };

  const toggleMotion = () => {
    setMotion((value) => {
      if (!value) setAnimationKey((key) => key + 1);
      return !value;
    });
  };

  return (
    <main className={`wld-stage${motion ? "" : " wld-motion-off"}`} style={themeStyle(theme)}>
      <style>{`
        .wld-stage {
          --wld-rail:clamp(150px,11.2vw,215px);
          position:fixed;
          inset:0;
          overflow:hidden;
          background:var(--wld-light);
          color:var(--wld-ink);
          font-family:var(--bdb-font);
          isolation:isolate;
        }
        .asa-fab,.asa-panel,.asa-toast,.abs-stage { display:none !important; }
        .wld-frame { position:absolute; inset:0; overflow:hidden; background:var(--wld-light); color:var(--wld-ink); animation:wld-screen-in .7s cubic-bezier(.16,1,.3,1) both; }
        .wld-screen-success { background:var(--wld-dark); color:var(--wld-light); }
        .wld-screen-bells { background:var(--wld-action); color:var(--wld-dark); }
        @keyframes wld-screen-in { from{ opacity:0; clip-path:inset(0 7% 0 7%); } to{ opacity:1; clip-path:inset(0); } }
        .wld-rail {
          position:absolute;
          z-index:5;
          inset:0 auto 0 0;
          width:var(--wld-rail);
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          gap:clamp(26px,3vh,48px);
          padding:clamp(24px,3vh,48px) 18px;
          background:var(--wld-dark);
          color:var(--wld-light);
          text-transform:uppercase;
          animation:wld-rail-in .72s cubic-bezier(.16,1,.3,1) both;
        }
        @keyframes wld-rail-in { from{ translate:-100% 0; } to{ translate:0 0; } }
        .wld-rail-day,.wld-rail-date { font-weight:800; line-height:1; white-space:nowrap; writing-mode:vertical-rl; transform:rotate(180deg); }
        .wld-rail-day { font-size:clamp(2.6rem,4.15vw,5.25rem); letter-spacing:-.04em; }
        .wld-rail-date { font-size:clamp(1.7rem,2.55vw,3.25rem); letter-spacing:-.035em; }
        .wld-rail-rule { width:clamp(56px,5vw,96px); height:4px; background:var(--wld-action); flex:0 0 auto; }
        .wld-screen-success .wld-rail { background:var(--wld-light); color:var(--wld-dark); }
        .wld-screen-bells .wld-rail { background:var(--wld-dark); color:var(--wld-light); }
        .wld-layout-right .wld-rail { inset:0 0 0 auto; animation-name:wld-rail-right-in; }
        @keyframes wld-rail-right-in { from{ translate:100% 0; } to{ translate:0 0; } }
        .wld-layout-top .wld-rail,.wld-layout-bottom .wld-rail {
          width:auto;
          height:clamp(112px,14vh,150px);
          flex-direction:row;
          justify-content:flex-start;
          gap:clamp(22px,2.5vw,44px);
          padding:16px clamp(28px,4vw,76px);
        }
        .wld-layout-top .wld-rail { inset:0 0 auto 0; animation-name:wld-rail-top-in; }
        .wld-layout-bottom .wld-rail { inset:auto 0 0 0; animation-name:wld-rail-bottom-in; }
        @keyframes wld-rail-top-in { from{ translate:0 -100%; } to{ translate:0 0; } }
        @keyframes wld-rail-bottom-in { from{ translate:0 100%; } to{ translate:0 0; } }
        .wld-layout-top .wld-rail-day,.wld-layout-top .wld-rail-date,.wld-layout-bottom .wld-rail-day,.wld-layout-bottom .wld-rail-date { writing-mode:horizontal-tb; transform:none; }
        .wld-layout-top .wld-rail-day,.wld-layout-bottom .wld-rail-day { font-size:clamp(2.4rem,5vw,5.5rem); }
        .wld-layout-top .wld-rail-date,.wld-layout-bottom .wld-rail-date { font-size:clamp(1.4rem,2.7vw,3rem); }
        .wld-layout-top .wld-rail-rule,.wld-layout-bottom .wld-rail-rule { width:4px; height:clamp(46px,7vh,76px); }
        .wld-content { position:absolute; z-index:2; inset:5.5vh 4.5vw 5.5vh calc(var(--wld-rail) + 4vw); }
        .wld-layout-right .wld-content { inset:5.5vh calc(var(--wld-rail) + 4vw) 5.5vh 4.5vw; }
        .wld-layout-top .wld-content { inset:calc(clamp(112px,14vh,150px) + 4.5vh) 4.5vw 4.5vh; }
        .wld-layout-bottom .wld-content { inset:4.5vh 4.5vw calc(clamp(112px,14vh,150px) + 4.5vh); }
        .wld-target { position:relative; height:100%; display:flex; flex-direction:column; align-items:flex-start; justify-content:center; }
        .wld-standard-block {
          position:absolute;
          top:0;
          left:0;
          padding:.18em .45em .24em;
          background:var(--wld-action);
          color:var(--wld-dark);
          font-size:clamp(2rem,3.7vw,4.8rem);
          font-weight:800;
          line-height:1;
          letter-spacing:-.035em;
          animation:wld-standard-in .55s .12s cubic-bezier(.16,1,.3,1) both;
        }
        @keyframes wld-standard-in { from{ opacity:0; translate:0 -36px; } to{ opacity:1; translate:0 0; } }
        .wld-screen-label { margin:clamp(70px,10vh,118px) 0 clamp(24px,3.5vh,48px); font-size:clamp(1.45rem,2.1vw,2.65rem); line-height:1; font-weight:800; letter-spacing:.015em; text-transform:uppercase; animation:wld-label-in .55s .24s ease-out both; }
        @keyframes wld-label-in { from{ opacity:0; translate:28px 0; } to{ opacity:1; translate:0 0; } }
        .wld-screen-success .wld-target { justify-content:flex-start; padding-top:clamp(130px,17vh,190px); }
        .wld-screen-success .wld-standard-block { color:var(--wld-dark); }
        .wld-screen-success .wld-screen-label { position:absolute; top:0; right:0; min-width:min(470px,46vw); margin:0; padding:.85em 1.2em; background:var(--wld-soft); color:var(--wld-dark); text-align:center; }
        .wld-target-copy { position:relative; z-index:2; max-width:100%; margin:0; color:inherit; font-weight:800; line-height:1.04; letter-spacing:-.052em; text-wrap:balance; }
        .wld-word { display:inline-block; opacity:0; transform:translateY(42px); animation:wld-word-in .56s calc(.45s + (var(--word-index) * .045s)) cubic-bezier(.16,1,.3,1) forwards; }
        @keyframes wld-word-in { to{ opacity:1; transform:translateY(0); } }
        .wld-verb { color:var(--wld-action); }
        .wld-vocabulary { color:var(--wld-vocab); }
        .wld-screen-success .wld-vocabulary { color:var(--wld-vocab-dark); }
        .wld-missing { display:grid; gap:16px; max-width:900px; }
        .wld-missing strong { font-size:clamp(2.7rem,6vw,7.5rem); line-height:.95; letter-spacing:-.05em; }
        .wld-missing span { font-size:clamp(1.2rem,2vw,2.25rem); font-weight:700; }
        .wld-page-title { margin:0; font-size:clamp(3.8rem,7.5vw,9.5rem); line-height:.85; font-weight:800; letter-spacing:-.055em; text-transform:uppercase; }
        .wld-week { height:100%; display:grid; grid-template-rows:auto 1fr; gap:clamp(24px,4vh,50px); }
        .wld-week-list { min-height:0; display:grid; grid-template-rows:repeat(5,1fr); }
        .wld-week-row {
          position:relative;
          display:grid;
          grid-template-columns:clamp(22px,2vw,38px) minmax(90px,13%) 1fr;
          align-items:center;
          gap:clamp(24px,4vw,70px);
          padding:0 clamp(22px,2.5vw,46px);
          border-bottom:4px solid var(--wld-vocab);
          color:var(--wld-ink);
          opacity:0;
          translate:55px 0;
          animation:wld-row-in .52s calc(.18s + (var(--row-index) * .1s)) cubic-bezier(.16,1,.3,1) forwards;
        }
        @keyframes wld-row-in { to{ opacity:1; translate:0 0; } }
        .wld-week-row:last-child { border-bottom:0; }
        .wld-week-row strong { font-size:clamp(2rem,3.8vw,4.8rem); line-height:1; text-transform:uppercase; }
        .wld-week-row > span:last-child { font-size:clamp(1.75rem,3.25vw,4rem); line-height:1; font-weight:800; letter-spacing:-.035em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .wld-week-row.active { background:var(--wld-dark); color:var(--wld-light); border-bottom-color:var(--wld-dark); }
        .wld-week-marker { position:relative; width:clamp(16px,1.7vw,32px); aspect-ratio:1; background:var(--wld-action); opacity:0; transform:scale(.5); }
        .wld-week-row.active .wld-week-marker { opacity:1; transform:scale(1); animation:wld-marker-pulse 4s 1.4s ease-in-out infinite; }
        @keyframes wld-marker-pulse { 0%,86%,100%{ transform:scale(1); } 93%{ transform:scale(1.18); } }
        .wld-bells { height:100%; display:grid; grid-template-rows:auto 1fr; gap:clamp(30px,5vh,62px); }
        .wld-bell-list { min-height:0; display:grid; grid-template-rows:repeat(var(--bell-count,7),1fr); }
        .wld-bell-row,.wld-bell-preview-row { display:grid; grid-template-columns:1fr 1fr; align-items:center; border-bottom:4px solid var(--wld-light); color:var(--wld-dark); }
        .wld-bell-row { opacity:0; translate:50px 0; animation:wld-row-in .48s calc(.18s + (var(--row-index) * .08s)) ease-out forwards; }
        .wld-bell-row.emphasis { background:var(--wld-soft); }
        .wld-bell-row strong,.wld-bell-preview-row strong { padding-right:clamp(24px,4vw,76px); border-right:4px solid var(--wld-light); font-size:clamp(1.8rem,3.6vw,4.7rem); line-height:1; text-transform:uppercase; }
        .wld-bell-row span,.wld-bell-preview-row span { padding-left:clamp(24px,4vw,76px); font-size:clamp(2rem,4vw,5.1rem); line-height:1; font-weight:800; letter-spacing:-.04em; }
        .wld-bell-preview { align-self:center; display:grid; grid-template-rows:repeat(2,minmax(150px,1fr)) auto; width:100%; max-height:68vh; }
        .wld-bell-preview-row { opacity:0; translate:60px 0; animation:wld-row-in .6s .25s ease-out forwards; }
        .wld-bell-preview-row:nth-child(2) { animation-delay:.38s; }
        .wld-bell-preview p { margin:clamp(28px,4vh,54px) 0 0; padding:.62em 1em; background:var(--wld-soft); color:var(--wld-dark); font-size:clamp(1.45rem,2.5vw,3rem); font-weight:800; text-align:center; text-transform:uppercase; }
        .wld-shapes { position:absolute; inset:0; z-index:1; pointer-events:none; overflow:hidden; }
        .wld-shape-circle,.wld-shape-square,.wld-shape-rule { position:absolute; display:block; }
        .wld-shape-circle { width:clamp(220px,23vw,440px); aspect-ratio:1; right:-8%; top:-16%; border-radius:50%; background:var(--wld-soft); animation:wld-circle-drift 12s ease-in-out infinite alternate; }
        @keyframes wld-circle-drift { from{ translate:0 0; rotate:0deg; } to{ translate:-12px 14px; rotate:5deg; } }
        .wld-shape-square { width:clamp(54px,5.4vw,104px); aspect-ratio:1; right:3%; bottom:3%; background:var(--wld-action); animation:wld-square-in .55s .75s cubic-bezier(.16,1,.3,1) both; }
        @keyframes wld-square-in { from{ opacity:0; transform:scale(.2) rotate(-12deg); } to{ opacity:1; transform:scale(1) rotate(0); } }
        .wld-shape-rule { left:calc(var(--wld-rail) + 1px); bottom:8.5%; height:clamp(8px,1vw,18px); background:var(--wld-vocab); transform-origin:left; animation:wld-rule-in .72s .7s cubic-bezier(.16,1,.3,1) both; }
        .wld-shape-rule-main { width:38%; }.wld-shape-rule-echo { width:17%; left:calc(var(--wld-rail) + 16%); bottom:5.2%; opacity:.3; }
        @keyframes wld-rule-in { from{ transform:scaleX(0); } to{ transform:scaleX(1); } }
        .wld-screen-success .wld-shape-circle { width:clamp(250px,26vw,500px); top:auto; right:-7%; bottom:-18%; background:var(--wld-vocab); }
        .wld-screen-success .wld-shape-square { top:5.5%; bottom:auto; left:calc(var(--wld-rail) + 4vw); right:auto; }
        .wld-screen-success .wld-shape-rule { background:var(--wld-vocab-dark); }
        .wld-screen-week .wld-shape-square { display:none; }
        .wld-screen-week .wld-shape-rule { bottom:2.5%; }
        .wld-screen-bells .wld-shape-circle { top:auto; right:-8%; bottom:-28%; background:var(--wld-vocab); }
        .wld-screen-bells .wld-shape-square { top:4%; right:3%; bottom:auto; background:var(--wld-dark); }
        .wld-screen-bells .wld-shape-rule { display:none; }
        .wld-day-tuesday .wld-shape-circle { top:auto; right:auto; left:-10%; bottom:-20%; }
        .wld-day-tuesday .wld-shape-square { top:18%; right:4%; bottom:auto; }
        .wld-day-wednesday .wld-shape-circle { right:auto; left:-10%; top:-18%; }
        .wld-day-wednesday .wld-shape-square { right:auto; left:4%; bottom:3%; }
        .wld-day-wednesday .wld-shape-rule { left:4%; }
        .wld-day-thursday .wld-shape-circle { top:auto; bottom:-20%; right:-8%; }
        .wld-day-thursday .wld-shape-square { left:4%; right:auto; top:5%; bottom:auto; }
        .wld-day-thursday .wld-shape-rule { left:4%; bottom:calc(clamp(112px,14vh,150px) + 2%); }
        .wld-day-friday .wld-shape-circle { top:24%; right:-14%; }
        .wld-day-friday .wld-shape-square { right:auto; left:calc(var(--wld-rail) + 4vw); }
        .wld-loading { position:absolute; inset:0; display:grid; place-items:center; background:var(--wld-light); color:var(--wld-ink); font-size:clamp(1.2rem,2vw,2rem); font-weight:800; }
        .wld-failure { position:absolute; inset:0; display:grid; place-content:center; gap:18px; padding:10vw; background:var(--wld-light); color:var(--wld-ink); text-align:center; }
        .wld-failure h1 { margin:0; font-size:clamp(3rem,7vw,8rem); line-height:.95; letter-spacing:-.05em; }
        .wld-failure p { margin:0; font-size:clamp(1.1rem,2vw,2.2rem); font-weight:700; }
        .wld-hotcorner { position:fixed; z-index:30; right:0; bottom:0; width:min(840px,97vw); min-height:94px; display:flex; justify-content:flex-end; align-items:flex-end; padding:12px; pointer-events:none; }
        .wld-handle { pointer-events:auto; position:absolute; right:8px; bottom:7px; width:16px; height:16px; padding:0; border:0; border-radius:50%; background:color-mix(in srgb,var(--wld-light) 22%,transparent); color:transparent; cursor:pointer; }
        .wld-controls { pointer-events:auto; display:flex; align-items:center; justify-content:flex-end; gap:6px; padding:8px; border:1px solid rgba(255,255,255,.17); border-radius:10px; background:rgba(38,27,33,.95); color:#fff8e8; box-shadow:0 16px 40px rgba(45,31,38,.3); opacity:0; transform:translateY(14px); transition:opacity .18s ease,transform .18s ease; }
        .wld-hotcorner:hover .wld-controls,.wld-hotcorner:focus-within .wld-controls { opacity:1; transform:translateY(0); }
        .wld-control { min-height:38px; padding:0 10px; border:1px solid rgba(255,255,255,.2); border-radius:7px; background:#4a3542; color:#fff8e8; font-family:var(--bdb-font); font-size:.75rem; font-weight:800; cursor:pointer; }
        .wld-control:hover,.wld-control:focus-visible,.wld-control.active { outline:none; border-color:var(--wld-action); background:#5d4353; }
        .wld-control.active { color:#f7c85c; }
        .wld-separator { width:1px; height:30px; background:rgba(255,255,255,.15); }
        .wld-motion-off *,.wld-motion-off *::before,.wld-motion-off *::after { animation:none !important; }
        .wld-motion-off .wld-word,.wld-motion-off .wld-week-row,.wld-motion-off .wld-bell-row,.wld-motion-off .wld-bell-preview-row { opacity:1; transform:none; translate:0 0; }
        @media (prefers-reduced-motion:reduce) {
          .wld-stage *,.wld-stage *::before,.wld-stage *::after { animation:none !important; }
          .wld-word,.wld-week-row,.wld-bell-row,.wld-bell-preview-row { opacity:1; transform:none; translate:0 0; }
        }
        @media (max-width:800px),(max-aspect-ratio:4/3) {
          .wld-stage { --wld-rail:112px; }
          .wld-rail,.wld-layout-right .wld-rail,.wld-layout-top .wld-rail,.wld-layout-bottom .wld-rail {
            inset:0 0 auto 0;
            width:auto;
            height:112px;
            flex-direction:row;
            justify-content:flex-start;
            gap:18px;
            padding:12px 20px;
            animation-name:wld-rail-top-in;
          }
          .wld-rail-day,.wld-rail-date,.wld-layout-top .wld-rail-day,.wld-layout-top .wld-rail-date,.wld-layout-bottom .wld-rail-day,.wld-layout-bottom .wld-rail-date { writing-mode:horizontal-tb; transform:none; }
          .wld-rail-day,.wld-layout-top .wld-rail-day,.wld-layout-bottom .wld-rail-day { font-size:clamp(1.9rem,9vw,3.2rem); }
          .wld-rail-date,.wld-layout-top .wld-rail-date,.wld-layout-bottom .wld-rail-date { font-size:clamp(1rem,5vw,1.8rem); }
          .wld-rail-rule,.wld-layout-top .wld-rail-rule,.wld-layout-bottom .wld-rail-rule { width:3px; height:50px; }
          .wld-content,.wld-layout-right .wld-content,.wld-layout-top .wld-content,.wld-layout-bottom .wld-content { inset:134px 20px 24px; }
          .wld-standard-block { font-size:clamp(1.55rem,7vw,2.7rem); }
          .wld-screen-label { margin:72px 0 24px; font-size:clamp(1rem,4.8vw,1.55rem); }
          .wld-screen-success .wld-target { padding-top:100px; }
          .wld-screen-success .wld-screen-label { min-width:0; padding:.75em 1em; font-size:clamp(.9rem,4.5vw,1.35rem); }
          .wld-target-copy { font-size:clamp(2.15rem,9.7vw,4rem) !important; line-height:1.05; }
          .wld-page-title { font-size:clamp(3rem,13vw,5rem); }
          .wld-week { gap:18px; }
          .wld-week-row { grid-template-columns:64px 1fr; gap:12px; padding:0 8px; border-bottom-width:2px; }
          .wld-week-row strong { font-size:clamp(1.1rem,5.6vw,1.8rem); }
          .wld-week-row > span:last-child { font-size:clamp(1rem,4.7vw,1.55rem); white-space:normal; line-height:1.08; }
          .wld-week-marker { display:none; }
          .wld-bells { gap:18px; }
          .wld-bell-preview { align-self:stretch; grid-template-rows:repeat(2,1fr) auto; }
          .wld-bell-preview-row { grid-template-columns:1fr; align-content:center; gap:10px; border-bottom-width:3px; }
          .wld-bell-preview-row strong { padding:0; border:0; font-size:clamp(1.1rem,5.6vw,1.7rem); }
          .wld-bell-preview-row span { padding:0; font-size:clamp(2.8rem,13vw,5rem); }
          .wld-bell-preview p { font-size:clamp(1rem,4.5vw,1.4rem); }
          .wld-shape-circle { width:220px; opacity:.55; }
          .wld-shape-square { width:54px; }
          .wld-shape-rule { display:none; }
          .wld-controls { max-width:calc(100vw - 20px); flex-wrap:wrap; }
        }
      `}</style>

      {loading && !payload ? (
        <div className="wld-loading" role="status">Loading this week from Notion.</div>
      ) : activeDay && payload ? (
        <div
          className={`wld-frame wld-screen-${screen} wld-layout-${theme.layout} wld-day-${dayKey}`}
          key={`${activeDay.date}-${activeLesson?.id ?? "empty"}-${screen}-${animationKey}`}
        >
          <DayRail day={activeDay} />
          <div className="wld-content">
            {screen === "learning" && <TargetScreen activeLesson={activeLesson} screen="learning" vocabulary={vocabulary} />}
            {screen === "success" && <TargetScreen activeLesson={activeLesson} screen="success" vocabulary={vocabulary} />}
            {screen === "week" && <WeekScreen days={payload.days} activeDay={activeDay} track={track} />}
            {screen === "bells" && <BellScreen />}
          </div>
          <Shapes />
        </div>
      ) : (
        <section className="wld-failure" role="alert">
          <h1>The weekly display could not load.</h1>
          <p>{error || "Reload the page to try again."}</p>
        </section>
      )}

      <aside className="wld-hotcorner" aria-label="Weekly display controls">
        <button className="wld-handle" aria-label="Show weekly display controls">Controls</button>
        <div className="wld-controls">
          <button className={`wld-control${dayOverride === null ? " active" : ""}`} onClick={() => chooseDay(null)}>Today</button>
          {WEEKDAY_KEYS.map((day, index) => (
            <button
              className={`wld-control${dayOverride === day ? " active" : ""}`}
              onClick={() => chooseDay(day)}
              key={day}
            >
              {payload?.days[index]?.weekday.slice(0, 3) ?? day.slice(0, 3)}
            </button>
          ))}
          <span className="wld-separator" aria-hidden="true" />
          {SCREEN_KEYS.map((item, index) => (
            <button
              className={`wld-control${screenIndex === index ? " active" : ""}`}
              onClick={() => chooseScreen(item)}
              key={item}
            >
              {SCREEN_LABELS[item]}
            </button>
          ))}
          <span className="wld-separator" aria-hidden="true" />
          <button className="wld-control" onClick={() => setRotation((value) => !value)}>{rotation ? "Pause rotation" : "Start rotation"}</button>
          <button className="wld-control" onClick={toggleMotion}>{motion ? "Pause motion" : "Play motion"}</button>
          <button className="wld-control" onClick={() => void loadWeek(true)}>Refresh</button>
          <button className="wld-control" onClick={() => void toggleFullscreen()}>Fullscreen</button>
        </div>
      </aside>
    </main>
  );
}
