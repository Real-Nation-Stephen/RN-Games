/**
 * Scratcher player — template tests (no slug) or live config (?slug= / preview postMessage).
 */
import { burstConfetti } from "../js/fanfare.js";
import { FORMATS, getFormatOrThrow } from "./formats.js";

const isEmbed = document.body.classList.contains("scratcher-embed");
const API_BASE = "/api";

const BASE_BRUSH = 90;

/** @type {number} */
let sampleRaf = 0;
let lastProgressCheck = 0;
const PROGRESS_MS = 160;

/** @type {import('./formats.js').ScratcherFormat} */
let fmt;
let brushRadius = BASE_BRUSH;
let isWin = true;
/** @type {number} */
let clearThreshold = 0.97;
/** @type {import('./formats.js').ScratcherFormat | null} */
let fmtOverride = null;

/** Live / preview public payload */
let liveConfig = null;

const els = {
  app: document.getElementById("app"),
  fit: document.getElementById("fit"),
  stage: document.getElementById("stage"),
  active: document.getElementById("scratcher-active"),
  bottom: document.getElementById("scratcher-bottom"),
  canvas: document.getElementById("scratch-canvas"),
  buttonSlot: document.getElementById("scratcher-button-slot"),
  cta: document.getElementById("scratcher-cta"),
  buttonImg: document.getElementById("scratcher-button-img"),
  gate: document.getElementById("orientation-gate"),
  gateTitle: document.getElementById("gate-title"),
  gateBody: document.getElementById("gate-body"),
  fsBtn: document.getElementById("wheel-fs-btn"),
  poweredBy: document.getElementById("powered-by-rn"),
  sizeHint: document.getElementById("scratcher-size-hint"),
};

/** @type {CanvasRenderingContext2D | null} */
let ctx = null;
let completed = false;
let scratchWired = false;

function resetRound() {
  completed = false;
  els.canvas?.classList.remove("is-revealed");
  if (els.canvas) els.canvas.style.pointerEvents = "";
  els.buttonSlot?.classList.remove("is-visible");
  els.buttonSlot?.setAttribute("aria-hidden", "true");
}

function resolveFormatId() {
  if (liveConfig?.scratcherFormat) return liveConfig.scratcherFormat;
  const q = new URLSearchParams(location.search).get("format");
  if (q && FORMATS[q]) return q;
  const d = document.body?.dataset?.scratcherFormat;
  if (d && FORMATS[d]) return d;
  return "16x9";
}

function applyDesignTokens() {
  const f = fmtOverride || fmt;
  const r = document.documentElement.style;
  r.setProperty("--design-w", String(f.designW));
  r.setProperty("--design-h", String(f.designH));
  r.setProperty("--sa-left", `${f.active.left}px`);
  r.setProperty("--sa-top", `${f.active.top}px`);
  r.setProperty("--sa-w", `${f.active.width}px`);
  r.setProperty("--sa-h", `${f.active.height}px`);
  r.setProperty("--btn-bottom", `${f.buttonBottom}px`);
  r.setProperty("--btn-w", `${f.button.width}px`);
  r.setProperty("--btn-h", `${f.button.height}px`);
}

function applyGateCopy() {
  if (!els.gateTitle || !els.gateBody || !fmt.gate) return;
  els.gateTitle.textContent = fmt.gate.title;
  els.gateBody.textContent = fmt.gate.body;
}

function applyPageBackground() {
  if (isEmbed) {
    document.documentElement.style.setProperty("--page-bg-image", "none");
    document.documentElement.style.removeProperty("--page-bg-solid");
    return;
  }
  const bg = liveConfig?.assets?.backgroundImage?.trim();
  const hex = liveConfig?.backgroundColor || "#0a1628";
  document.documentElement.style.setProperty("--page-bg-solid", hex);
  if (bg) {
    document.documentElement.style.setProperty("--page-bg-image", `url('${bg}')`);
  } else {
    document.documentElement.style.setProperty("--page-bg-image", "none");
  }
}

/** Phones / small tablets: scale stage to fit; skip orientation gate & “small window” hint */
function isCompactScratcherViewport() {
  return Math.min(window.innerWidth, window.innerHeight) <= 820;
}

function layoutScale() {
  const f = fmtOverride || fmt;
  const compact = isCompactScratcherViewport();
  const pad = isEmbed ? 0 : compact ? 8 : 24;
  const vw = window.innerWidth - pad * 2;
  const vh = window.innerHeight - pad * 2;
  const scale = Math.min(vw / f.designW, vh / f.designH);
  if (!els.stage || !els.fit) return;
  els.stage.style.transform = `scale(${scale})`;
  els.fit.style.width = `${f.designW * scale}px`;
  els.fit.style.height = `${f.designH * scale}px`;

  if (!isEmbed && els.sizeHint) {
    const tooSmall = window.innerWidth < 420 || window.innerHeight < 340;
    els.sizeHint.hidden = compact || !tooSmall;
  }
}

function updateOrientationGate() {
  if (isEmbed || !els.gate) return;
  if (isCompactScratcherViewport()) {
    els.gate.classList.remove("is-visible");
    document.body.style.overflow = "";
    return;
  }
  const f = fmtOverride || fmt;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const r = w / h;
  let show = false;
  if (f.orientationGate === "landscape") show = w < h;
  else if (f.orientationGate === "portrait") show = w > h;
  else if (f.orientationGate === "square") show = Math.abs(r - 1) > 0.28;
  els.gate.classList.toggle("is-visible", show);
  document.body.style.overflow = show ? "hidden" : "";
}

function wireFullscreen() {
  if (!els.fsBtn) return;
  els.fsBtn.hidden = false;
  els.fsBtn.addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      /* ignore */
    }
  });
  document.addEventListener("fullscreenchange", () => {
    const fs = !!document.fullscreenElement;
    els.fsBtn?.setAttribute("aria-pressed", fs ? "true" : "false");
    if (els.fsBtn) els.fsBtn.textContent = fs ? "Exit fullscreen" : "Fullscreen";
  });
}

/**
 * Prefer CORS for canvas sampling; retry without crossOrigin if the CDN omits ACAO (display still works).
 * @param {string} src
 */
function loadImage(src) {
  const s = typeof src === "string" ? src.trim() : "";
  if (!s) return Promise.reject(new Error("Missing image URL"));
  const attempt = (useCors) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      if (useCors) img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(useCors ? "cors-retry" : `Failed to load image`));
      img.src = s;
    });
  return attempt(true).catch((e) => {
    if (e instanceof Error && e.message === "cors-retry") return attempt(false);
    throw e;
  });
}

function initCanvas(topImg) {
  const canvas = els.canvas;
  if (!canvas) return;
  ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(topImg, 0, 0, w, h);
  ctx.globalCompositeOperation = "destination-out";
}

function canvasPos(evt) {
  const canvas = els.canvas;
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const clientX = "touches" in evt && evt.touches[0] ? evt.touches[0].clientX : evt.clientX;
  const clientY = "touches" in evt && evt.touches[0] ? evt.touches[0].clientY : evt.clientY;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

function scratchLine(from, to) {
  if (!ctx) return;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = brushRadius * 2;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

/** @type {{ x: number; y: number } | null} */
let lastPoint = null;

function onPointerDown(evt) {
  if (completed) return;
  evt.preventDefault();
  lastPoint = canvasPos(evt);
  els.canvas?.setPointerCapture(evt.pointerId);
}

function onPointerMove(evt) {
  if (completed || !lastPoint) return;
  evt.preventDefault();
  const p = canvasPos(evt);
  scratchLine(lastPoint, p);
  lastPoint = p;
  scheduleSample();
}

function onPointerUp(evt) {
  lastPoint = null;
  try {
    els.canvas?.releasePointerCapture(evt.pointerId);
  } catch {
    /* ignore */
  }
  if (sampleRaf) {
    cancelAnimationFrame(sampleRaf);
    sampleRaf = 0;
  }
  lastProgressCheck = 0;
  checkClearedRatio();
}

function scheduleSample() {
  if (sampleRaf) return;
  sampleRaf = requestAnimationFrame(() => {
    sampleRaf = 0;
    const now = performance.now();
    if (now - lastProgressCheck < PROGRESS_MS) return;
    lastProgressCheck = now;
    checkClearedRatio();
  });
}

function checkClearedRatio() {
  if (completed || !ctx || !els.canvas) return;
  const canvas = els.canvas;
  const { width: w, height: h } = canvas;
  let data;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return;
  }
  let cleared = 0;
  const total = w * h;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 48) cleared += 1;
  }
  const ratio = cleared / total;
  if (ratio >= clearThreshold) {
    completeReveal();
  }
}

function playOutcomeSound() {
  const url = isWin ? liveConfig?.sounds?.win : liveConfig?.sounds?.lose;
  if (!url) return;
  try {
    const a = new Audio(url);
    void a.play();
  } catch {
    /* ignore */
  }
}

function completeReveal() {
  if (completed) return;
  completed = true;
  if (els.canvas) {
    els.canvas.style.pointerEvents = "none";
    els.canvas.classList.add("is-revealed");
  }
  playOutcomeSound();
  if (isWin) {
    try {
      burstConfetti(document.body);
    } catch (e) {
      console.warn("Confetti failed:", e);
    }
  }
  els.buttonSlot?.classList.add("is-visible");
  els.buttonSlot?.setAttribute("aria-hidden", "false");
}

function wireScratch() {
  if (scratchWired) return;
  scratchWired = true;
  const canvas = els.canvas;
  if (!canvas) return;
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", (e) => {
    if (e.buttons === 0) lastPoint = null;
  });
}

function resolveOutcomeFromConfig(cfg) {
  const lose = (cfg.assets?.bottomLose || "").trim();
  const p = Math.min(100, Math.max(0, Number(cfg.winChancePercent) ?? 100)) / 100;
  if (!lose || p >= 1) return true;
  if (p <= 0) return false;
  return Math.random() < p;
}

function applyFaviconTitle(cfg) {
  const url = cfg.faviconUrl?.trim();
  let link = document.querySelector('link[rel="icon"]');
  if (url) {
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = url;
  } else if (link) {
    link.remove();
  }
  if (cfg.title) document.title = cfg.title;
}

/**
 * @param {Record<string, unknown>} cfg
 */
function applyLiveConfig(cfg) {
  liveConfig = cfg;
  const formatId = resolveFormatId();
  fmt = getFormatOrThrow(formatId);
  fmtOverride = fmt;
  isWin = resolveOutcomeFromConfig(cfg);
  clearThreshold =
    typeof cfg.clearThreshold === "number" ? Math.min(1, Math.max(0.05, cfg.clearThreshold)) : 0.97;
  brushRadius = Math.round(BASE_BRUSH * (fmt.active.width / 1300) * fmt.brushMul);

  applyDesignTokens();
  applyGateCopy();
  applyPageBackground();
  applyFaviconTitle(cfg);

  if (!isEmbed && els.poweredBy) els.poweredBy.hidden = cfg.showPoweredBy === false;

  const bottomUrl = isWin ? cfg.assets?.bottomWin : cfg.assets?.bottomLose || cfg.assets?.bottomWin;
  els.bottom.src = bottomUrl || "";
  els.buttonImg.src = cfg.assets?.button || "";

  const aw = fmt.active.width;
  const ah = fmt.active.height;
  const bw = fmt.button.width;
  const bh = fmt.button.height;
  els.bottom.width = aw;
  els.bottom.height = ah;
  els.canvas.width = aw;
  els.canvas.height = ah;
  els.buttonImg.width = bw;
  els.buttonImg.height = bh;
}

function setupPreviewMode() {
  if (els.app) els.app.hidden = true;
  if (els.fsBtn) els.fsBtn.hidden = true;
  window.addEventListener("message", (e) => {
    if (e.origin !== window.location.origin) return;
    if (e.data?.type !== "rngames-scratcher-config") return;
    const cfg = e.data.config;
    if (!cfg || cfg.gameType !== "scratcher") return;
    if (els.app) els.app.hidden = false;
    void runLive(cfg);
  });
}

let resizeWired = false;
let ctaWired = false;
/** @type {number} */
let runLiveGeneration = 0;

function clearScratcherLiveError() {
  document.getElementById("scratcher-live-error")?.remove();
}

function showScratcherLiveError() {
  clearScratcherLiveError();
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div id="scratcher-live-error" class="player-error scratcher-asset-error" role="alert"><p>Could not load scratcher assets. Check the top (scratch) image URL and CORS.</p></div>`,
  );
}

async function runLive(cfg) {
  const gen = ++runLiveGeneration;
  clearScratcherLiveError();
  try {
    resetRound();
    applyLiveConfig(cfg);
    const topImg = await loadImage(cfg.assets.top);
    if (gen !== runLiveGeneration) return;
    initCanvas(topImg);
    layoutScale();
    updateOrientationGate();
    if (!isEmbed) wireFullscreen();
    wireScratch();
    if (!resizeWired) {
      resizeWired = true;
      const onResize = () => {
        layoutScale();
        updateOrientationGate();
      };
      window.addEventListener("resize", onResize);
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", onResize);
      }
    }
    if (!ctaWired) {
      ctaWired = true;
      els.cta?.addEventListener("click", () => {
        const u = liveConfig?.winButtonUrl?.trim();
        if (u) window.open(u, "_blank", "noopener,noreferrer");
      });
    }
  } catch (e) {
    if (gen !== runLiveGeneration) return;
    console.error(e);
    showScratcherLiveError();
  }
}

async function runTestTemplate() {
  const formatId = resolveFormatId();
  fmt = getFormatOrThrow(formatId);
  fmtOverride = null;
  isWin = fmt.winLose ? Math.random() < 0.5 : true;
  brushRadius = Math.round(BASE_BRUSH * (fmt.active.width / 1300) * fmt.brushMul);
  clearThreshold = 0.97;

  if (fmt.winLose) {
    console.info(`[scratcher ${formatId}] outcome: ${isWin ? "win" : "lose"} (50% test)`);
  }

  applyDesignTokens();
  applyGateCopy();

  const assets = fmt.assets(fmt.winLose ? (isWin ? "win" : "lose") : undefined);

  if (!isEmbed && els.poweredBy) els.poweredBy.hidden = false;

  els.bottom.src = assets.bottom;
  els.buttonImg.src = assets.button;

  const aw = fmt.active.width;
  const ah = fmt.active.height;
  const bw = fmt.button.width;
  const bh = fmt.button.height;
  els.bottom.width = aw;
  els.bottom.height = ah;
  els.canvas.width = aw;
  els.canvas.height = ah;
  els.buttonImg.width = bw;
  els.buttonImg.height = bh;

  try {
    const topImg = await loadImage(assets.top);
    initCanvas(topImg);
  } catch (e) {
    console.error(e);
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div class="player-error" role="alert"><p>Could not load scratch assets for format <code>${formatId}</code>. Check <code>/play/scratchers-test/</code>.</p></div>`,
    );
    return;
  }

  layoutScale();
  updateOrientationGate();
  if (!isEmbed) wireFullscreen();
  wireScratch();

  const onResize = () => {
    layoutScale();
    updateOrientationGate();
  };
  window.addEventListener("resize", onResize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onResize);
  }

  els.cta?.addEventListener("click", () => {});
}

async function bootstrap() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("preview") === "1") {
    setupPreviewMode();
    return;
  }

  const slug = params.get("slug")?.trim();
  if (slug) {
    const res = await fetch(`${API_BASE}/public-wheel?slug=${encodeURIComponent(slug)}`);
    if (!res.ok) {
      document.body.insertAdjacentHTML(
        "afterbegin",
        `<div class="player-error" role="alert"><p>Could not load this scratcher.</p></div>`,
      );
      return;
    }
    const data = await res.json();
    if (data.gameType !== "scratcher") {
      document.body.insertAdjacentHTML(
        "afterbegin",
        `<div class="player-error" role="alert"><p>Not a scratcher game.</p></div>`,
      );
      return;
    }
    await runLive(data);
    return;
  }

  await runTestTemplate();
}

void bootstrap();
