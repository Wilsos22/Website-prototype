"use client";

// Ratio Explainer — a slow, no-narration animated walkthrough of what a ratio
// is (3 balls to 2 bones), ported from the Big Dog Math Figma motion file
// ("Ratios Explainer", node 2:2). All keyframe times and easings come straight
// from the Figma timeline: one 23-second loop, each element keyed as a % of
// the cycle. Built for the absent student: every idea appears one at a time,
// no voiceover needed. Under prefers-reduced-motion the final frame renders
// as a static poster.

import { useEffect, useRef, useState } from "react";

const DUR = 25; // Figma timelineCohort durationMs / 1000
const STAGE_W = 1920;
const STAGE_H = 1080;
const pct = (s: number) => +((s / DUR) * 100).toFixed(3);

const EASE_OUT = "cubic-bezier(0, 0, 0.58, 1)";
const EASE_IN_OUT = "cubic-bezier(0.42, 0, 0.58, 1)";
const EASE_BACK = "cubic-bezier(0.45, 1.45, 0.8, 1)"; // Figma EASE_OUT_BACK

// Opacity fade-in at t0→t1 with an optional fade-out window.
function fadeKF(name: string, t0: number, t1: number, out?: [number, number]) {
  const tail = out
    ? `${pct(out[0])}% { opacity: 1; animation-timing-function: ${EASE_IN_OUT}; }
  ${pct(out[1])}%, 100% { opacity: 0; }`
    : `100% { opacity: 1; }`;
  return `@keyframes ${name} {
  0%, ${pct(t0)}% { opacity: 0; animation-timing-function: ${EASE_OUT}; }
  ${pct(t1)}% { opacity: 1; }
  ${tail}
}`;
}

// translateY settle (drop-in / rise-in) with its own easing curve.
function moveKF(name: string, t0: number, t1: number, fromY: number, ease: string) {
  return `@keyframes ${name} {
  0%, ${pct(t0)}% { transform: translateY(${fromY}px); animation-timing-function: ${ease}; }
  ${pct(t1)}%, 100% { transform: translateY(0); }
}`;
}

// Scale pop (0.7 → 1) with overshoot.
function popKF(name: string, t0: number, t1: number) {
  return `@keyframes ${name} {
  0%, ${pct(t0)}% { transform: scale(0.7); animation-timing-function: ${EASE_BACK}; }
  ${pct(t1)}%, 100% { transform: scale(1); }
}`;
}

// Timeline (seconds) — verbatim from the Figma motion context.
const BALLS = [
  { t0: 4.0, t1: 4.8, left: 329 },
  { t0: 5.2, t1: 6.0, left: 495 },
  { t0: 6.4, t1: 7.2, left: 661 },
];
const BONES = [
  { t0: 9.2, t1: 10.0, left: 1136 },
  { t0: 10.4, t1: 11.2, left: 1384 },
];

const KEYFRAMES = [
  fadeKF("rxTitle", 0.3, 1.5),
  moveKF("rxTitleMove", 0.3, 1.5, -40, EASE_OUT),
  fadeKF("rxSub", 2.2, 3.2, [20.8, 21.8]),
  fadeKF("rxClose", 22.0, 23.0),
  moveKF("rxCloseMove", 22.0, 23.0, 24, EASE_OUT),
  ...BALLS.flatMap((b, i) => [
    fadeKF(`rxBall${i}`, b.t0, b.t1),
    moveKF(`rxBall${i}Move`, b.t0, b.t1, -70, EASE_BACK),
  ]),
  fadeKF("rxBallLabel", 7.6, 8.4),
  ...BONES.flatMap((b, i) => [
    fadeKF(`rxBone${i}`, b.t0, b.t1),
    moveKF(`rxBone${i}Move`, b.t0, b.t1, -70, EASE_BACK),
  ]),
  fadeKF("rxBoneLabel", 11.6, 12.4),
  fadeKF("rxWords", 13.4, 14.4),
  popKF("rxWordsPop", 13.4, 14.4),
  fadeKF("rxArrows", 14.8, 15.6),
  fadeKF("rxWaysLabel", 16.2, 17.0),
  fadeKF("rxChip0", 17.2, 18.0),
  fadeKF("rxChip1", 18.4, 19.2),
  fadeKF("rxChip2", 19.6, 20.4),
].join("\n");

// Arrow geometry: shaft stops short of the target so the head caps it cleanly.
function arrow(ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  return {
    line: { x1: ax, y1: ay, x2: bx - 26 * ux, y2: by - 26 * uy },
    head: [
      [bx + 20 * ux, by + 20 * uy],
      [bx - 20 * ux + 20 * px, by - 20 * uy + 20 * py],
      [bx - 20 * ux - 20 * px, by - 20 * uy - 20 * py],
    ]
      .map((p) => p.map((n) => +n.toFixed(1)).join(","))
      .join(" "),
  };
}
const ARROW_BALLS = arrow(585, 645, 790, 660);
const ARROW_BONES = arrow(1335, 645, 1130, 660);

function Bone({ left, index }: { left: number; index: number }) {
  return (
    <svg
      className={`rx-anim rx-bone rx-bone-${index}`}
      style={{ left, top: 397.5 }}
      width="200"
      height="95"
      viewBox="0 0 200 95"
      aria-hidden="true"
    >
      <circle cx="26" cy="26" r="26" />
      <circle cx="26" cy="69" r="26" />
      <circle cx="174" cy="26" r="26" />
      <circle cx="174" cy="69" r="26" />
      <rect x="26" y="27.5" width="148" height="40" rx="20" />
    </svg>
  );
}

export default function RatioExplainer() {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [run, setRun] = useState(0); // bump to restart the loop from 0s

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / STAGE_W));
    ro.observe(el);
    setScale(el.clientWidth / STAGE_W);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="rx-wrap">
      <style>{`
        .rx-wrap {
          max-width: 1100px;
          margin: 0 auto;
          padding: clamp(12px, 3vw, 24px);
          font-family: var(--bdb-font);
        }
        .rx-frame {
          position: relative;
          width: 100%;
          aspect-ratio: ${STAGE_W} / ${STAGE_H};
          overflow: hidden;
          background: var(--bdb-ground);
          border: 1px solid var(--bdb-line);
          border-radius: var(--bdb-r-lg);
          box-shadow: var(--bdb-shadow);
        }
        .rx-stage {
          position: absolute;
          top: 0;
          left: 0;
          width: ${STAGE_W}px;
          height: ${STAGE_H}px;
          transform-origin: top left;
          color: var(--bdb-ink);
        }
        .rx-stage > * { position: absolute; }
        .rx-anim {
          animation-duration: ${DUR}s;
          animation-iteration-count: infinite;
          animation-timing-function: linear;
        }
        .rx-center { left: 0; right: 0; text-align: center; }
        .rx-title { top: 60px; font-size: 110px; font-weight: 800; animation-name: rxTitle, rxTitleMove; }
        .rx-sub { top: 236px; font-size: 46px; font-weight: 500; color: var(--bdb-ink-soft); opacity: 0; animation-name: rxSub; }
        .rx-close { top: 236px; font-size: 46px; font-weight: 700; animation-name: rxClose, rxCloseMove; }
        .rx-ball {
          top: 380px; width: 130px; height: 130px; border-radius: 50%;
          background: var(--bdb-amber); border: 6px solid #dd8f1c;
        }
        ${BALLS.map((_, i) => `.rx-ball-${i} { animation-name: rxBall${i}, rxBall${i}Move; }`).join("\n")}
        .rx-bone { fill: var(--bdb-teal); }
        ${BONES.map((_, i) => `.rx-bone-${i} { animation-name: rxBone${i}, rxBone${i}Move; }`).join("\n")}
        .rx-ball-label { left: 0; width: 1120px; top: 560px; text-align: center; font-size: 54px; font-weight: 700; color: var(--bdb-coral); animation-name: rxBallLabel; }
        .rx-bone-label { left: 800px; width: 1120px; top: 560px; text-align: center; font-size: 54px; font-weight: 700; color: var(--bdb-teal); animation-name: rxBoneLabel; }
        .rx-words { top: 655px; font-size: 130px; font-weight: 800; transform-origin: 960px 90px; animation-name: rxWords, rxWordsPop; }
        .rx-arrows { left: 0; top: 0; animation-name: rxArrows; }
        .rx-ways-label { top: 832px; font-size: 40px; font-weight: 600; color: var(--bdb-ink-soft); animation-name: rxWaysLabel; }
        .rx-ways {
          left: 0; right: 0; top: 892px;
          display: flex; justify-content: center; align-items: center; gap: 48px;
        }
        .rx-chip {
          background: var(--bdb-card); border: 1px solid var(--bdb-line);
          border-radius: var(--bdb-r-lg); box-shadow: var(--bdb-shadow-sm);
          padding: 14px 40px; font-size: 60px; font-weight: 800;
        }
        .rx-chip-0 { animation-name: rxChip0; }
        .rx-chip-1 { animation-name: rxChip1; }
        .rx-chip-2 { animation-name: rxChip2; }
        .rx-frac { display: inline-flex; flex-direction: column; align-items: center; gap: 7px; font-size: 42px; line-height: 1; }
        .rx-frac-bar { width: 58px; height: 6px; border-radius: 3px; background: var(--bdb-ink); }
        .rx-coral { color: var(--bdb-coral); }
        .rx-teal { color: var(--bdb-teal); }
        .rx-soft { color: var(--bdb-ink-soft); }
        .rx-bar {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; margin-top: 12px; flex-wrap: wrap;
        }
        .rx-hint { color: var(--bdb-ink-soft); font-size: 14px; }
        .rx-restart {
          font-family: var(--bdb-font); font-size: 14px; font-weight: 600;
          color: var(--bdb-ink); background: var(--bdb-card);
          border: 1px solid var(--bdb-line); border-radius: var(--bdb-r-pill);
          padding: 8px 18px; cursor: pointer; box-shadow: var(--bdb-shadow-sm);
        }
        .rx-restart:hover { background: var(--bdb-ground-2); }
        ${KEYFRAMES}
        @media (prefers-reduced-motion: reduce) {
          /* Show the final frame as a static poster instead of animating. */
          .rx-anim { animation: none !important; }
          .rx-sub { opacity: 0; }
        }
      `}</style>

      <div className="rx-frame" ref={frameRef}>
        <div key={run} className="rx-stage" style={{ transform: `scale(${scale})` }}>
          <h2 className="rx-anim rx-center rx-title" style={{ margin: 0 }}>Ratios</h2>
          <p className="rx-anim rx-center rx-sub" style={{ margin: 0 }}>A ratio compares two amounts.</p>
          <p className="rx-anim rx-center rx-close" style={{ margin: 0 }}>For every 3 balls there are 2 bones.</p>

          {BALLS.map((b, i) => (
            <div key={i} className={`rx-anim rx-ball rx-ball-${i}`} style={{ left: b.left }} />
          ))}
          <div className="rx-anim rx-ball-label">3 balls</div>

          {BONES.map((b, i) => (
            <Bone key={i} left={b.left} index={i} />
          ))}
          <div className="rx-anim rx-bone-label">2 bones</div>

          <div className="rx-anim rx-center rx-words">
            <span className="rx-coral">3</span> to <span className="rx-teal">2</span>
          </div>

          <svg
            className="rx-anim rx-arrows"
            width={STAGE_W}
            height={STAGE_H}
            viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
            aria-hidden="true"
          >
            <g stroke="var(--bdb-coral)" fill="var(--bdb-coral)" strokeWidth="10" strokeLinecap="round">
              <line {...ARROW_BALLS.line} />
              <polygon points={ARROW_BALLS.head} stroke="none" />
            </g>
            <g stroke="var(--bdb-teal)" fill="var(--bdb-teal)" strokeWidth="10" strokeLinecap="round">
              <line {...ARROW_BONES.line} />
              <polygon points={ARROW_BONES.head} stroke="none" />
            </g>
          </svg>

          <div className="rx-anim rx-center rx-ways-label">3 ways to write it</div>
          <div className="rx-ways">
            <div className="rx-anim rx-chip rx-chip-0">
              <span className="rx-coral">3</span> to <span className="rx-teal">2</span>
            </div>
            <div className="rx-anim rx-chip rx-chip-1">
              <span className="rx-coral">3</span> <span className="rx-soft">:</span> <span className="rx-teal">2</span>
            </div>
            <div className="rx-anim rx-chip rx-chip-2">
              <span className="rx-frac">
                <span className="rx-coral">3</span>
                <span className="rx-frac-bar" />
                <span className="rx-teal">2</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="rx-bar">
        <span className="rx-hint">Missed class? Just watch — it explains itself, one idea at a time.</span>
        <button className="rx-restart" onClick={() => setRun((r) => r + 1)}>
          ↺ Start over
        </button>
      </div>
    </div>
  );
}
