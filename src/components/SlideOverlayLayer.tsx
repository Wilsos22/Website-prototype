"use client";

// Renders a slide overlay's elements above the auto-generated projector
// slide. Positions and sizes are percentages of the stage; font sizes are
// percentages of the measured stage height so text scales with the room.
// Pointer events stay off - the layer decorates, it never intercepts.

import { useEffect, useRef, useState } from "react";
import {
  tokenizeEquation,
  type SlideOverlayData,
  type SlideOverlayElement,
} from "@/lib/slideOverlay";

const MATH_FONT = '"STIX Two Math", "Cambria Math", "Times New Roman", Georgia, serif';

export function EquationText({ text }: { text: string }) {
  return (
    <span style={{ fontFamily: MATH_FONT }}>
      {tokenizeEquation(text).map((token, index) => {
        if (token.kind === "fraction") {
          return (
            <span
              key={index}
              style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", verticalAlign: "middle", margin: "0 0.08em", lineHeight: 1.05 }}
              aria-label={`${token.numerator} over ${token.denominator}`}
            >
              <span style={{ fontSize: "0.62em", borderBottom: "0.09em solid currentColor", padding: "0 0.24em" }}>{token.numerator}</span>
              <span style={{ fontSize: "0.62em", padding: "0 0.24em" }}>{token.denominator}</span>
            </span>
          );
        }
        if (token.kind === "super") {
          return <sup key={index} style={{ fontSize: "0.6em" }}>{token.text}</sup>;
        }
        if (token.kind === "variable") {
          return <i key={index}>{token.text}</i>;
        }
        return <span key={index}>{token.text}</span>;
      })}
    </span>
  );
}

export function OverlayElementView({ element, stageHeight }: { element: SlideOverlayElement; stageHeight: number }) {
  const color = element.color || "#201e1a";
  if (element.type === "line" || element.type === "arrow") {
    const thickness = element.thickness ?? 4;
    const x2 = element.x2 ?? element.x + 20;
    const y2 = element.y2 ?? element.y;
    const markerId = `slide-arrow-${element.id}`;
    return (
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }} aria-hidden="true">
        {element.type === "arrow" ? (
          <defs>
            <marker id={markerId} markerWidth="7" markerHeight="7" refX="4.6" refY="2.6" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L5.4,2.6 L0,5.2 Z" fill={color} />
            </marker>
          </defs>
        ) : null}
        <line
          x1={`${element.x}%`} y1={`${element.y}%`} x2={`${x2}%`} y2={`${y2}%`}
          stroke={color} strokeWidth={thickness} strokeLinecap="round"
          markerEnd={element.type === "arrow" ? `url(#${markerId})` : undefined}
        />
      </svg>
    );
  }

  const box: React.CSSProperties = {
    position: "absolute",
    left: `${element.x}%`,
    top: `${element.y}%`,
    width: element.w != null ? `${element.w}%` : undefined,
    height: (element.type === "rect" || element.type === "circle" || element.type === "image") && element.h != null ? `${element.h}%` : undefined,
    pointerEvents: "none",
  };
  if (element.type === "rect" || element.type === "circle") {
    const thickness = element.thickness ?? 4;
    return (
      <span
        style={{
          ...box,
          display: "block",
          border: `${thickness}px solid ${color}`,
          background: element.fill ? color : "transparent",
          borderRadius: element.type === "circle" ? "50%" : 14,
          boxSizing: "border-box",
        }}
        aria-hidden="true"
      />
    );
  }
  if (element.type === "image") {
    if (!element.url) return null;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={element.url} alt="" style={{ ...box, objectFit: "contain" }} />
    );
  }
  const fontSize = Math.max(10, ((element.size ?? 6) / 100) * stageHeight);
  const textStyle: React.CSSProperties = {
    ...box,
    color,
    fontSize,
    lineHeight: 1.18,
    fontWeight: element.type === "equation" ? 600 : 800,
    fontFamily: element.type === "equation" ? MATH_FONT : "var(--bdb-font)",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
  };
  return (
    <span style={textStyle}>
      {element.type === "equation" ? <EquationText text={element.text || ""} /> : element.text || ""}
    </span>
  );
}

export default function SlideOverlayLayer({ overlay }: { overlay: SlideOverlayData }) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageHeight, setStageHeight] = useState(700);

  useEffect(() => {
    const measure = () => {
      const height = stageRef.current?.clientHeight;
      if (height) setStageHeight(height);
    };
    measure();
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
    <div ref={stageRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }} aria-hidden="true">
      {overlay.elements.map((element) => (
        <OverlayElementView key={element.id} element={element} stageHeight={stageHeight} />
      ))}
    </div>
  );
}
