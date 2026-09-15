export function scratchAspectCss(formatId?: string): string {
  switch (String(formatId || "")) {
    case "16x9":
      return "16 / 9";
    case "1x1":
      return "1 / 1";
    case "4x3":
      return "4 / 3";
    case "9x16":
    default:
      return "9 / 16";
  }
}

function aspectPair(formatId?: string): [number, number] {
  switch (String(formatId || "")) {
    case "16x9":
      return [16, 9];
    case "1x1":
      return [1, 1];
    case "4x3":
      return [4, 3];
    case "9x16":
    default:
      return [9, 16];
  }
}

export function loadScratchImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error("Missing scratch cover image"));
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load scratch cover"));
    img.src = src;
    if (img.complete && img.naturalWidth > 0) resolve(img);
  });
}

const PROGRESS_MS = 160;
const BASE_BRUSH = 90;

function coverFitDraw(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
) {
  const iw = img.naturalWidth || img.width || w;
  const ih = img.naturalHeight || img.height || h;
  const scale = Math.max(w / Math.max(1, iw), h / Math.max(1, ih));
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

export function mountScratcher(opts: {
  host: HTMLElement;
  isWin: boolean;
  winSrc?: string;
  loseSrc?: string;
  coverSrc?: string;
  formatId?: string;
  threshold?: number;
  onComplete: () => void;
}): { destroy: () => void; attach: (host: HTMLElement) => void } {
  const wrap = document.createElement("div");
  wrap.className = "live-scratch-stage";
  wrap.style.aspectRatio = scratchAspectCss(opts.formatId);
  const under = document.createElement("div");
  under.className = "live-scratch-under";
  const src = opts.isWin ? opts.winSrc : opts.loseSrc;
  if (src) {
    const img = document.createElement("img");
    img.alt = opts.isWin ? "Winning ticket" : "Not a winner";
    img.src = src;
    under.appendChild(img);
  } else {
    under.textContent = opts.isWin ? "WIN" : "Not this time";
    under.style.color = "var(--live-headline, #fff)";
    under.style.font = "700 2rem var(--live-heading-font, system-ui, sans-serif)";
  }
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-label", "Scratch cover");
  const errEl = document.createElement("p");
  errEl.className = "live-error";
  errEl.hidden = true;
  wrap.appendChild(under);
  wrap.appendChild(canvas);
  wrap.appendChild(errEl);
  opts.host.appendChild(wrap);

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let done = false;
  let coverReady = false;
  let lastPoint: { x: number; y: number } | null = null;
  let sampleRaf = 0;
  let lastProgressCheck = 0;
  let completed = false;
  const threshold = Math.min(1, Math.max(0.05, Number(opts.threshold ?? 0.97)));

  function layoutSize(): [number, number] {
    const [aw, ah] = aspectPair(opts.formatId);
    const w = Math.max(2, Math.round(wrap.clientWidth || 280));
    const h = Math.max(2, Math.round((w * ah) / aw));
    return [w, h];
  }

  function brushWidth(): number {
    return Math.max(36, Math.round(BASE_BRUSH * (canvas.width / 1300)) * 2);
  }

  function paintOpaquePlaceholder() {
    if (!ctx) return;
    const [w, h] = layoutSize();
    canvas.width = w;
    canvas.height = h;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#1c2836";
    ctx.fillRect(0, 0, w, h);
  }

  function paintCover(img: HTMLImageElement) {
    if (!ctx) return;
    const [w, h] = layoutSize();
    canvas.width = w;
    canvas.height = h;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#1c2836";
    ctx.fillRect(0, 0, w, h);
    coverFitDraw(ctx, img, w, h);
    ctx.globalCompositeOperation = "destination-out";
    coverReady = true;
  }

  paintOpaquePlaceholder();

  void (async () => {
    try {
      const cover = await loadScratchImage(String(opts.coverSrc || ""));
      paintCover(cover);
    } catch (e) {
      errEl.hidden = false;
      errEl.textContent =
        e instanceof Error
          ? `${e.message}. Upload a scratch cover (top image) and check the file URL.`
          : "Could not load scratch cover.";
      paintOpaquePlaceholder();
      if (!ctx) return;
      ctx.fillStyle = "#fff";
      ctx.font = "bold 32px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Scratch here", canvas.width / 2, canvas.height / 2);
      ctx.globalCompositeOperation = "destination-out";
      coverReady = true;
    }
  })();

  function canvasPos(ev: PointerEvent): { x: number; y: number } {
    const r = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, r.width);
    const scaleY = canvas.height / Math.max(1, r.height);
    return {
      x: (ev.clientX - r.left) * scaleX,
      y: (ev.clientY - r.top) * scaleY,
    };
  }

  function scratchLine(from: { x: number; y: number }, to: { x: number; y: number }) {
    if (!ctx || done || !coverReady) return;
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = brushWidth();
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  function clearedRatio(): number {
    if (!ctx || !coverReady) return 0;
    const { width, height } = canvas;
    let data: ImageData;
    try {
      data = ctx.getImageData(0, 0, width, height);
    } catch {
      return 0;
    }
    const pixels = data.data;
    let clear = 0;
    const total = width * height;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 48) clear += 1;
    return clear / total;
  }

  function finish() {
    if (completed || done) return;
    done = true;
    completed = true;
    lastPoint = null;
    canvas.style.pointerEvents = "none";
    canvas.style.opacity = "0";
    opts.onComplete();
  }

  function checkCleared() {
    if (clearedRatio() >= threshold) finish();
  }

  function scheduleSample() {
    if (sampleRaf) return;
    sampleRaf = requestAnimationFrame(() => {
      sampleRaf = 0;
      const now = performance.now();
      if (now - lastProgressCheck < PROGRESS_MS) return;
      lastProgressCheck = now;
      checkCleared();
    });
  }

  function onPointerDown(e: PointerEvent) {
    if (done || !coverReady) return;
    e.preventDefault();
    lastPoint = canvasPos(e);
    canvas.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (done || !coverReady || !lastPoint) return;
    e.preventDefault();
    const p = canvasPos(e);
    scratchLine(lastPoint, p);
    lastPoint = p;
    scheduleSample();
  }

  function onPointerUp(e: PointerEvent) {
    lastPoint = null;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (sampleRaf) {
      cancelAnimationFrame(sampleRaf);
      sampleRaf = 0;
    }
    lastProgressCheck = 0;
    checkCleared();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", (e) => {
    if (e.buttons === 0) lastPoint = null;
  });

  return {
    destroy() {
      if (sampleRaf) cancelAnimationFrame(sampleRaf);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      wrap.remove();
    },
    attach(host: HTMLElement) {
      if (wrap.parentElement !== host) host.appendChild(wrap);
    },
  };
}
