"use client";

// A live, scaled-down look at one classroom surface: the real page in an
// iframe (the surfaces poll on their own, so the thumbnail stays current) at
// a fixed logical size, scaled to the measured container width. Top-anchored,
// so containers shorter than the scaled page crop the bottom. Pointer events
// stay off so taps fall through to whatever wraps it.

import { useEffect, useRef, useState } from "react";

const LOGICAL_WIDTH = 1280;
const LOGICAL_HEIGHT = 800;

export default function LiveScreenPreview({ src, title }: { src: string; title: string }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.15);

  useEffect(() => {
    const measure = () => {
      const width = boxRef.current?.clientWidth;
      if (width) setScale(width / LOGICAL_WIDTH);
    };
    measure();
    // Some embeds report zero-size rects at mount; re-measure briefly until
    // the layout is real, then only on resize.
    const retry = window.setInterval(measure, 400);
    const stopRetry = window.setTimeout(() => window.clearInterval(retry), 4000);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(retry);
      window.clearTimeout(stopRetry);
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div ref={boxRef} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#F3F0E7" }}>
      <iframe
        src={src}
        title={title}
        loading="lazy"
        tabIndex={-1}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          border: 0,
          width: LOGICAL_WIDTH,
          height: LOGICAL_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
