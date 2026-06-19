"use client";

import Link from "next/link";
import type { CSSProperties, FormEvent, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type Mode = "practice" | "mastery";
type Phase = "ready" | "playing" | "summary";
type FactMax = 5 | 10 | 12;
type RoundSeconds = 30 | 60 | 90;
type FocusFactor = "mixed" | number;
type FeedbackKind = "idle" | "correct" | "miss";
type Medal = "Platinum" | "Gold" | "Silver" | "Bronze" | "Complete";

type Fact = {
  a: number;
  b: number;
};

type LeaderboardEntry = {
  id: string;
  name: string;
  seconds: number;
  misses: number;
  medal: Medal;
};

const FACT_MAX_OPTIONS: FactMax[] = [5, 10, 12];
const ROUND_OPTIONS: RoundSeconds[] = [30, 60, 90];
const FOCUS_FACTORS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const NUMBER_KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0"];
const FACTS_PER_MASTERY_RUN = 144;
const LEADERBOARD_KEY = "bdm-multiplication-mastery-leaderboard";
const PLAYER_NAME_KEY = "bdm-multiplication-player-name";
const INITIAL_PRACTICE_FACT: Fact = { a: 2, b: 2 };
const MEDAL_TARGETS = [
  { medal: "Platinum" as const, seconds: 180, color: "#64748b" },
  { medal: "Gold" as const, seconds: 300, color: "#d89028" },
  { medal: "Silver" as const, seconds: 420, color: "#94a3b8" },
  { medal: "Bronze" as const, seconds: 600, color: "#b7793e" },
];

function randomInt(max: number) {
  return Math.floor(Math.random() * max) + 1;
}

function shuffleFacts(facts: Fact[]) {
  const next = [...facts];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function buildMasteryDeck() {
  const deck: Fact[] = [];
  for (let a = 1; a <= 12; a += 1) {
    for (let b = 1; b <= 12; b += 1) {
      deck.push({ a, b });
    }
  }
  return shuffleFacts(deck);
}

function makePracticeFact(maxFactor: number, focusFactor: FocusFactor, previous?: Fact): Fact {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let a = randomInt(maxFactor);
    let b = randomInt(maxFactor);

    if (typeof focusFactor === "number") {
      a = focusFactor;
      b = randomInt(maxFactor);
      if (Math.random() > 0.5) [a, b] = [b, a];
    }

    if (!previous || previous.a !== a || previous.b !== b) return { a, b };
  }

  return { a: randomInt(maxFactor), b: randomInt(maxFactor) };
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function focusLabel(focusFactor: FocusFactor) {
  return focusFactor === "mixed" ? "Mixed" : `x${focusFactor}`;
}

function getMedal(seconds: number): Medal {
  return MEDAL_TARGETS.find((target) => seconds <= target.seconds)?.medal ?? "Complete";
}

function medalColor(medal: Medal) {
  return MEDAL_TARGETS.find((target) => target.medal === medal)?.color ?? "#168978";
}

function medalMessage(medal: Medal) {
  if (medal === "Platinum") return "Platinum pace. That is serious fact power.";
  if (medal === "Gold") return "Gold level. Fast and steady.";
  if (medal === "Silver") return "Silver level. Strong fluency run.";
  if (medal === "Bronze") return "Bronze level. You finished the full 12x12 board.";
  return "Full board complete. Now chase bronze.";
}

function sortLeaderboard(entries: LeaderboardEntry[]) {
  const medalRank: Record<Medal, number> = { Platinum: 0, Gold: 1, Silver: 2, Bronze: 3, Complete: 4 };
  return [...entries].sort((a, b) => {
    const medalDelta = medalRank[a.medal] - medalRank[b.medal];
    if (medalDelta !== 0) return medalDelta;
    if (a.seconds !== b.seconds) return a.seconds - b.seconds;
    return a.misses - b.misses;
  });
}

function readLeaderboard(): LeaderboardEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || "[]") as LeaderboardEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function FactCard({
  fact,
  answer,
  phase,
  feedback,
  feedbackKind,
  inputRef,
  onAnswerChange,
  onSubmit,
}: {
  fact: Fact;
  answer: string;
  phase: Phase;
  feedback: string;
  feedbackKind: FeedbackKind;
  inputRef: RefObject<HTMLInputElement | null>;
  onAnswerChange: (value: string) => void;
  onSubmit: (event?: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className={`mf-card ${feedbackKind}`}>
      <div className="mf-equation" aria-live="polite">
        <span>{fact.a}</span>
        <span className="mf-times">x</span>
        <span>{fact.b}</span>
      </div>

      <form className="mf-answer-form" onSubmit={onSubmit}>
        <input
          ref={inputRef}
          className="mf-answer"
          value={answer}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={3}
          aria-label="Answer"
          placeholder={phase === "playing" ? "Answer" : "Ready"}
          disabled={phase !== "playing"}
          onChange={(event) => onAnswerChange(event.target.value.replace(/\D/g, "").slice(0, 3))}
        />
        <button className="mf-submit" disabled={phase !== "playing"} type="submit">
          Enter
        </button>
      </form>

      <div className={`mf-feedback ${feedbackKind}`}>{feedback}</div>
    </div>
  );
}

function NumberPad({
  disabled,
  onDigit,
  onDelete,
  onSkip,
  onEnter,
}: {
  disabled: boolean;
  onDigit: (digit: string) => void;
  onDelete: () => void;
  onSkip: () => void;
  onEnter: () => void;
}) {
  return (
    <div className="mf-pad" aria-label="Number pad">
      {NUMBER_KEYS.map((digit) => (
        <button className="mf-key" key={digit} onClick={() => onDigit(digit)} disabled={disabled}>
          {digit}
        </button>
      ))}
      <button className="mf-key" onClick={onDelete} disabled={disabled}>
        Del
      </button>
      <button className="mf-key" onClick={onSkip} disabled={disabled}>
        Skip
      </button>
      <button className="mf-key enter" onClick={onEnter} disabled={disabled}>
        Enter
      </button>
    </div>
  );
}

function PracticeGame() {
  const [maxFactor, setMaxFactor] = useState<FactMax>(10);
  const [roundSeconds, setRoundSeconds] = useState<RoundSeconds>(60);
  const [focusFactor, setFocusFactor] = useState<FocusFactor>("mixed");
  const [phase, setPhase] = useState<Phase>("ready");
  const [remaining, setRemaining] = useState<number>(roundSeconds);
  const [fact, setFact] = useState<Fact>(INITIAL_PRACTICE_FACT);
  const [answer, setAnswer] = useState("");
  const [correct, setCorrect] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [feedback, setFeedback] = useState("Ready");
  const [feedbackKind, setFeedbackKind] = useState<FeedbackKind>("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  const product = fact.a * fact.b;
  const misses = Math.max(0, attempts - correct);
  const accuracy = attempts === 0 ? 100 : Math.round((correct / attempts) * 100);
  const progress = Math.max(0, Math.min(100, (remaining / roundSeconds) * 100));
  const availableFocusFactors = FOCUS_FACTORS.filter((factor) => factor <= maxFactor);

  useEffect(() => {
    if (phase !== "playing") return undefined;
    const interval = window.setInterval(() => {
      setRemaining((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase === "playing" && remaining === 0) finishRound();
  }, [phase, remaining]);

  useEffect(() => {
    if (typeof focusFactor === "number" && focusFactor > maxFactor) setFocusFactor("mixed");
  }, [focusFactor, maxFactor]);

  useEffect(() => {
    if (phase !== "ready") return;
    setFact((current) => makePracticeFact(maxFactor, focusFactor, current));
    setRemaining(roundSeconds);
  }, [focusFactor, maxFactor, phase, roundSeconds]);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  function focusInput() {
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function clearFeedbackTimer() {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
  }

  function startRound() {
    clearFeedbackTimer();
    setPhase("playing");
    setRemaining(roundSeconds);
    setCorrect(0);
    setAttempts(0);
    setStreak(0);
    setBestStreak(0);
    setAnswer("");
    setFeedback("Go");
    setFeedbackKind("idle");
    setFact((current) => makePracticeFact(maxFactor, focusFactor, current));
    focusInput();
  }

  function finishRound() {
    clearFeedbackTimer();
    setPhase("summary");
    setAnswer("");
    setFeedback("Round complete");
    setFeedbackKind("idle");
  }

  function nextFact(kind: FeedbackKind = "idle", text = "") {
    setFact((current) => makePracticeFact(maxFactor, focusFactor, current));
    setAnswer("");
    setFeedback(text);
    setFeedbackKind(kind);
    focusInput();
  }

  function submitAnswer(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (phase !== "playing") return;
    const guess = Number(answer.trim());
    if (!Number.isInteger(guess)) return;

    setAttempts((value) => value + 1);
    if (guess === product) {
      setCorrect((value) => value + 1);
      setStreak((value) => {
        const next = value + 1;
        setBestStreak((best) => Math.max(best, next));
        return next;
      });
      nextFact("correct", "Correct");
      return;
    }

    setStreak(0);
    setAnswer("");
    setFeedback(`${fact.a} x ${fact.b} = ${product}`);
    setFeedbackKind("miss");
    clearFeedbackTimer();
    feedbackTimerRef.current = window.setTimeout(() => nextFact(), 800);
  }

  function appendDigit(digit: string) {
    if (phase !== "playing") return;
    setAnswer((value) => `${value}${digit}`.slice(0, 3));
    focusInput();
  }

  function deleteDigit() {
    if (phase !== "playing") return;
    setAnswer((value) => value.slice(0, -1));
    focusInput();
  }

  function skipFact() {
    if (phase !== "playing") return;
    setAttempts((value) => value + 1);
    setStreak(0);
    setFeedback(`${fact.a} x ${fact.b} = ${product}`);
    setFeedbackKind("miss");
    setAnswer("");
    clearFeedbackTimer();
    feedbackTimerRef.current = window.setTimeout(() => nextFact(), 650);
  }

  return (
    <div className="mf-main">
      <section className="mf-game" aria-label="Multiplication practice">
        <div className="mf-progress-row">
          <div className="mf-track" aria-hidden="true">
            <div className="mf-track-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="mf-time">{remaining}</div>
          <div className="mf-count">{correct}</div>
        </div>

        <div className="mf-problem-zone">
          <DotField />
          {phase === "summary" ? (
            <SummaryCard
              title="Practice Complete"
              accent="#168978"
              stats={[
                ["Correct", String(correct)],
                ["Accuracy", `${accuracy}%`],
                ["Best Streak", String(bestStreak)],
              ]}
              note={`${focusLabel(focusFactor)} facts, 1-${maxFactor}`}
              actionLabel="Practice Again"
              onAction={startRound}
            />
          ) : (
            <FactCard
              fact={fact}
              answer={answer}
              phase={phase}
              feedback={phase === "ready" ? `${focusLabel(focusFactor)} facts, 1-${maxFactor}` : feedback}
              feedbackKind={feedbackKind}
              inputRef={inputRef}
              onAnswerChange={setAnswer}
              onSubmit={submitAnswer}
            />
          )}
        </div>

        <NumberPad
          disabled={phase !== "playing"}
          onDigit={appendDigit}
          onDelete={deleteDigit}
          onSkip={skipFact}
          onEnter={() => submitAnswer()}
        />
      </section>

      <aside className="mf-side" aria-label="Practice controls">
        <section className="mf-panel">
          <ScoreGrid
            stats={[
              ["Correct", String(correct)],
              ["Streak", String(streak)],
              ["Misses", String(misses)],
              ["Accuracy", `${accuracy}%`],
            ]}
          />
          <div className="mf-mode-pill">{focusLabel(focusFactor)} facts, 1-{maxFactor}</div>
          <div className="mf-action-row">
            {phase === "playing" ? (
              <button className="mf-action primary" onClick={finishRound}>
                End
              </button>
            ) : (
              <button className="mf-action primary" onClick={startRound}>
                Start
              </button>
            )}
            <button
              className="mf-action"
              disabled={phase === "playing"}
              onClick={() => {
                setPhase("ready");
                setCorrect(0);
                setAttempts(0);
                setStreak(0);
                setBestStreak(0);
                setAnswer("");
                setFeedback("Ready");
                setFeedbackKind("idle");
                setRemaining(roundSeconds);
                setFact((current) => makePracticeFact(maxFactor, focusFactor, current));
              }}
            >
              Reset
            </button>
          </div>
        </section>

        <section className="mf-panel">
          <span className="mf-panel-title">Range</span>
          <div className="mf-choice-row">
            {FACT_MAX_OPTIONS.map((option) => (
              <button
                className={`mf-choice${maxFactor === option ? " active" : ""}`}
                disabled={phase === "playing"}
                key={option}
                onClick={() => setMaxFactor(option)}
              >
                1-{option}
              </button>
            ))}
          </div>
          <span className="mf-panel-title">Round</span>
          <div className="mf-choice-row">
            {ROUND_OPTIONS.map((option) => (
              <button
                className={`mf-choice${roundSeconds === option ? " active" : ""}`}
                disabled={phase === "playing"}
                key={option}
                onClick={() => {
                  setRoundSeconds(option);
                  setRemaining(option);
                }}
              >
                {option}s
              </button>
            ))}
          </div>
          <span className="mf-panel-title">Focus</span>
          <div className="mf-focus-row">
            <button
              className={`mf-choice${focusFactor === "mixed" ? " active" : ""}`}
              disabled={phase === "playing"}
              onClick={() => setFocusFactor("mixed")}
            >
              Mixed
            </button>
            {availableFocusFactors.map((factor) => (
              <button
                className={`mf-choice${focusFactor === factor ? " active" : ""}`}
                disabled={phase === "playing"}
                key={factor}
                onClick={() => setFocusFactor(factor)}
              >
                x{factor}
              </button>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}

function MasteryGame() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [queue, setQueue] = useState<Fact[]>(() => buildMasteryDeck());
  const [answer, setAnswer] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [misses, setMisses] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [feedback, setFeedback] = useState("Ready");
  const [feedbackKind, setFeedbackKind] = useState<FeedbackKind>("idle");
  const [playerName, setPlayerName] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [savedCurrentRun, setSavedCurrentRun] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  const fact = queue[0] ?? { a: 1, b: 1 };
  const product = fact.a * fact.b;
  const progress = Math.round((completed / FACTS_PER_MASTERY_RUN) * 100);
  const medal = useMemo(() => getMedal(seconds), [seconds]);

  useEffect(() => {
    setLeaderboard(sortLeaderboard(readLeaderboard()).slice(0, 10));
    try {
      setPlayerName(localStorage.getItem(PLAYER_NAME_KEY) || "");
    } catch {
      setPlayerName("");
    }
  }, []);

  useEffect(() => {
    if (phase !== "playing") return undefined;
    const interval = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  function focusInput() {
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function clearFeedbackTimer() {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
  }

  function startRun() {
    clearFeedbackTimer();
    setQueue(buildMasteryDeck());
    setAnswer("");
    setSeconds(0);
    setCompleted(0);
    setMisses(0);
    setStreak(0);
    setBestStreak(0);
    setFeedback("Go");
    setFeedbackKind("idle");
    setSavedCurrentRun(false);
    setPhase("playing");
    focusInput();
  }

  function resetRun() {
    clearFeedbackTimer();
    setQueue(buildMasteryDeck());
    setAnswer("");
    setSeconds(0);
    setCompleted(0);
    setMisses(0);
    setStreak(0);
    setBestStreak(0);
    setFeedback("Ready");
    setFeedbackKind("idle");
    setSavedCurrentRun(false);
    setPhase("ready");
  }

  function finishRun(finalSeconds: number) {
    clearFeedbackTimer();
    setPhase("summary");
    setAnswer("");
    setFeedback(medalMessage(getMedal(finalSeconds)));
    setFeedbackKind("idle");
  }

  function submitAnswer(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (phase !== "playing") return;
    const guess = Number(answer.trim());
    if (!Number.isInteger(guess)) return;

    if (guess !== product) {
      setMisses((value) => value + 1);
      setStreak(0);
      setAnswer("");
      setFeedback(`${fact.a} x ${fact.b} = ${product}`);
      setFeedbackKind("miss");
      clearFeedbackTimer();
      feedbackTimerRef.current = window.setTimeout(() => {
        setFeedback("Try it again");
        setFeedbackKind("idle");
      }, 850);
      focusInput();
      return;
    }

    const nextCompleted = completed + 1;
    setCompleted(nextCompleted);
    setAnswer("");
    setFeedback("Correct");
    setFeedbackKind("correct");
    setStreak((value) => {
      const next = value + 1;
      setBestStreak((best) => Math.max(best, next));
      return next;
    });

    if (nextCompleted >= FACTS_PER_MASTERY_RUN) {
      setQueue([]);
      finishRun(seconds);
      return;
    }

    setQueue((value) => value.slice(1));
    clearFeedbackTimer();
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback("");
      setFeedbackKind("idle");
    }, 350);
    focusInput();
  }

  function appendDigit(digit: string) {
    if (phase !== "playing") return;
    setAnswer((value) => `${value}${digit}`.slice(0, 3));
    focusInput();
  }

  function deleteDigit() {
    if (phase !== "playing") return;
    setAnswer((value) => value.slice(0, -1));
    focusInput();
  }

  function skipFact() {
    if (phase !== "playing" || queue.length === 0) return;
    setMisses((value) => value + 1);
    setStreak(0);
    setFeedback(`${fact.a} x ${fact.b} = ${product}`);
    setFeedbackKind("miss");
    setAnswer("");
    setQueue((value) => [...value.slice(1), value[0]]);
    focusInput();
  }

  function saveScore() {
    const cleanName = playerName.trim() || "Student";
    const entry: LeaderboardEntry = {
      id: `${Date.now()}`,
      name: cleanName.slice(0, 18),
      seconds,
      misses,
      medal,
    };
    const next = sortLeaderboard([...leaderboard, entry]).slice(0, 10);
    setLeaderboard(next);
    setSavedCurrentRun(true);
    try {
      localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(next));
      localStorage.setItem(PLAYER_NAME_KEY, cleanName);
    } catch {
      // Local leaderboard is optional.
    }
  }

  return (
    <div className="mf-main">
      <section className="mf-game" aria-label="Times mastery run">
        <div className="mf-progress-row">
          <div className="mf-track" aria-hidden="true">
            <div className="mf-track-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="mf-time">{formatTime(seconds)}</div>
          <div className="mf-count">{completed}/{FACTS_PER_MASTERY_RUN}</div>
        </div>

        <div className="mf-problem-zone">
          <DotField />
          {phase === "summary" ? (
            <div className="mf-summary">
              <div className="mf-medal" style={{ "--medal": medalColor(medal) } as CSSProperties}>
                {medal}
              </div>
              <h2 className="mf-summary-title">{formatTime(seconds)}</h2>
              <p className="mf-summary-note">{feedback}</p>
              <div className="mf-summary-grid">
                <div className="mf-summary-stat">
                  <span className="mf-summary-number">{FACTS_PER_MASTERY_RUN}</span>
                  <span className="mf-summary-label">Facts</span>
                </div>
                <div className="mf-summary-stat">
                  <span className="mf-summary-number">{misses}</span>
                  <span className="mf-summary-label">Misses</span>
                </div>
                <div className="mf-summary-stat">
                  <span className="mf-summary-number">{bestStreak}</span>
                  <span className="mf-summary-label">Best Streak</span>
                </div>
              </div>
              <div className="mf-save-row">
                <input
                  className="mf-name"
                  value={playerName}
                  placeholder="Name"
                  maxLength={18}
                  onChange={(event) => setPlayerName(event.target.value)}
                />
                <button className="mf-save" disabled={savedCurrentRun} onClick={saveScore}>
                  {savedCurrentRun ? "Saved" : "Save Score"}
                </button>
              </div>
              <button className="mf-action primary" onClick={startRun}>
                New Run
              </button>
            </div>
          ) : (
            <FactCard
              fact={fact}
              answer={answer}
              phase={phase}
              feedback={phase === "ready" ? "All 144 facts, shuffled" : feedback}
              feedbackKind={feedbackKind}
              inputRef={inputRef}
              onAnswerChange={setAnswer}
              onSubmit={submitAnswer}
            />
          )}
        </div>

        <NumberPad
          disabled={phase !== "playing"}
          onDigit={appendDigit}
          onDelete={deleteDigit}
          onSkip={skipFact}
          onEnter={() => submitAnswer()}
        />
      </section>

      <aside className="mf-side" aria-label="Mastery targets and leaderboard">
        <section className="mf-panel">
          <ScoreGrid
            stats={[
              ["Complete", String(completed)],
              ["Streak", String(streak)],
              ["Misses", String(misses)],
              ["Pace", medal],
            ]}
          />
          <div className="mf-mode-pill">Random 1x1 through 12x12 deck</div>
          <div className="mf-action-row">
            {phase === "playing" ? (
              <button className="mf-action primary" onClick={resetRun}>
                End
              </button>
            ) : (
              <button className="mf-action primary" onClick={startRun}>
                Start
              </button>
            )}
            <button className="mf-action" disabled={phase === "playing"} onClick={resetRun}>
              Reset
            </button>
          </div>
        </section>

        <section className="mf-panel">
          <span className="mf-panel-title">Mastery Levels</span>
          <div className="mf-medal-grid">
            {MEDAL_TARGETS.map((target) => (
              <div className="mf-target" key={target.medal}>
                <span>{target.medal}</span>
                <span>{formatTime(target.seconds)}</span>
                <span className="mf-target-dot" style={{ "--target": target.color } as CSSProperties} />
              </div>
            ))}
          </div>
        </section>

        <section className="mf-panel">
          <span className="mf-panel-title">Leaderboard</span>
          <div className="mf-board">
            {leaderboard.length === 0 ? (
              <p className="mf-empty">No saved scores yet.</p>
            ) : (
              leaderboard.map((entry, rowIndex) => (
                <div className="mf-board-row" key={entry.id}>
                  <span className="mf-rank">{rowIndex + 1}</span>
                  <span className="mf-board-name">{entry.name} · {entry.medal}</span>
                  <span>{formatTime(entry.seconds)}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

function DotField() {
  return (
    <div className="mf-array-art" aria-hidden="true">
      {Array.from({ length: 32 }).map((_, index) => (
        <span className="mf-dot" key={index} />
      ))}
    </div>
  );
}

function ScoreGrid({ stats }: { stats: [string, string][] }) {
  return (
    <div className="mf-stat-grid">
      {stats.map(([label, value]) => (
        <div className="mf-stat" key={label}>
          <span className="mf-stat-number">{value}</span>
          <span className="mf-stat-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

function SummaryCard({
  title,
  accent,
  note,
  stats,
  actionLabel,
  onAction,
}: {
  title: string;
  accent: string;
  note: string;
  stats: [string, string][];
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="mf-summary">
      <div className="mf-medal" style={{ "--medal": accent } as CSSProperties}>
        Practice
      </div>
      <h2 className="mf-summary-title">{title}</h2>
      <p className="mf-summary-note">{note}</p>
      <div className="mf-summary-grid">
        {stats.map(([label, value]) => (
          <div className="mf-summary-stat" key={label}>
            <span className="mf-summary-number">{value}</span>
            <span className="mf-summary-label">{label}</span>
          </div>
        ))}
      </div>
      <button className="mf-action primary" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}

export default function MultiplicationFluencyGame() {
  const [mode, setMode] = useState<Mode>("practice");

  return (
    <main className="mf-root">
      <style>{`
        .mf-root {
          min-height: 100vh;
          background: #fff;
          color: #20242d;
          font-family: Inter, ui-sans-serif, system-ui, sans-serif;
          display: grid;
          grid-template-rows: auto 1fr;
        }
        .mf-top {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 14px;
          padding: 14px clamp(14px, 3vw, 28px);
          border-bottom: 1px solid #d8dee8;
          background: #fff;
          backdrop-filter: blur(12px);
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .mf-home,
        .mf-action,
        .mf-key,
        .mf-submit,
        .mf-save,
        .mf-choice,
        .mf-mode-tab {
          border: 2px solid #d6deea;
          border-radius: 4px;
          background: #fff;
          color: #20242d;
          cursor: pointer;
          font-weight: 900;
          letter-spacing: 0;
          transition: transform 140ms ease, border-color 140ms ease, background-color 140ms ease;
        }
        .mf-home {
          min-height: 44px;
          min-width: 86px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 8px 14px;
          text-decoration: none;
        }
        .mf-home:hover,
        .mf-action:hover,
        .mf-key:hover,
        .mf-submit:hover,
        .mf-save:hover,
        .mf-choice:hover,
        .mf-mode-tab:hover {
          border-color: #168978;
          transform: translateY(-1px);
        }
        .mf-title-wrap { min-width: 0; text-align: center; }
        .mf-kicker {
          margin: 0 0 2px;
          color: #168978;
          font-size: 0.72rem;
          font-weight: 950;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .mf-title {
          margin: 0;
          color: #1f2937;
          font-size: clamp(1.25rem, 3.2vw, 2rem);
          font-weight: 950;
          line-height: 1.05;
        }
        .mf-logo {
          width: clamp(56px, 10vw, 94px);
          height: auto;
          border-radius: 4px;
          display: block;

        }
        .mf-mode-tabs {
          width: min(720px, calc(100% - 24px));
          margin: 14px auto 0;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .mf-mode-tab {
          min-height: 50px;
          font-size: 1rem;
        }
        .mf-mode-tab.active {
          background: #168978;
          border-color: #168978;
          color: #fff;
        }
        .mf-main {
          width: min(1200px, 100%);
          margin: 0 auto;
          padding: clamp(14px, 3vw, 28px);
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
          gap: 18px;
          align-items: start;
        }
        .mf-game,
        .mf-panel {
          border: 2px solid #dde4ee;
          border-radius: 4px;
          background: #fff;

        }
        .mf-game {
          min-height: 690px;
          padding: clamp(14px, 3vw, 26px);
          display: grid;
          grid-template-rows: auto minmax(380px, 1fr) auto;
          gap: 18px;
          overflow: hidden;
        }
        .mf-progress-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          align-items: center;
          gap: 12px;
        }
        .mf-track {
          height: 20px;
          border: 2px solid #d6deea;
          border-radius: 2px;
          background: #eef3f8;
          overflow: hidden;
        }
        .mf-track-fill {
          height: 100%;
          border-radius: 2px;
          background: linear-gradient(90deg, #168978, #2f80ed, #f97316);
          transition: width 180ms ease;
        }
        .mf-time,
        .mf-count {
          min-width: 82px;
          min-height: 44px;
          border-radius: 4px;
          display: grid;
          place-items: center;
          font-size: 1.08rem;
          font-weight: 950;
          font-variant-numeric: tabular-nums;
        }
        .mf-time { background: #20242d; color: #fff; }
        .mf-count {
          background: #fff7ed;
          color: #9a3412;
          border: 2px solid #fed7aa;
        }
        .mf-problem-zone {
          display: grid;
          place-items: center;
          min-width: 0;
          position: relative;
        }
        .mf-array-art {
          position: absolute;
          inset: 0;
          display: grid;
          grid-template-columns: repeat(8, 1fr);
          grid-auto-rows: 1fr;
          gap: 10px;
          opacity: 0.18;
          pointer-events: none;
        }
        .mf-dot {
          align-self: center;
          justify-self: center;
          width: clamp(10px, 2vw, 22px);
          aspect-ratio: 1;
          border-radius: 2px;
          background: #168978;
        }
        .mf-dot:nth-child(3n) { background: #f97316; }
        .mf-dot:nth-child(4n) { background: #2f80ed; }
        .mf-dot:nth-child(5n) { background: #7c3aed; }
        .mf-card,
        .mf-summary {
          position: relative;
          z-index: 1;
          width: min(100%, 580px);
          border: 3px solid #20242d;
          border-radius: 4px;
          background: #fff;
          padding: clamp(18px, 4vw, 34px);
          box-shadow: 0 18px 0 #20242d;
        }
        .mf-card {
          min-height: 338px;
          display: grid;
          align-content: center;
          justify-items: center;
          gap: 20px;
        }
        .mf-card.correct { border-color: #168978; box-shadow: 0 18px 0 #168978; }
        .mf-card.miss { border-color: #c2410c; box-shadow: 0 18px 0 #c2410c; }
        .mf-equation {
          display: grid;
          grid-template-columns: minmax(74px, 1fr) auto minmax(74px, 1fr);
          align-items: center;
          gap: clamp(10px, 3vw, 28px);
          width: 100%;
          color: #15171d;
          font-size: clamp(4.3rem, 13vw, 8.8rem);
          line-height: 0.9;
          font-weight: 950;
          text-align: center;
          font-variant-numeric: tabular-nums;
        }
        .mf-times { color: #f97316; font-size: 0.66em; }
        .mf-answer-form {
          display: grid;
          grid-template-columns: minmax(120px, 220px) minmax(92px, auto);
          gap: 10px;
          width: min(100%, 340px);
        }
        .mf-answer,
        .mf-name {
          min-width: 0;
          border: 2px solid #cbd5e1;
          border-radius: 4px;
          background: #fff;
          color: #111827;
          font-weight: 900;
        }
        .mf-answer {
          height: 58px;
          background: #f8fafc;
          font-size: 1.7rem;
          text-align: center;
          font-variant-numeric: tabular-nums;
        }
        .mf-name {
          min-height: 52px;
          padding: 0 12px;
          font-size: 1rem;
        }
        .mf-answer:focus,
        .mf-name:focus {
          border-color: #168978;
          outline: 4px solid rgba(22, 137, 120, 0.18);
        }
        .mf-submit {
          min-height: 58px;
          padding: 0 16px;
          background: #168978;
          border-color: #168978;
          color: #fff;
        }
        .mf-feedback {
          min-height: 38px;
          display: grid;
          place-items: center;
          color: #64748b;
          font-size: 1.05rem;
          font-weight: 950;
          text-align: center;
        }
        .mf-feedback.correct { color: #168978; }
        .mf-feedback.miss { color: #c2410c; }
        .mf-summary {
          display: grid;
          gap: 18px;
          justify-items: stretch;
        }
        .mf-medal {
          justify-self: center;
          min-width: 154px;
          min-height: 154px;
          border-radius: 4px;
          display: grid;
          place-items: center;
          padding: 18px;
          background: var(--medal);
          color: #fff;
          font-size: 1.35rem;
          font-weight: 950;
          text-align: center;
          box-shadow: inset 0 -14px 0 rgba(0, 0, 0, 0.14);
        }
        .mf-summary-title {
          margin: 0;
          color: #1f2937;
          font-size: clamp(2rem, 7vw, 4rem);
          line-height: 1;
          font-weight: 950;
          text-align: center;
        }
        .mf-summary-note {
          margin: 0;
          color: #475569;
          font-weight: 850;
          line-height: 1.4;
          text-align: center;
        }
        .mf-summary-grid,
        .mf-stat-grid {
          display: grid;
          gap: 10px;
        }
        .mf-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .mf-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .mf-summary-stat,
        .mf-stat {
          border: 2px solid #d6deea;
          border-radius: 4px;
          background: #f8fafc;
          display: grid;
          align-content: center;
          justify-items: center;
          gap: 4px;
          padding: 10px;
        }
        .mf-summary-stat { min-height: 86px; }
        .mf-stat { min-height: 86px; }
        .mf-summary-number,
        .mf-stat-number {
          color: #111827;
          line-height: 1;
          font-weight: 950;
          font-variant-numeric: tabular-nums;
          text-align: center;
        }
        .mf-summary-number { font-size: 1.8rem; }
        .mf-stat-number { font-size: 1.45rem; overflow-wrap: anywhere; }
        .mf-summary-label,
        .mf-stat-label,
        .mf-panel-title {
          color: #64748b;
          font-size: 0.74rem;
          font-weight: 950;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          text-align: center;
        }
        .mf-pad {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
        }
        .mf-key {
          min-height: 52px;
          padding: 0 10px;
          background: #f8fafc;
          color: #1f2937;
          font-size: 1.1rem;
        }
        .mf-key.enter { background: #2f80ed; border-color: #2f80ed; color: #fff; }
        .mf-side {
          display: grid;
          gap: 14px;
        }
        .mf-panel {
          padding: 16px;
          display: grid;
          gap: 12px;
        }
        .mf-mode-pill {
          min-height: 42px;
          border-radius: 4px;
          background: #20242d;
          color: #fff;
          display: grid;
          place-items: center;
          padding: 6px 10px;
          font-size: 0.88rem;
          font-weight: 950;
          text-align: center;
        }
        .mf-choice-row,
        .mf-focus-row,
        .mf-action-row,
        .mf-save-row {
          display: grid;
          gap: 8px;
        }
        .mf-choice-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .mf-focus-row { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .mf-action-row,
        .mf-save-row { grid-template-columns: 1fr 1fr; }
        .mf-choice,
        .mf-action,
        .mf-save {
          min-height: 48px;
          padding: 8px 10px;
        }
        .mf-choice.active,
        .mf-action.primary,
        .mf-save {
          background: #f97316;
          border-color: #f97316;
          color: #fff;
        }
        .mf-choice.active { background: #168978; border-color: #168978; }
        .mf-medal-grid,
        .mf-board {
          display: grid;
          gap: 8px;
        }
        .mf-target,
        .mf-board-row {
          min-height: 42px;
          border: 2px solid #e2e8f0;
          border-radius: 4px;
          background: #fff;
          display: grid;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          font-weight: 900;
          color: #334155;
        }
        .mf-target { grid-template-columns: 1fr auto auto; }
        .mf-target-dot {
          width: 18px;
          aspect-ratio: 1;
          border-radius: 4px;
          background: var(--target);
        }
        .mf-board-row { grid-template-columns: auto minmax(0, 1fr) auto; }
        .mf-rank {
          width: 26px;
          height: 26px;
          border-radius: 4px;
          background: #20242d;
          color: #fff;
          display: grid;
          place-items: center;
          font-size: 0.78rem;
        }
        .mf-board-name {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .mf-empty {
          margin: 0;
          color: #64748b;
          font-weight: 800;
          text-align: center;
        }

        @media (max-width: 940px) {
          .mf-main { grid-template-columns: 1fr; }
          .mf-side { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 700px) {
          .mf-top { grid-template-columns: auto minmax(0, 1fr); }
          .mf-logo { display: none; }
          .mf-title-wrap { text-align: left; }
          .mf-main { padding: 12px; }
          .mf-game { min-height: auto; grid-template-rows: auto minmax(310px, auto) auto; }
          .mf-progress-row { grid-template-columns: 1fr auto; }
          .mf-count { grid-column: 1 / -1; }
          .mf-card,
          .mf-summary { box-shadow: 0 12px 0 #20242d; }
          .mf-card.correct { box-shadow: 0 12px 0 #168978; }
          .mf-card.miss { box-shadow: 0 12px 0 #c2410c; }
          .mf-answer-form,
          .mf-side,
          .mf-summary-grid,
          .mf-action-row,
          .mf-save-row { grid-template-columns: 1fr; }
          .mf-focus-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
      `}</style>

      <header className="mf-top">
        <Link className="mf-home" href="/">
          Home
        </Link>
        <div className="mf-title-wrap">
          <p className="mf-kicker">Big Dog Math</p>
          <h1 className="mf-title">Multiplication Fluency</h1>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="mf-logo" src="/big-dog-logo.png" alt="Big Dog Math" />
      </header>

      <div className="mf-mode-tabs" aria-label="Game mode">
        <button className={`mf-mode-tab${mode === "practice" ? " active" : ""}`} onClick={() => setMode("practice")}>
          Practice
        </button>
        <button className={`mf-mode-tab${mode === "mastery" ? " active" : ""}`} onClick={() => setMode("mastery")}>
          Times Mastery
        </button>
      </div>

      {mode === "practice" ? <PracticeGame /> : <MasteryGame />}
    </main>
  );
}
