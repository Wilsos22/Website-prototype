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
