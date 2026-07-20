import type { CSSProperties } from "react";
import type {
  LessonStoryImage,
  LessonVisual as LessonVisualModel,
  LessonVisualQuantity,
  LessonScoreboardStage,
} from "@/lib/lessonVisuals";
import { scoreboardTeamsForStage } from "@/lib/lessonVisuals";

interface LessonVisualProps {
  visual: LessonVisualModel;
  variant: "control" | "projector" | "studio";
  accent?: string;
  scoreboardStage?: LessonScoreboardStage;
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

function StoryFrames({ images }: { images: LessonStoryImage[] }) {
  return (
    <div className={`lv-story-frames count-${Math.min(images.length, 3)}`}>
      {images.map((image, index) => (
        <figure className="lv-story-frame" key={`${image.url}-${index}`}>
          <img src={image.url} alt={image.alt} />
          {image.caption ? <figcaption>{image.caption}</figcaption> : null}
        </figure>
      ))}
    </div>
  );
}

function StoryLayout({
  images,
  situation,
  prompt,
}: {
  images: LessonStoryImage[];
  situation: string;
  prompt: string;
}) {
  return (
    <div className="lv-story-layout">
      <StoryFrames images={images} />
      <div className="lv-story-copy">
        <p className="lv-story-situation"><span>The situation</span>{situation}</p>
        <p className="lv-story-question"><span>Your call</span>{prompt}</p>
      </div>
    </div>
  );
}

export default function LessonVisual({
  visual,
  variant,
  accent = "#d59a55",
  scoreboardStage = "halftime",
}: LessonVisualProps) {
  const style = { "--lv-accent": accent } as CSSProperties;
  const scoreboardTeams = visual.kind === "scoreboard"
    ? scoreboardTeamsForStage(visual.teams, scoreboardStage)
    : null;

  return (
    <div className={`lesson-visual ${variant} ${visual.kind}${scoreboardStage === "final" ? " is-final" : ""}`} style={style}>
      <style>{`
        .lesson-visual { width:100%; min-width:0; color:#fff; }
        .lesson-visual * { box-sizing:border-box; }
        .lesson-visual p { margin:0; }
        .lv-story-layout { width:min(100%,1180px); display:grid; gap:clamp(12px,2vw,22px); margin:0 auto; }
        .lv-story-frames { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:clamp(10px,1.5vw,17px); }
        .lv-story-frames.count-1 { grid-template-columns:minmax(0,1fr); }
        .lv-story-frames.count-3 { grid-template-columns:repeat(3,minmax(0,1fr)); }
        .lv-story-frame { position:relative; min-width:0; overflow:hidden; aspect-ratio:16 / 9; margin:0; border:1px solid rgba(255,255,255,0.25); border-radius:clamp(11px,1.5vw,18px); background:#050704; box-shadow:0 18px 45px rgba(0,0,0,0.38); }
        .lv-story-frame img { display:block; width:100%; height:100%; object-fit:cover; }
        .lv-story-frame figcaption { position:absolute; inset:auto 10px 10px; width:max-content; max-width:calc(100% - 20px); overflow:hidden; border:1px solid rgba(255,255,255,0.28); border-radius:7px; background:rgba(4,8,5,0.82); color:#fff; padding:6px 9px; text-overflow:ellipsis; white-space:nowrap; font-size:clamp(0.58rem,0.8vw,0.72rem); font-weight:900; letter-spacing:0.05em; text-transform:uppercase; backdrop-filter:blur(8px); }
        .lv-story-copy { display:grid; grid-template-columns:minmax(0,0.78fr) minmax(0,1.22fr); gap:clamp(10px,1.6vw,18px); text-align:left; }
        .lv-story-copy p { display:grid; align-content:center; gap:5px; min-height:76px; border:1px solid rgba(255,255,255,0.17); border-left:6px solid var(--lv-accent); border-radius:11px; background:rgba(0,0,0,0.24); padding:11px 15px; color:#fff; font-size:clamp(0.88rem,1.5vw,1.28rem); line-height:1.25; font-weight:790; }
        .lv-story-copy p span { color:var(--lv-accent); font-size:0.58em; font-weight:950; letter-spacing:0.13em; text-transform:uppercase; }
        .lv-story-question { font-size:clamp(1rem,1.75vw,1.5rem) !important; font-weight:880 !important; }
        .lv-score-layout { width:100%; display:grid; grid-template-columns:minmax(210px,0.82fr) minmax(0,1.18fr); align-items:center; gap:clamp(18px,4vw,58px); }
        .lv-score-layout.with-story { grid-template-columns:minmax(0,1fr) minmax(250px,0.82fr); align-items:stretch; gap:clamp(12px,2vw,24px); }
        .lv-score-layout.with-story .lv-story-frames { align-self:center; }
        .lv-score-layout.with-story .lv-score-prompt { grid-column:1 / -1; }
        .lv-scoreboard { min-width:0; display:grid; grid-template-columns:1fr 1fr; gap:11px; border:1px solid rgba(255,255,255,0.18); border-radius:20px; background:rgba(0,0,0,0.2); padding:15px; box-shadow:0 22px 56px rgba(0,0,0,0.22); }
        .lesson-visual.scoreboard.is-final .lv-scoreboard { animation:lv-score-reveal 900ms ease-out both; }
        @keyframes lv-score-reveal {
          0% { box-shadow:0 22px 56px rgba(0,0,0,0.22), 0 0 0 rgba(255,215,128,0); transform:scale(0.985); }
          45% { box-shadow:0 22px 56px rgba(0,0,0,0.22), 0 0 42px rgba(255,215,128,0.62); transform:scale(1.015); }
          100% { box-shadow:0 22px 56px rgba(0,0,0,0.22), 0 0 0 rgba(255,215,128,0); transform:scale(1); }
        }
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
        .lesson-visual.studio .lv-story-layout { gap:9px; }
        .lesson-visual.studio .lv-story-frames { gap:8px; }
        .lesson-visual.studio .lv-story-frame { border-radius:8px; box-shadow:0 8px 18px rgba(0,0,0,0.25); }
        .lesson-visual.studio .lv-story-frame figcaption { inset:auto 6px 6px; max-width:calc(100% - 12px); padding:3px 6px; font-size:0.48rem; }
        .lesson-visual.studio .lv-story-copy { gap:8px; }
        .lesson-visual.studio .lv-story-copy p { min-height:48px; border-left-width:4px; border-radius:7px; padding:6px 9px; font-size:clamp(0.58rem,1vw,0.76rem); line-height:1.22; }
        .lesson-visual.studio .lv-story-question { font-size:clamp(0.62rem,1.1vw,0.82rem) !important; }
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
        .lesson-visual.control .lv-story-layout { gap:11px; }
        .lesson-visual.control .lv-story-copy p { min-height:62px; padding:8px 12px; font-size:clamp(0.72rem,1.15vw,1rem); }
        .lesson-visual.control .lv-story-question { font-size:clamp(0.82rem,1.3vw,1.12rem) !important; }
        @media (max-width:760px) {
          .lv-story-frames.count-2, .lv-story-frames.count-3 { grid-template-columns:1fr; }
          .lv-story-frames.count-3 .lv-story-frame:nth-child(n + 3) { display:none; }
          .lv-story-copy { grid-template-columns:1fr; }
          .lv-score-layout, .lv-score-layout.with-story { grid-template-columns:1fr; gap:16px; }
          .lv-score-layout.with-story .lv-score-prompt { grid-column:auto; }
          .lv-scoreboard { width:min(100%,430px); justify-self:center; }
          .lv-score-prompt { font-size:1rem; }
          .lv-quantity-row { gap:12px; }
          .lv-for-every { font-size:0.66rem; }
          .lv-ratio-cards { grid-template-columns:1fr; }
        }
        @media (prefers-reduced-motion:reduce) {
          .lesson-visual.scoreboard.is-final .lv-scoreboard { animation:none; }
        }
      `}</style>

      {visual.kind === "scoreboard" ? (
        <div className={`lv-score-layout${visual.storyImages?.length ? " with-story" : ""}`} aria-label={`${scoreboardStage === "final" ? "Final" : "Halftime"} scoreboard visual`}>
          {visual.storyImages?.length ? <StoryFrames images={visual.storyImages.slice(0, 3)} /> : null}
          <div className="lv-scoreboard">
            <p className="lv-score-label">{scoreboardStage === "final" ? "Final" : "Halftime"}</p>
            {scoreboardTeams?.map((team) => (
              <div className="lv-team" key={team.label}>
                <span>{team.label}</span>
                <strong>{team.score}</strong>
              </div>
            ))}
          </div>
          <p className="lv-score-prompt">{visual.prompt}</p>
        </div>
      ) : visual.kind === "storyboard" ? (
        <StoryLayout images={visual.images} situation={visual.situation} prompt={visual.prompt} />
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
