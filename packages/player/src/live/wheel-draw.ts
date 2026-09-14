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

export function wheelSegmentIndex(angleDeg: number, count: number, offsetDeg = 0): number {
  if (count <= 0) return 0;
  const seg = 360 / count;
  const a = ((angleDeg % 360) + 360) % 360;
  const underPointer = (360 - ((a + offsetDeg) % 360) + 360) % 360;
  return Math.min(count - 1, Math.floor(underPointer / seg));
}

export function drawLiveWheel(
  canvas: HTMLCanvasElement,
  state: WheelState,
  now = Date.now(),
): { angle: number; number: number | null } {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { angle: 0, number: null };
  const pool = state.pool || [];
  const n = Math.max(1, pool.length);
  const dpr = window.devicePixelRatio || 1;
  const size = Math.min(canvas.clientWidth || 480, 640);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;
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
  ctx.clearRect(0, 0, size, size);
  const seg = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, (i * seg + (angle * Math.PI) / 180) - Math.PI / 2, ((i + 1) * seg + (angle * Math.PI) / 180) - Math.PI / 2);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? "#14532d" : "#f4f1e8";
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = "#07131f";
  ctx.fill();
  ctx.fillStyle = "#fff";
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
