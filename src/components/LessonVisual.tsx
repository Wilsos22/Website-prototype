import type { CSSProperties } from "react";
import type { LessonVisual as LessonVisualModel, LessonVisualQuantity } from "@/lib/lessonVisuals";

interface LessonVisualProps {
  visual: LessonVisualModel;
  variant: "projector" | "studio";
  accent?: string;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function quantityMarks(quantity: LessonVisualQuantity, mode: "counters" | "tiles") {
  const visibleCount = Math.min(quantity.count, 12);
  return (
    <div className="lv-quantity" aria-label={`${quantity.count} ${quantity.label} ${quantity.unit}`}>
      <div className="lv-marks">
        {Array.from({ length: visibleCount }, (_, index) => (
          <span
            className={`lv-mark ${mode}`}
            key={`${quantity.label}-${index}`}
            style={{ "--lv-mark-color": quantity.color } as CSSProperties}
          />
        ))}
        {quantity.count > visibleCount ? <span className="lv-more">+{quantity.count - visibleCount} more</span> : null}
      </div>
      <p><strong>{quantity.count}</strong> {titleCase(quantity.label)}</p>
    </div>
  );
}

function fraction(numerator: number, denominator: number) {
  return (
    <span className="lv-fraction" aria-label={`${numerator} over ${denominator}`}>
      <span>{numerator}</span>
      <span>{denominator}</span>
    </span>
  );
}

export default function LessonVisual({ visual, variant, accent = "#d59a55" }: LessonVisualProps) {
  const style = { "--lv-accent": accent } as CSSProperties;

  return (
    <div className={`lesson-visual ${variant} ${visual.kind}`} style={style}>
      <style>{`
        .lesson-visual { width:100%; min-width:0; color:#fff; }
        .lesson-visual * { box-sizing:border-box; }
        .lesson-visual p { margin:0; }
        .lv-score-layout { width:100%; display:grid; grid-template-columns:minmax(210px,0.82fr) minmax(0,1.18fr); align-items:center; gap:clamp(18px,4vw,58px); }
        .lv-scoreboard { min-width:0; display:grid; grid-template-columns:1fr 1fr; gap:11px; border:1px solid rgba(255,255,255,0.18); border-radius:20px; background:rgba(0,0,0,0.2); padding:15px; box-shadow:0 22px 56px rgba(0,0,0,0.22); }
        .lv-score-label { grid-column:1 / -1; border-bottom:1px solid rgba(255,255,255,0.16); padding:0 4px 10px; color:var(--lv-accent); text-align:center; font-size:0.7rem; font-weight:950; letter-spacing:0.16em; text-transform:uppercase; }
        .lv-team { min-width:0; display:grid; justify-items:center; gap:8px; border:1px solid rgba(255,255,255,0.15); border-radius:15px; background:rgba(0,0,0,0.18); padding:16px 10px; }
        .lv-team span { width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:rgba(255,255,255,0.7); text-align:center; font-size:clamp(0.7rem,1.25vw,0.96rem); font-weight:900; letter-spacing:0.06em; text-transform:uppercase; }
        .lv-team strong { font-size:clamp(3.5rem,8vw,8.2rem); line-height:0.86; font-variant-numeric:tabular-nums; letter-spacing:-0.06em; }
        .lv-score-prompt { border-left:7px solid var(--lv-accent); padding:12px 0 12px 19px; color:#fff; text-align:left; white-space:pre-wrap; font-size:clamp(1.2rem,2.7vw,2.6rem); line-height:1.16; font-weight:850; text-wrap:balance; }
        .lv-model-layout { width:100%; display:grid; justify-items:center; gap:clamp(18px,3vw,32px); }
        .lv-model-title { color:var(--lv-accent); font-size:0.76rem; font-weight:950; letter-spacing:0.14em; text-transform:uppercase; }
        .lv-quantity-row { width:100%; display:flex; align-items:center; justify-content:center; gap:clamp(18px,3.5vw,48px); }
        .lv-quantity { min-width:0; display:grid; justify-items:center; gap:10px; }
        .lv-marks { display:flex; flex-wrap:wrap; justify-content:center; gap:clamp(7px,1.2vw,13px); max-width:390px; }
        .lv-mark { width:clamp(34px,5.2vw,72px); aspect-ratio:1; flex:none; background:var(--lv-mark-color); box-shadow:0 10px 24px rgba(0,0,0,0.26); }
        .lv-mark.counters { border:3px solid rgba(255,255,255,0.38); border-radius:50%; }
        .lv-mark.tiles { border:2px solid rgba(255,255,255,0.36); border-radius:15px; }
        .lv-more { min-height:34px; display:inline-flex; align-items:center; justify-content:center; align-self:center; border:1px solid rgba(255,255,255,0.2); border-radius:999px; background:rgba(0,0,0,0.2); padding:0 11px; color:#fff; font-size:0.72rem; font-weight:900; }
        .lv-quantity p { color:rgba(255,255,255,0.78); font-size:clamp(0.78rem,1.35vw,1rem); font-weight:800; letter-spacing:0.04em; text-transform:uppercase; }
        .lv-quantity p strong { color:#fff; font-size:1.18em; }
        .lv-for-every { color:var(--lv-accent); font-size:clamp(0.78rem,1.4vw,1rem); font-weight:950; letter-spacing:0.12em; text-transform:uppercase; }
        .lv-total { border:1px solid rgba(255,255,255,0.17); border-radius:999px; background:rgba(0,0,0,0.18); padding:7px 13px; color:rgba(255,255,255,0.76); font-size:0.78rem; font-weight:850; }
        .lv-model-prompt { max-width:62ch; border-left:6px solid var(--lv-accent); padding:8px 0 8px 16px; color:#fff; text-align:left; white-space:pre-wrap; font-size:clamp(1rem,1.8vw,1.45rem); line-height:1.32; font-weight:780; }
        .lv-ratio-layout { width:100%; display:grid; align-content:center; gap:clamp(16px,2.5vw,28px); }
        .lv-ratio-model { display:flex; align-items:center; justify-content:center; gap:22px; }
        .lv-ratio-model .lv-mark { width:clamp(24px,3.5vw,52px); }
        .lv-ratio-cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:12px; }
        .lv-ratio-card { display:grid; gap:12px; border:1px solid rgba(255,255,255,0.17); border-top:4px solid var(--lv-accent); border-radius:16px; background:rgba(0,0,0,0.18); padding:14px 17px; }
        .lv-comparison { color:rgba(255,255,255,0.7); font-size:0.7rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; }
        .lv-forms { display:flex; align-items:center; justify-content:space-between; gap:16px; color:#fff; font-size:clamp(1.25rem,2.8vw,2.5rem); font-weight:950; }
        .lv-fraction { display:inline-grid; grid-template-rows:1fr 1fr; align-items:center; line-height:1; text-align:center; }
        .lv-fraction span:first-child { border-bottom:2px solid currentColor; padding:0 5px 3px; }
        .lv-fraction span:last-child { padding:3px 5px 0; }
        .lesson-visual.studio .lv-score-layout { gap:18px; }
        .lesson-visual.studio .lv-scoreboard { border-radius:12px; padding:10px; }
        .lesson-visual.studio .lv-team { border-radius:9px; padding:9px 6px; }
        .lesson-visual.studio .lv-team strong { font-size:clamp(2.35rem,5vw,4.1rem); }
        .lesson-visual.studio .lv-score-prompt { border-left-width:4px; padding:7px 0 7px 12px; font-size:clamp(0.86rem,1.7vw,1.25rem); line-height:1.25; }
        .lesson-visual.studio .lv-model-layout { gap:13px; }
        .lesson-visual.studio .lv-mark { width:clamp(27px,4vw,46px); }
        .lesson-visual.studio .lv-model-prompt { border-left-width:4px; padding:5px 0 5px 10px; font-size:clamp(0.75rem,1.3vw,0.94rem); }
        .lesson-visual.studio .lv-ratio-layout { gap:12px; }
        .lesson-visual.studio .lv-ratio-card { gap:7px; border-radius:10px; padding:9px 11px; }
        .lesson-visual.studio .lv-forms { font-size:clamp(1rem,2vw,1.5rem); }
        @media (max-width:760px) {
          .lv-score-layout { grid-template-columns:1fr; gap:16px; }
          .lv-scoreboard { width:min(100%,430px); justify-self:center; }
          .lv-score-prompt { font-size:1rem; }
          .lv-quantity-row { gap:12px; }
          .lv-for-every { font-size:0.66rem; }
          .lv-ratio-cards { grid-template-columns:1fr; }
        }
      `}</style>

      {visual.kind === "scoreboard" ? (
        <div className="lv-score-layout" aria-label="Halftime scoreboard visual">
          <div className="lv-scoreboard">
            <p className="lv-score-label">Halftime</p>
            {visual.teams.map((team) => (
              <div className="lv-team" key={team.label}>
                <span>{team.label}</span>
                <strong>{team.score}</strong>
              </div>
            ))}
          </div>
          <p className="lv-score-prompt">{visual.prompt}</p>
        </div>
      ) : visual.kind === "quantity-model" ? (
        <div className="lv-model-layout" aria-label={`${visual.mode === "counters" ? "Counter" : "Tile"} ratio visual`}>
          <p className="lv-model-title">{visual.mode === "counters" ? "Build the mixture" : "Draw and label the model"}</p>
          <div className="lv-quantity-row">
            {quantityMarks(visual.quantities[0], visual.mode)}
            <span className="lv-for-every">and</span>
            {quantityMarks(visual.quantities[1], visual.mode)}
          </div>
          {visual.total ? <p className="lv-total">{visual.total} total</p> : null}
          <p className="lv-model-prompt">{visual.prompt}</p>
        </div>
      ) : (
        <div className="lv-ratio-layout" aria-label="Ratio forms visual">
          <div className="lv-ratio-model">
            {quantityMarks(visual.quantities[0], "tiles")}
            {quantityMarks(visual.quantities[1], "tiles")}
          </div>
          <div className="lv-ratio-cards">
            {visual.comparisons.map((comparison) => (
              <article className="lv-ratio-card" key={`${comparison.left}-${comparison.right}`}>
                <p className="lv-comparison">{titleCase(comparison.left)} to {titleCase(comparison.right)}</p>
                <div className="lv-forms">
                  <span>{comparison.numerator}:{comparison.denominator}</span>
                  <span>{comparison.numerator} to {comparison.denominator}</span>
                  {fraction(comparison.numerator, comparison.denominator)}
                </div>
              </article>
            ))}
          </div>
          <p className="lv-model-prompt">{visual.prompt}</p>
        </div>
      )}
    </div>
  );
}
