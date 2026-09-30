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

function parseHex(raw: string, fallback: [number, number, number]): [number, number, number] {
  const s = raw.trim();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (!m) return fallback;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgb([r, g, b]: [number, number, number], a = 1): string {
  return a < 1 ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`;
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}

function wheelTheme() {
  const accent = parseHex(cssVar("--live-accent", "#3ecf8e"), [62, 207, 142]);
  const bg = parseHex(cssVar("--live-bg", "#07131f"), [7, 19, 31]);
  const headline = parseHex(cssVar("--live-headline", "#ffffff"), [255, 255, 255]);
  const buttonText = parseHex(cssVar("--live-button-text", "#07131f"), [7, 19, 31]);
  return {
    accent,
    bg,
    headline,
    buttonText,
    headingFont: cssVar("--live-heading-font", "system-ui, sans-serif"),
    rim: mix(accent, headline, 0.35),
    rimDark: mix(accent, bg, 0.55),
    even: accent,
    odd: mix(bg, accent, 0.28),
    hub: mix(bg, accent, 0.18),
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

function currentAngle(state: WheelState, n: number, now: number): number {
  if (state.phase !== "spinning" && state.phase !== "revealed") return Number(state.startAngle || 0);
  const winnerIndex = Math.max(0, state.pool.indexOf(Number(state.winnerNumber)));
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
          segmentCount: Math.max(1, n),
          winnerIndex: winnerIndex < 0 ? 0 : winnerIndex,
          offsetDeg: state.pointerOffsetDeg || 0,
          minFullRotations: 5,
          maxFullRotations: 6,
        });
  return startAngle + delta * easeOutCubic(t);
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
  const size = Math.max(160, Math.round(canvas.clientWidth || canvas.parentElement?.clientWidth || 480));
  const pixels = Math.round(size * dpr);
  if (canvas.width !== pixels || canvas.height !== pixels) {
    canvas.width = pixels;
    canvas.height = pixels;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - Math.max(10, size * 0.03);
  ctx.clearRect(0, 0, size, size);

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = size * 0.06;
  ctx.shadowOffsetY = size * 0.02;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = rgb(theme.bg);
  ctx.fill();
  ctx.restore();

  const rimOuter = r;
  const rimInner = r * 0.92;
  const rim = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  rim.addColorStop(0, rgb(mix(theme.rim, theme.headline, 0.45)));
  rim.addColorStop(0.45, rgb(theme.rim));
  rim.addColorStop(1, rgb(theme.rimDark));
  ctx.beginPath();
  ctx.arc(cx, cy, rimOuter, 0, Math.PI * 2);
  ctx.fillStyle = rim;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, rimInner, 0, Math.PI * 2);
  ctx.fillStyle = rgb(theme.bg);
  ctx.fill();

  if (n <= 0) {
    ctx.fillStyle = rgb(theme.headline);
    ctx.font = `700 ${Math.max(16, Math.round(r * 0.1))}px ${theme.headingFont}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Waiting for players", cx, cy);
    return { angle: 0, number: null };
  }

  const angle = currentAngle(state, n, now);
  // Offset the face too: the fixed pointer and readout must agree.
  const rot = ((angle + (state.pointerOffsetDeg || 0)) * Math.PI) / 180;
  const faceR = rimInner - 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, faceR, 0, Math.PI * 2);
  ctx.clip();

  if (n === 1) {
    const g = ctx.createRadialGradient(cx, cy, faceR * 0.1, cx, cy, faceR);
    g.addColorStop(0, rgb(mix(theme.even, theme.headline, 0.12)));
    g.addColorStop(1, rgb(theme.even));
    ctx.beginPath();
    ctx.arc(cx, cy, faceR, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  } else {
    const seg = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      const a0 = i * seg + rot - Math.PI / 2;
      const a1 = (i + 1) * seg + rot - Math.PI / 2;
      const even = i % 2 === 0;
      const base = even ? (n > 40 ? mix(theme.bg, theme.accent, 0.62) : theme.even) : theme.odd;
      const g = ctx.createRadialGradient(cx, cy, faceR * 0.08, cx, cy, faceR);
      g.addColorStop(0, rgb(mix(base, theme.bg, 0.22)));
      g.addColorStop(1, rgb(base));
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, faceR, a0, a1);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = rgb(theme.bg, 0.55);
      ctx.lineWidth = Math.max(0.5, Math.min(2, faceR * seg * 0.12));
      ctx.stroke();

      const mid = a0 + seg / 2;
      const tr = r * (n > 24 ? 0.76 : n > 8 ? 0.68 : 0.6);
      const fontPx = n > 24 ? Math.max(11, Math.min(16, size * 0.028)) : Math.max(13, Math.min(36, r / Math.max(3.4, n * 0.42)));
      // Keep every segment, but thin dense labels to avoid an unreadable ring.
      // The large live readout always shows the exact number under the pointer.
      const stride = n > 24 ? Math.max(1, Math.ceil(fontPx * 1.5 / (tr * seg))) : 1;
      if (i % stride !== 0 || (i > 0 && n - i < stride)) continue;
      ctx.save();
      ctx.translate(cx + Math.cos(mid) * tr, cy + Math.sin(mid) * tr);
      ctx.rotate(n > 24 ? mid + (Math.cos(mid) < 0 ? Math.PI : 0) : mid + Math.PI / 2);
      ctx.fillStyle = n > 40 || !even ? rgb(theme.headline) : rgb(theme.buttonText);
      ctx.font = `700 ${fontPx}px ${theme.headingFont}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(labelFor(pool, i), 0, 0);
      ctx.restore();
    }
  }

  const gloss = ctx.createLinearGradient(cx, cy - faceR, cx, cy);
  gloss.addColorStop(0, "rgba(255,255,255,0.22)");
  gloss.addColorStop(0.55, "rgba(255,255,255,0)");
  ctx.fillStyle = gloss;
  ctx.beginPath();
  ctx.arc(cx, cy - faceR * 0.12, faceR * 0.92, Math.PI * 1.05, Math.PI * 1.95);
  ctx.fill();
  ctx.restore();

  if (n > 1) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = rgb(theme.hub);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.16, 0, Math.PI * 2);
    ctx.strokeStyle = rgb(theme.rim);
    ctx.lineWidth = Math.max(3, r * 0.025);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.055, 0, Math.PI * 2);
    ctx.fillStyle = rgb(theme.rim);
    ctx.fill();
  }

  if (n === 1) {
    ctx.fillStyle = rgb(theme.buttonText);
    ctx.font = `700 ${Math.max(36, Math.round(r * 0.42))}px ${theme.headingFont}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(labelFor(pool, 0), cx, cy);
    return { angle, number: pool[0] ?? null };
  }

  const idx = wheelSegmentIndex(angle, n, state.pointerOffsetDeg || 0);
  const number = pool[idx] ?? null;
  return { angle, number };
}
