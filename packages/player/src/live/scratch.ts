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

  const ctx = canvas.getContext("2d");
  let done = false;
  let coverReady = false;
  const threshold = Math.min(1, Math.max(0.05, Number(opts.threshold ?? 0.97)));

  function paintOpaquePlaceholder() {
    if (!ctx) return;
    const [aw, ah] = aspectPair(opts.formatId);
    const w = Math.max(2, wrap.clientWidth || 280);
    const h = Math.max(2, Math.round((w * ah) / aw));
    canvas.width = w;
    canvas.height = h;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#1c2836";
    ctx.fillRect(0, 0, w, h);
  }

  function paintCover(img: HTMLImageElement) {
    if (!ctx) return;
    const w = img.naturalWidth || img.width || 1080;
    const h = img.naturalHeight || img.height || 1920;
    canvas.width = w;
    canvas.height = h;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#1c2836";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
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
      coverReady = true;
    }
  })();

  function scratch(x: number, y: number) {
    if (!ctx || done || !coverReady) return;
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, Math.max(24, canvas.width * 0.04), 0, Math.PI * 2);
    ctx.fill();
  }

  function clearedRatio(): number {
    if (!ctx || !coverReady) return 0;
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
    attach(host: HTMLElement) {
      if (wrap.parentElement !== host) host.appendChild(wrap);
    },
  };
}
