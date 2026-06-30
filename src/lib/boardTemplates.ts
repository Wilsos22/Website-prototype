// Preset board backgrounds (Notability-style templates). Each returns an SVG
// data URL used as the InkBoard background, so the teacher writes over it — and
// it broadcasts + exports through the existing background pipeline for free.

const W = 1600;
const H = 900;
const LINE = "#94a3b8";
const FAINT = "#cbd5e1";
const INK = "#475569";

function url(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${svg}</svg>`)}`;
}

function numberLine(): string {
  const y = 450, x0 = 120, x1 = 1480, n = 10, step = (x1 - x0) / n;
  let s = `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${LINE}" stroke-width="4"/>`;
  s += `<polygon points="${x1 + 4},${y} ${x1 - 16},${y - 11} ${x1 - 16},${y + 11}" fill="${LINE}"/>`;
  s += `<polygon points="${x0 - 4},${y} ${x0 + 16},${y - 11} ${x0 + 16},${y + 11}" fill="${LINE}"/>`;
  for (let i = 0; i < n; i += 1) {
    for (let j = 1; j < 5; j += 1) {
      const x = x0 + i * step + (j * step) / 5;
      s += `<line x1="${x}" y1="${y - 11}" x2="${x}" y2="${y + 11}" stroke="${FAINT}" stroke-width="2"/>`;
    }
  }
  for (let i = 0; i <= n; i += 1) {
    const x = x0 + i * step;
    s += `<line x1="${x}" y1="${y - 26}" x2="${x}" y2="${y + 26}" stroke="${LINE}" stroke-width="3"/>`;
  }
  return url(s);
}

function coordinateGrid(): string {
  const cx = W / 2, cy = H / 2, gap = 60;
  let s = "";
  for (let x = cx % gap; x <= W; x += gap) s += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${FAINT}" stroke-width="1.5"/>`;
  for (let y = cy % gap; y <= H; y += gap) s += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${FAINT}" stroke-width="1.5"/>`;
  s += `<line x1="0" y1="${cy}" x2="${W}" y2="${cy}" stroke="${LINE}" stroke-width="3.5"/>`;
  s += `<line x1="${cx}" y1="0" x2="${cx}" y2="${H}" stroke="${LINE}" stroke-width="3.5"/>`;
  s += `<polygon points="${W},${cy} ${W - 18},${cy - 10} ${W - 18},${cy + 10}" fill="${LINE}"/>`;
  s += `<polygon points="0,${cy} 18,${cy - 10} 18,${cy + 10}" fill="${LINE}"/>`;
  s += `<polygon points="${cx},0 ${cx - 10},18 ${cx + 10},18" fill="${LINE}"/>`;
  s += `<polygon points="${cx},${H} ${cx - 10},${H - 18} ${cx + 10},${H - 18}" fill="${LINE}"/>`;
  return url(s);
}

function placeValue(): string {
  const labels = ["Hundreds", "Tens", "Ones", "Tenths", "Hundredths"];
  const m = 130, x0 = m, x1 = W - m, n = labels.length, cw = (x1 - x0) / n;
  const top = 170, bot = 770, headH = 86;
  let s = `<rect x="${x0}" y="${top}" width="${x1 - x0}" height="${bot - top}" fill="none" stroke="${LINE}" stroke-width="3"/>`;
  s += `<line x1="${x0}" y1="${top + headH}" x2="${x1}" y2="${top + headH}" stroke="${LINE}" stroke-width="3"/>`;
  for (let i = 1; i < n; i += 1) {
    const x = x0 + i * cw;
    const decimal = i === 3; // between Ones and Tenths
    s += `<line x1="${x}" y1="${top}" x2="${x}" y2="${bot}" stroke="${decimal ? INK : FAINT}" stroke-width="${decimal ? 4 : 2}" ${decimal ? 'stroke-dasharray="2 0"' : ""}/>`;
  }
  labels.forEach((label, i) => {
    const x = x0 + i * cw + cw / 2;
    s += `<text x="${x}" y="${top + headH / 2 + 9}" text-anchor="middle" font-family="Albert Sans, system-ui, sans-serif" font-size="30" font-weight="700" fill="${INK}">${label}</text>`;
  });
  return url(s);
}

function hundredGrid(): string {
  const size = 600, cell = size / 10, x0 = (W - size) / 2, y0 = (H - size) / 2 + 10;
  let s = "";
  for (let i = 0; i <= 10; i += 1) {
    const major = i % 5 === 0;
    s += `<line x1="${x0 + i * cell}" y1="${y0}" x2="${x0 + i * cell}" y2="${y0 + size}" stroke="${major ? LINE : FAINT}" stroke-width="${major ? 3 : 1.5}"/>`;
    s += `<line x1="${x0}" y1="${y0 + i * cell}" x2="${x0 + size}" y2="${y0 + i * cell}" stroke="${major ? LINE : FAINT}" stroke-width="${major ? 3 : 1.5}"/>`;
  }
  return url(s);
}

export const BOARD_TEMPLATES: { id: string; label: string; build: () => string | null }[] = [
  { id: "blank", label: "Blank", build: () => null },
  { id: "numberline", label: "Number line", build: numberLine },
  { id: "grid", label: "Coordinate grid", build: coordinateGrid },
  { id: "placevalue", label: "Place value", build: placeValue },
  { id: "hundredths", label: "100-grid", build: hundredGrid },
];
