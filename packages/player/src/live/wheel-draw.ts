import { computeSpinDelta } from "../js/wheel.js";

type WheelState = {
  pool: number[];
  winnerNumber: number | null;
  spinStartedAt: number | null;
  durationMs: number;
  pointerOffsetDeg: number;
  phase: string;
  startAngle?: number;
  spinDelta?: number;
};

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function wheelTheme() {
  return {
    bg: cssVar("--live-bg", "#07131f"),
    accent: cssVar("--live-accent", "#3ecf8e"),
    headline: cssVar("--live-headline", "#ffffff"),
    text: cssVar("--live-text", "#f4f7fb"),
    buttonText: cssVar("--live-button-text", "#07131f"),
    headingFont: cssVar("--live-heading-font", "system-ui, sans-serif"),
  };
}

export function wheelSegmentIndex(angleDeg: number, count: number, offsetDeg = 0): number {
  if (count <= 0) return 0;
  const seg = 360 / count;
  const a = ((angleDeg % 360) + 360) % 360;
  const underPointer = (360 - ((a + offsetDeg) % 360) + 360) % 360;
  return Math.min(count - 1, Math.floor(underPointer / seg));
}

function labelFor(pool: number[], i: number): string {
  const n = pool[i];
  return n == null ? "" : String(n).padStart(3, "0");
}

export function drawLiveWheel(
  canvas: HTMLCanvasElement,
  state: WheelState,
  now = Date.now(),
): { angle: number; number: number | null } {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { angle: 0, number: null };
  const pool = Array.isArray(state.pool) ? state.pool : [];
  const n = pool.length;
  const theme = wheelTheme();
  const dpr = window.devicePixelRatio || 1;
  const size = Math.min(canvas.clientWidth || 480, 640);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;
  ctx.clearRect(0, 0, size, size);

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = theme.bg;
  ctx.fill();

  if (n <= 0) {
    ctx.fillStyle = theme.headline;
    ctx.font = `700 ${Math.max(18, Math.round(r * 0.12))}px ${theme.headingFont}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No one eligible", cx, cy);
    return { angle: 0, number: null };
  }

  const winnerIndex = Math.max(0, pool.indexOf(Number(state.winnerNumber)));
  let t = 1;
  if (state.phase === "spinning" && state.spinStartedAt) {
    t = Math.max(0, Math.min(1, (now - state.spinStartedAt) / Math.max(1, state.durationMs)));
  }
  const startAngle = Number(state.startAngle || 0);
  const delta =
    typeof state.spinDelta === "number" && state.spinDelta > 0
      ? state.spinDelta
      : computeSpinDelta({
          accumulatedDeg: startAngle,
          segmentCount: n,
          winnerIndex: winnerIndex < 0 ? 0 : winnerIndex,
          offsetDeg: state.pointerOffsetDeg || 0,
          minFullRotations: 5,
          maxFullRotations: 6,
        });
  const angle = startAngle + delta * easeOutCubic(t);
  const rot = (angle * Math.PI) / 180;

  if (n === 1) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = theme.accent;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
    ctx.strokeStyle = theme.bg;
    ctx.lineWidth = Math.max(6, r * 0.04);
    ctx.stroke();
    ctx.fillStyle = theme.headline;
    ctx.beginPath();
    ctx.moveTo(cx, 10);
    ctx.lineTo(cx - 12, 36);
    ctx.lineTo(cx + 12, 36);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = theme.buttonText;
    ctx.font = `700 ${Math.max(36, Math.round(r * 0.42))}px ${theme.headingFont}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(labelFor(pool, 0), cx, cy);
    return { angle, number: pool[0] ?? null };
  }

  const seg = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const a0 = i * seg + rot - Math.PI / 2;
    const a1 = (i + 1) * seg + rot - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, a0, a1);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? theme.accent : theme.text;
    ctx.fill();
    const mid = a0 + seg / 2;
    const tr = r * (n > 10 ? 0.68 : 0.62);
    ctx.fillStyle = i % 2 === 0 ? theme.buttonText : theme.bg;
    const fontPx = Math.max(14, Math.min(42, Math.round(r / Math.max(3.2, n * 0.55))));
    ctx.font = `700 ${fontPx}px ${theme.headingFont}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(labelFor(pool, i), cx + Math.cos(mid) * tr, cy + Math.sin(mid) * tr);
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = theme.bg;
  ctx.fill();
  ctx.fillStyle = theme.headline;
  ctx.beginPath();
  ctx.moveTo(cx, 10);
  ctx.lineTo(cx - 12, 36);
  ctx.lineTo(cx + 12, 36);
  ctx.closePath();
  ctx.fill();
  const idx = wheelSegmentIndex(angle, n, state.pointerOffsetDeg || 0);
  const number = pool[idx] ?? null;
  return { angle, number };
}
