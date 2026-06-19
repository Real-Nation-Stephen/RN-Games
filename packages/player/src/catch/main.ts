import { CATCH_DESIGN_H, CATCH_DESIGN_W } from "@rngames/shared";
import { track } from "@rngames/shared/track";
import { submitLinkedScore } from "../leaderboard/api";
import {
  fetchPublicConfig,
  getSlugFromPath,
  pickBackgroundUrl,
  pickBreakpoint,
  pickEndBackgroundUrl,
} from "./api";
import { CatchEngine } from "./engine";
import { bindCatchLayout } from "./layout";
import type { CatchConfig } from "./types";

const isPreview = new URLSearchParams(window.location.search).get("preview") === "1";

const els = {
  app: document.getElementById("app")!,
  fit: document.getElementById("fit")!,
  stage: document.getElementById("stage")!,
  canvas: document.getElementById("catch-canvas") as HTMLCanvasElement,
  banner: document.getElementById("catch-banner")!,
  score: document.getElementById("catch-score-value")!,
  timer: document.getElementById("catch-timer-value")!,
  swipeHint: document.getElementById("catch-swipe-hint")!,
  swipeText: document.getElementById("catch-swipe-text")!,
  startOverlay: document.getElementById("catch-start-overlay")!,
  countdownOverlay: document.getElementById("catch-countdown-overlay")!,
  countdownNum: document.getElementById("catch-countdown-num")!,
  end: document.getElementById("catch-end")!,
  endLogo: document.getElementById("catch-end-logo") as HTMLImageElement,
  endHeadline: document.getElementById("catch-end-headline")!,
  endSubhead: document.getElementById("catch-end-subhead")!,
  endScore: document.getElementById("catch-end-score")!,
  endNameWrap: document.getElementById("catch-end-name-wrap")!,
  endName: document.getElementById("catch-end-name") as HTMLInputElement,
  endPlay: document.getElementById("catch-end-play") as HTMLButtonElement,
  powered: document.getElementById("powered-by-rn") as HTMLElement,
  music: document.getElementById("catch-music") as HTMLAudioElement,
};

let cfg: CatchConfig | null = null;
let engine: CatchEngine | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let lastTs = 0;
let raf = 0;
let unbindLayout: (() => void) | null = null;

const imageCache = new Map<string, HTMLImageElement>();

function loadImage(url: string): Promise<HTMLImageElement | null> {
  const u = (url || "").trim();
  if (!u) return Promise.resolve(null);
  const hit = imageCache.get(u);
  if (hit?.complete) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const cached = imageCache.get(u);
    if (cached) {
      cached.onload = () => resolve(cached);
      cached.onerror = () => resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = u;
    imageCache.set(u, img);
  });
}

function injectFonts(c: CatchConfig) {
  const uploads = c.fontUploads || {};
  for (const [role, meta] of Object.entries(uploads)) {
    if (!meta?.url) continue;
    const id = `catch-font-${role}`;
    if (document.getElementById(id)) continue;
    const style = document.createElement("style");
    style.id = id;
    const family = meta.family || `Catch${role}`;
    style.textContent = `@font-face{font-family:'${family}';src:url('${meta.url}') format('woff2'),url('${meta.url}') format('woff'),url('${meta.url}');font-display:swap;}`;
    document.head.appendChild(style);
  }
  const root = document.documentElement;
  root.style.setProperty("--catch-font-heading", c.fonts.heading || "system-ui, sans-serif");
  root.style.setProperty("--catch-font-body", c.fonts.body || "system-ui, sans-serif");
  root.style.setProperty("--catch-font-score", c.fonts.score || c.fonts.body || "system-ui, sans-serif");
}

function applyTheme(c: CatchConfig) {
  const root = document.documentElement;
  root.style.setProperty("--catch-design-w", String(CATCH_DESIGN_W));
  root.style.setProperty("--catch-design-h", String(CATCH_DESIGN_H));
  root.style.setProperty("--catch-bg-solid", c.backgroundHex || "#1a2a3a");
  const bg = pickBackgroundUrl(c);
  root.style.setProperty("--catch-bg-image", bg ? `url("${bg}")` : "none");

  const b = c.banner;
  root.style.setProperty("--catch-banner-bg", b.backgroundHex || "#0d1b2a");
  const align = b.logoAlign === "left" || b.logoAlign === "right" ? b.logoAlign : "center";
  els.banner.className = `catch-banner catch-banner--${align}`;
  if (b.logoUrl) {
    els.banner.innerHTML = `<img src="${b.logoUrl}" alt="" />`;
  } else {
    els.banner.innerHTML = "";
  }

  const h = c.hud;
  root.style.setProperty("--catch-hud-score", h.scoreHex || "#ffffff");
  root.style.setProperty("--catch-hud-timer", h.timerHex || "#ffffff");
  root.style.setProperty("--catch-hud-label", h.labelHex || "#c8d4e0");

  const end = c.endScreen;
  root.style.setProperty("--catch-end-headline", end.headlineHex || "#ffffff");
  root.style.setProperty("--catch-end-subhead", end.subheadHex || "#c8d4e0");
  root.style.setProperty("--catch-end-text", end.textHex || "#eef2f7");
  root.style.setProperty("--catch-end-btn", end.buttonHex || "#2d6a4f");
  root.style.setProperty("--catch-end-btn-text", end.buttonTextHex || "#ffffff");
  const endBg = pickEndBackgroundUrl(c);
  root.style.setProperty("--catch-end-bg-solid", c.backgroundHex || "#0f1a24");
  root.style.setProperty("--catch-end-bg-image", endBg ? `url("${endBg}")` : "none");

  els.endHeadline.textContent = end.headline || "Time's up!";
  els.endSubhead.textContent = end.subhead || "";
  els.endPlay.textContent = end.playAgainLabel || "Play again";
  if (end.logoUrl) {
    els.endLogo.src = end.logoUrl;
    els.endLogo.hidden = false;
  } else {
    els.endLogo.hidden = true;
  }

  els.swipeText.textContent = c.gameplay.swipeHintText || "Swipe to move";
  els.powered.hidden = c.showPoweredBy === false;

  injectFonts(c);
  void preloadSprites(c);
  setupMusic(c);
}

function setupMusic(c: CatchConfig) {
  const url = c.sounds.music;
  if (!url) {
    els.music.pause();
    els.music.removeAttribute("src");
    return;
  }
  if (els.music.src !== new URL(url, window.location.origin).href) {
    els.music.src = url;
    els.music.volume = c.sounds.musicVolume ?? 0.35;
  }
}

async function preloadSprites(c: CatchConfig) {
  await Promise.all([
    loadImage(c.catcherSpriteUrl),
    loadImage(c.sprites.positiveUrl),
    loadImage(c.sprites.negativeUrl),
    loadImage(c.banner.logoUrl),
    loadImage(c.endScreen.logoUrl),
    loadImage(pickBackgroundUrl(c)),
  ]);
}

function applyFavicon(url?: string) {
  if (!url) return;
  let link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = url;
}

function formatTime(sec: number) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function playSfx(url: string | null | undefined) {
  if (!url) return;
  const a = new Audio(url);
  a.volume = 0.9;
  void a.play().catch(() => undefined);
}

function updateHud() {
  if (!engine || !cfg) return;
  els.score.textContent = String(engine.score);
  els.timer.textContent = formatTime(engine.timeLeft);
}

function showStartUi() {
  els.startOverlay.hidden = false;
  els.countdownOverlay.hidden = true;
  els.swipeHint.hidden = false;
  els.end.hidden = true;
}

function showCountdownUi(n: number) {
  els.startOverlay.hidden = true;
  els.countdownOverlay.hidden = false;
  els.swipeHint.hidden = true;
  els.countdownNum.textContent = String(n);
}

function showPlayingUi() {
  els.startOverlay.hidden = true;
  els.countdownOverlay.hidden = true;
  els.swipeHint.hidden = true;
  els.end.hidden = true;
}

async function submitToLeaderboard() {
  if (!cfg?.linkedLeaderboardSlug || !cfg.id || !engine) return;
  const max = Math.min(12, Math.max(1, cfg.highScore?.nameMaxLength || 3));
  const name =
    (els.endName.value || localStorage.getItem(`catch-name:${cfg.slug}`) || "Player").trim().slice(0, max) ||
    "Player";
  try {
    await submitLinkedScore({
      leaderboardSlug: cfg.linkedLeaderboardSlug,
      sourceGameId: cfg.id,
      displayName: name,
      score: engine.score,
      externalId: `catch-${cfg.id}-${Date.now()}`,
    });
  } catch {
    /* optional */
  }
}

async function showEndUi() {
  if (!engine || !cfg) return;
  els.end.hidden = false;
  els.startOverlay.hidden = true;
  els.countdownOverlay.hidden = true;
  els.swipeHint.hidden = true;
  els.endScore.textContent = `${cfg.endScreen.scorePrefix || "Score:"} ${engine.score}`;
  playSfx(cfg.sounds.gameEnd);
  els.music.pause();

  const needsName = !!cfg.linkedLeaderboardSlug && cfg.highScore?.enabled !== false;
  els.endNameWrap.hidden = !needsName;
  if (needsName) {
    els.endName.maxLength = Math.min(12, Math.max(1, cfg.highScore?.nameMaxLength || 3));
    const saved = localStorage.getItem(`catch-name:${cfg.slug}`);
    if (saved) els.endName.value = saved.slice(0, els.endName.maxLength);
  }

  track({
    type: "catch.round_end",
    gameId: cfg.id || cfg.slug,
    payload: { slug: cfg.slug, score: engine.score },
  });
}

function pointerToStageX(clientX: number): number {
  const rect = els.stage.getBoundingClientRect();
  const scale = rect.width / CATCH_DESIGN_W;
  return (clientX - rect.left) / scale;
}

function onPointer(clientX: number) {
  if (!engine || !cfg) return;
  if (engine.state === "idle") {
    engine.beginFromTouch();
    void els.music.play().catch(() => undefined);
    track({
      type: "catch.round_start",
      gameId: cfg.id || cfg.slug,
      payload: { slug: cfg.slug },
    });
  }
  if (engine.state === "playing" || engine.state === "countdown") {
    engine.setCatcherX(pointerToStageX(clientX));
  }
}

function bindInput() {
  const onDown = (e: PointerEvent) => {
    if (e.currentTarget === els.stage) els.stage.setPointerCapture(e.pointerId);
    onPointer(e.clientX);
  };
  const onMove = (e: PointerEvent) => {
    if (!engine) return;
    if (engine.state === "playing" || engine.state === "countdown") {
      engine.setCatcherX(pointerToStageX(e.clientX));
    }
  };
  els.stage.addEventListener("pointerdown", onDown);
  els.stage.addEventListener("pointermove", onMove);
  els.startOverlay.addEventListener("pointerdown", onDown);
  els.endPlay.addEventListener("click", () => {
    if (!engine || !cfg) return;
    if (!els.endNameWrap.hidden && els.endName.value.trim()) {
      localStorage.setItem(`catch-name:${cfg.slug}`, els.endName.value.trim());
    }
    void submitToLeaderboard();
    engine.reset(cfg);
    updateHud();
    showStartUi();
  });
}

function drawImageContain(
  context: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  boxW: number,
  boxH: number,
) {
  const iw = img.naturalWidth || 1;
  const ih = img.naturalHeight || 1;
  const scale = Math.min(boxW / iw, boxH / ih);
  const w = iw * scale;
  const h = ih * scale;
  context.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

function drawItem(
  c: CatchConfig,
  item: { x: number; y: number; kind: "positive" | "negative"; rotation: number; size: number },
) {
  if (!ctx) return;
  const url = item.kind === "positive" ? c.sprites.positiveUrl : c.sprites.negativeUrl;
  const img = url ? imageCache.get(url) : null;
  ctx.save();
  ctx.translate(item.x, item.y);
  ctx.rotate(item.rotation);
  if (img && img.complete && img.naturalWidth) {
    drawImageContain(ctx, img, 0, 0, item.size, item.size);
  } else {
    ctx.fillStyle = item.kind === "positive" ? "#3ecf8e" : "#e05d5d";
    ctx.beginPath();
    ctx.arc(0, 0, item.size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFrame() {
  if (!ctx || !engine || !cfg) return;
  const prevScore = engine.score;
  const prevState = engine.state;

  const now = performance.now();
  const dt = lastTs ? Math.min(0.05, (now - lastTs) / 1000) : 0;
  lastTs = now;
  engine.update(dt);

  if (engine.state === "playing" && engine.score !== prevScore) {
    playSfx(engine.score > prevScore ? cfg.sounds.positiveCatch : cfg.sounds.negativeCatch);
  }

  if (engine.state === "countdown") showCountdownUi(engine.countdownValue);
  else if (engine.state === "playing") showPlayingUi();
  else if (engine.state === "ended" && prevState !== "ended") void showEndUi();

  updateHud();

  ctx.clearRect(0, 0, CATCH_DESIGN_W, CATCH_DESIGN_H);

  for (const item of engine.items) drawItem(cfg, item);

  const g = cfg.gameplay;
  const cx = engine.catcherX;
  const cy = engine.catcherY;
  const catcherImg = cfg.catcherSpriteUrl ? imageCache.get(cfg.catcherSpriteUrl) : null;
  if (catcherImg && catcherImg.complete && catcherImg.naturalWidth) {
    drawImageContain(ctx, catcherImg, cx, cy, g.catcherWidth, g.catcherHeight);
  } else {
    ctx.fillStyle = "#f4d35e";
    ctx.fillRect(cx - g.catcherWidth / 2, cy - g.catcherHeight / 2, g.catcherWidth, g.catcherHeight);
  }

  raf = requestAnimationFrame(drawFrame);
}

function resizeCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  els.canvas.width = Math.round(CATCH_DESIGN_W * dpr);
  els.canvas.height = Math.round(CATCH_DESIGN_H * dpr);
  els.canvas.style.width = `${CATCH_DESIGN_W}px`;
  els.canvas.style.height = `${CATCH_DESIGN_H}px`;
  ctx = els.canvas.getContext("2d");
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function mountGame(c: CatchConfig) {
  cfg = c;
  document.title = c.title || "Catch game";
  applyFavicon(c.faviconUrl);
  applyTheme(c);
  engine = new CatchEngine(c);
  resizeCanvas();
  unbindLayout?.();
  unbindLayout = bindCatchLayout(els.fit, els.stage);
  updateHud();
  showStartUi();
  els.app.hidden = false;
  lastTs = 0;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(drawFrame);
}

function onBreakpointChange() {
  if (!cfg) return;
  const root = document.documentElement;
  const bg = pickBackgroundUrl(cfg);
  root.style.setProperty("--catch-bg-image", bg ? `url("${bg}")` : "none");
  const endBg = pickEndBackgroundUrl(cfg);
  root.style.setProperty("--catch-end-bg-image", endBg ? `url("${endBg}")` : "none");
}

window.addEventListener("message", (e) => {
  if (e.origin !== window.location.origin) return;
  if (e.data?.type === "rngames-catch-config" && e.data.config) {
    mountGame(e.data.config as CatchConfig);
  }
});

window.addEventListener("resize", onBreakpointChange);

bindInput();

async function main() {
  const slug = getSlugFromPath();
  if (!slug) throw new Error("Missing game slug");
  const c = await fetchPublicConfig(slug);
  mountGame(c);
}

if (!isPreview) {
  main().catch((e) => {
    const err = document.getElementById("catch-error")!;
    const msg = document.getElementById("catch-error-msg")!;
    err.hidden = false;
    msg.textContent = e instanceof Error ? e.message : "Failed to load";
    els.app.hidden = true;
  });
}
