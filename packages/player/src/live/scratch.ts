export function mountScratcher(opts: {
  host: HTMLElement;
  isWin: boolean;
  winSrc?: string;
  loseSrc?: string;
  threshold?: number;
  onComplete: () => void;
}): { destroy: () => void } {
  const wrap = document.createElement("div");
  wrap.className = "live-scratch-stage";
  const under = document.createElement("div");
  under.style.minHeight = "220px";
  under.style.borderRadius = "12px";
  under.style.display = "flex";
  under.style.alignItems = "center";
  under.style.justifyContent = "center";
  under.style.background = opts.isWin ? "#14532d" : "#3a1d1d";
  const src = opts.isWin ? opts.winSrc : opts.loseSrc;
  if (src) {
    const img = document.createElement("img");
    img.alt = opts.isWin ? "Winning ticket" : "Not a winner";
    img.src = src;
    img.style.width = "100%";
    under.appendChild(img);
  } else {
    under.textContent = opts.isWin ? "WIN" : "Not this time";
    under.style.color = "#fff";
    under.style.font = "700 2rem Barlow Condensed, sans-serif";
  }
  const canvas = document.createElement("canvas");
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  wrap.style.position = "relative";
  wrap.appendChild(under);
  wrap.appendChild(canvas);
  opts.host.appendChild(wrap);

  const ctx = canvas.getContext("2d");
  let done = false;
  const threshold = opts.threshold ?? 0.45;

  function size() {
    const w = wrap.clientWidth || 280;
    const h = Math.max(under.clientHeight || 220, Math.round(w * 1.15));
    wrap.style.height = `${h}px`;
    canvas.width = w;
    canvas.height = h;
    if (!ctx) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#9aa3ad";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#5c6570";
    ctx.font = "bold 22px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Scratch", w / 2, h / 2);
  }
  size();

  function scratch(x: number, y: number) {
    if (!ctx || done) return;
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, 28, 0, Math.PI * 2);
    ctx.fill();
  }

  function clearedRatio(): number {
    if (!ctx) return 0;
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let clear = 0;
    for (let i = 3; i < data.length; i += 16) if (data[i] < 20) clear += 1;
    return clear / (data.length / 16);
  }

  function pos(ev: PointerEvent) {
    const r = canvas.getBoundingClientRect();
    scratch(((ev.clientX - r.left) / r.width) * canvas.width, ((ev.clientY - r.top) / r.height) * canvas.height);
    if (clearedRatio() >= threshold) {
      done = true;
      canvas.style.opacity = "0";
      opts.onComplete();
    }
  }

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pos(e);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.buttons) pos(e);
  });

  return {
    destroy() {
      wrap.remove();
    },
  };
}
