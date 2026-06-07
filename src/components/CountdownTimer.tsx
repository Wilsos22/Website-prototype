"use client";

// Simple countdown timer with editable starting minutes and seconds.
import { useEffect, useState } from "react";
import { ToolHeader } from "./ToolHeader";

function clampTime(value: number): number {
  return Math.max(0, Math.min(5999, value));
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}

export function CountdownTimer() {
  const [minutes, setMinutes] = useState(5);
  const [seconds, setSeconds] = useState(0);
  const [remaining, setRemaining] = useState(300);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) {
      return;
    }

    const interval = window.setInterval(() => {
      setRemaining((currentRemaining) => {
        if (currentRemaining <= 1) {
          window.clearInterval(interval);
          setRunning(false);
          return 0;
        }

        return currentRemaining - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [running]);

  const applyTime = () => {
    const nextRemaining = clampTime(minutes * 60 + seconds);
    setRemaining(nextRemaining);
    setRunning(false);
  };

  const resetTimer = () => {
    setRunning(false);
    setRemaining(clampTime(minutes * 60 + seconds));
  };

  return (
    <>
      <ToolHeader title="Timer" />
      <main className="timer-page">
        <section className="timer-panel" aria-label="Countdown timer">
          <div className="timer-display" aria-live="polite">
            {formatTime(remaining)}
          </div>

          <div className="timer-inputs">
            <label className="field">
              Minutes
              <input
                className="text-input"
                inputMode="numeric"
                max={99}
                min={0}
                onChange={(event) => setMinutes(Number(event.target.value))}
                type="number"
                value={minutes}
              />
            </label>
            <label className="field">
              Seconds
              <input
                className="text-input"
                inputMode="numeric"
                max={59}
                min={0}
                onChange={(event) => setSeconds(Number(event.target.value))}
                type="number"
                value={seconds}
              />
            </label>
          </div>

          <div className="timer-actions">
            <button className="big-button" onClick={applyTime} type="button">
              Set
            </button>
            <button
              className="big-button primary"
              disabled={remaining === 0}
              onClick={() => setRunning((currentRunning) => !currentRunning)}
              type="button"
            >
              {running ? "Pause" : "Start"}
            </button>
            <button className="big-button" onClick={resetTimer} type="button">
              Reset
            </button>
          </div>
        </section>
      </main>
    </>
  );
}
