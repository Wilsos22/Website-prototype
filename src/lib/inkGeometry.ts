// Variable-width stroke geometry for the iPad ink engine.
//
// A stroke is rendered as ONE filled polygon whose width flows continuously
// with (smoothed) Apple Pencil pressure and tapers at both ends - the thing
// that separates "notes app" ink from "canvas lineTo" ink. Same idea as the
// perfect-freehand algorithm, implemented small and dependency-free.
//
// Inputs are surface pixels; callers convert from the normalised 0..1 wire
// format first. Pressure is expected pre-smoothed at the capture side (EMA in
// InkBoard) so both the local surface and the board render identical shapes.

export interface InkRenderPoint {
  x: number;
  y: number;
  p: number; // 0..1, already smoothed
}

// Width multiplier from pressure: a light touch is ~45% of the dial width, a
// heavy press ~140%. Matches the previous engine's feel so nobody has to
// relearn the S/M/L sizes.
function radiusFor(baseWidth: number, p: number): number {
  return Math.max(0.5, (baseWidth / 2) * (0.45 + 0.95 * p));
}

// End taper: the first/last few points shrink toward a point so strokes start
// and finish like a real pen, not like a sausage.
const TAPER_POINTS = 5;
function taperScale(i: number, count: number): number {
  const fromStart = (i + 1) / Math.min(TAPER_POINTS, count);
  const fromEnd = (count - i) / Math.min(TAPER_POINTS, count);
  return Math.min(1, fromStart, fromEnd);
}

// Drop points that are too close to matter - they only add joint noise.
export function thinPoints(pts: InkRenderPoint[], minDist = 0.75): InkRenderPoint[] {
  if (pts.length <= 2) return pts;
  const out: InkRenderPoint[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i += 1) {
    const prev = out[out.length - 1];
    const dx = pts[i].x - prev.x, dy = pts[i].y - prev.y;
    if (dx * dx + dy * dy >= minDist * minDist) out.push(pts[i]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Build the outline polygon: left edge out, right edge back, with round caps.
// Returns a flat [x0,y0, x1,y1, ...] ring, or null for a dot (use fillDot).
export function strokeOutline(raw: InkRenderPoint[], baseWidth: number, taper = true): number[] | null {
  const pts = thinPoints(raw);
  if (pts.length < 2) return null;

  const left: number[] = [];
  const right: number[] = [];
  const n = pts.length;

  for (let i = 0; i < n; i += 1) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const r = radiusFor(baseWidth, pts[i].p) * (taper ? taperScale(i, n) : 1);
    // normal = (-dy, dx)
    left.push(pts[i].x - dy * r, pts[i].y + dx * r);
    right.push(pts[i].x + dy * r, pts[i].y - dx * r);
  }

  // Round caps: a small fan of points around each end, oriented by the local
  // direction so the cap wraps the tip.
  const cap = (cx: number, cy: number, fromAngle: number, r: number): number[] => {
    const out: number[] = [];
    const steps = 7;
    for (let k = 1; k < steps; k += 1) {
      const t = fromAngle + (Math.PI * k) / steps;
      out.push(cx + Math.cos(t) * r, cy + Math.sin(t) * r);
    }
    return out;
  };

  const startR = radiusFor(baseWidth, pts[0].p) * (taper ? taperScale(0, n) : 1);
  const endR = radiusFor(baseWidth, pts[n - 1].p) * (taper ? taperScale(n - 1, n) : 1);
  const startAngle = Math.atan2(left[1] - pts[0].y, left[0] - pts[0].x);
  const endAngle = Math.atan2(right[right.length - 1] - pts[n - 1].y, right[right.length - 2] - pts[n - 1].x);

  const ring: number[] = [];
  ring.push(...left);
  ring.push(...cap(pts[n - 1].x, pts[n - 1].y, endAngle + Math.PI, endR));
  for (let i = n - 1; i >= 0; i -= 1) ring.push(right[i * 2], right[i * 2 + 1]);
  ring.push(...cap(pts[0].x, pts[0].y, startAngle + Math.PI, startR));
  return ring;
}

export function fillOutline(ctx: CanvasRenderingContext2D, ring: number[]): void {
  ctx.beginPath();
  ctx.moveTo(ring[0], ring[1]);
  for (let i = 2; i < ring.length; i += 2) ctx.lineTo(ring[i], ring[i + 1]);
  ctx.closePath();
  ctx.fill();
}

export function fillDot(ctx: CanvasRenderingContext2D, pt: InkRenderPoint, baseWidth: number): void {
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, radiusFor(baseWidth, pt.p), 0, Math.PI * 2);
  ctx.fill();
}

// Highlighter geometry: constant width (pressure ignored), no taper, so it
// reads as a marker band rather than pen ink.
export function highlightOutline(raw: InkRenderPoint[], width: number): number[] | null {
  const flat = raw.map((p) => ({ ...p, p: 0.58 })); // 0.45 + 0.95*0.58 = ~1.0 => width as dialled
  return strokeOutline(flat, width, false);
}

// ── Hold-to-straighten shape fitting ────────────────────────────────────────
//
// Finish a stroke and hold the pen still: the scribble snaps to the clean
// shape it was trying to be. Open paths become straight lines (with the angle
// snapped to 0/45/90 when close); closed paths become a circle when the
// radius is steady, otherwise an axis-aligned rectangle. The result is
// returned as ORDINARY STROKE POINTS sampled along the ideal path, so the
// wire format, history, and every renderer treat a snapped shape exactly like
// any other stroke.

export type SnapKind = "line" | "circle" | "rect";
export interface SnapResult { kind: SnapKind; points: InkRenderPoint[] }

const SNAP_PRESSURE = 0.6;

function pathLength(pts: InkRenderPoint[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i += 1) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

export function sampleLine(a: { x: number; y: number }, b: { x: number; y: number }, n = 24): InkRenderPoint[] {
  const out: InkRenderPoint[] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, p: SNAP_PRESSURE });
  }
  return out;
}

export function fitSnapShape(raw: InkRenderPoint[]): SnapResult | null {
  const pts = thinPoints(raw, 1.5);
  if (pts.length < 6) return null;
  const len = pathLength(pts);
  if (len < 36) return null; // a dot or a tap - leave it alone

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, cx = 0, cy = 0;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    cx += p.x; cy += p.y;
  }
  cx /= pts.length; cy /= pts.length;
  const bw = maxX - minX, bh = maxY - minY;
  const diag = Math.hypot(bw, bh) || 1;
  const endGap = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);

  // Closed-ish path: the ends nearly meet and the path wraps most of the way
  // around its own bounding box.
  if (endGap < diag * 0.28 && len > diag * 2.2 && bw > 22 && bh > 22) {
    const radii = pts.map((p) => Math.hypot(p.x - cx, p.y - cy));
    const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
    const dev = Math.sqrt(radii.reduce((a, r) => a + (r - mean) * (r - mean), 0) / radii.length);
    if (dev / mean < 0.22) {
      const n = 40;
      const out: InkRenderPoint[] = [];
      for (let i = 0; i <= n; i += 1) {
        const t = (i / n) * Math.PI * 2;
        out.push({ x: cx + Math.cos(t) * mean, y: cy + Math.sin(t) * mean, p: SNAP_PRESSURE });
      }
      return { kind: "circle", points: out };
    }
    const corners = [
      { x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }, { x: minX, y: minY },
    ];
    const out: InkRenderPoint[] = [];
    for (let i = 0; i < corners.length - 1; i += 1) out.push(...sampleLine(corners[i], corners[i + 1], 10));
    return { kind: "rect", points: out };
  }

  // Open path: a straight line between the endpoints, angle-snapped when the
  // hand was clearly going for flat, upright, or diagonal.
  const a = pts[0];
  let b = { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
  // Only straighten when the scribble roughly follows its own chord -
  // a big loop that happens to end far away should not become a line.
  if (len > Math.hypot(b.x - a.x, b.y - a.y) * 1.6) return null;
  return { kind: "line", points: snapLinePoints(a, b) };
}

// A straight line from a to b, with the angle pulled onto 0/45/90 when the
// hand was clearly going for flat, upright, or diagonal. Also used while
// ADJUSTING a snapped line: keep the pen down after the snap and the far end
// follows it.
export function snapLinePoints(a: { x: number; y: number }, b: { x: number; y: number }): InkRenderPoint[] {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const step = Math.PI / 4;
  const snapped = Math.round(angle / step) * step;
  let end = b;
  if (Math.abs(angle - snapped) < (8 * Math.PI) / 180) {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    end = { x: a.x + Math.cos(snapped) * d, y: a.y + Math.sin(snapped) * d };
  }
  return sampleLine(a, end);
}
