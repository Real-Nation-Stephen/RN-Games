/**
 * Lightweight confetti burst (win only). Respects prefers-reduced-motion.
 */

const REDUCED =
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * @param {HTMLElement} [container] defaults to document.body
 */
export function burstConfetti(container = document.body) {
  if (REDUCED) return;

  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "presentation");
  canvas.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:60;width:100%;height:100%";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.scale(dpr, dpr);

  const colors = ["#ffd54a", "#ff6b6b", "#69db7c", "#74c0fc", "#eebefa", "#fff"];
  const pieces = Array.from({ length: 72 }, () => ({
    x: window.innerWidth * 0.5 + (Math.random() - 0.5) * 120,
    y: window.innerHeight * 0.35 + (Math.random() - 0.5) * 80,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 18 - 6,
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.35,
    w: 6 + Math.random() * 8,
    h: 4 + Math.random() * 6,
    color: colors[(Math.random() * colors.length) | 0],
    life: 1,
  }));

  const start = performance.now();
  const duration = 2600;

  function frame(now) {
    const elapsed = now - start;
    if (!ctx) return;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const t = elapsed / duration;
    for (const p of pieces) {
      p.vy += 0.42;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life = 1 - t;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (elapsed < duration) {
      requestAnimationFrame(frame);
    } else {
      canvas.remove();
    }
  }

  requestAnimationFrame(frame);
}
