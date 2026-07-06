import { CATCH_DESIGN_H, CATCH_DESIGN_W, type CatchItemVariant } from "@rngames/shared";
import { track } from "@rngames/shared/track";
import {
  emitStepComplete,
  isFlowMode,
  parseFlowContextFromSearch,
  saveFlowContext,
} from "@rngames/shared";
import { submitLinkedScore } from "../leaderboard/api";
import {
  fetchPublicConfig,
  getSlugFromPath,
  pickBackgroundUrl,
  pickBreakpoint,
  pickEndBackgroundUrl,
} from "./api";
import { CatchEngine } from "./engine";
import {
  initCatchAudio,
  isCatchMuted,
  playCatchBeep,
  playCatchSfx,
  preloadCatchSfx,
  setCatchMuted,
  unlockCatchAudio,
} from "./audio";
import { bindCatchKeyboard, pollHorizontalInput, pollMenuAction } from "./gamepad";
import { bindCatchLayout, layoutCatchStage, pointerToStageX as mapPointerX } from "./layout";
import type { CatchConfig } from "./types";

const isPreview = new URLSearchParams(window.location.search).get("preview") === "1";
const flowMode = isFlowMode();
const flowNextLabel =
  new URLSearchParams(window.location.search).get("nextStepLabel")?.trim() || "Continue";

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
  intro: document.getElementById("catch-intro")!,
  introPositiveText: document.getElementById("catch-intro-positive-text")!,
  introPositiveList: document.getElementById("catch-intro-positive-list")!,
  introNegativeWrap: document.getElementById("catch-intro-negative-wrap")!,
  introNegativeText: document.getElementById("catch-intro-negative-text")!,
  introNegativeList: document.getElementById("catch-intro-negative-list")!,
  introNext: document.getElementById("catch-intro-next") as HTMLButtonElement,
  nameScreen: document.getElementById("catch-name-screen")!,
  nameStart: document.getElementById("catch-name-start") as HTMLInputElement,
  nameContinue: document.getElementById("catch-name-continue") as HTMLButtonElement,
  muteBtn: document.getElementById("catch-mute") as HTMLButtonElement,
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
  endLink: document.getElementById("catch-end-link") as HTMLAnchorElement,
  powered: document.getElementById("powered-by-rn") as HTMLElement,
  music: document.getElementById("catch-music") as HTMLAudioElement,
};

let cfg: CatchConfig | null = null;
let engine: CatchEngine | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let lastTs = 0;
let raf = 0;
let unbindLayout: (() => void) | null = null;
let unbindKeyboard: (() => void) | null = null;
let lastCountdownBeep = 0;
let lastTimerBeepSec = -1;

const imageCache = new Map<string, HTMLImageElement>();

initCatchAudio();
updateMuteUi();

function nameStorageKey(slug: string) {
  return `catch-name:${slug}`;
}

function externalIdStorageKey(slug: string) {
  return `catch-lb-ext:${slug}`;
}

function needsPlayerName() {
  return !!cfg?.linkedLeaderboardSlug && cfg.highScore?.enabled !== false;
}

function nameMaxLen() {
  return Math.min(32, Math.max(1, cfg?.highScore?.nameMaxLength || 3));
}

function getPlayerName() {
  if (!cfg) return "Player";
  const max = nameMaxLen();
  const saved = localStorage.getItem(nameStorageKey(cfg.slug)) || "";
  const fromStart = els.nameStart?.value?.trim() || "";
  const raw = fromStart || saved || "Player";
  return raw.slice(0, max) || "Player";
}

function savePlayerName(name: string) {
  if (!cfg) return;
  const trimmed = name.trim().slice(0, nameMaxLen());
  if (trimmed) localStorage.setItem(nameStorageKey(cfg.slug), trimmed);
}

function getLeaderboardExternalId() {
  if (!cfg) return "";
  const key = externalIdStorageKey(cfg.slug);
  let id = localStorage.getItem(key);
  if (!id) {
    id = `catch-${cfg.id}-${crypto.randomUUID()}`;
    localStorage.setItem(key, id);
  }
  return id;
}

function updateMuteUi() {
  document.body.classList.toggle("catch-muted", isCatchMuted());
  if (isCatchMuted()) els.music.pause();
}

function applyMusicVolume() {
  if (!cfg) return;
  els.music.volume = isCatchMuted() ? 0 : (cfg.sounds.musicVolume ?? 0.35);
}

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
  setViewportBackground("game");

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
  els.endPlay.textContent = flowMode ? flowNextLabel : end.playAgainLabel || "Play again";
  root.style.setProperty("--catch-end-link-btn", end.linkButtonHex || "#1e81ff");
  root.style.setProperty("--catch-end-link-btn-text", end.linkButtonTextHex || "#ffffff");
  const showLink = end.linkEnabled === true && Boolean((end.linkUrl || "").trim());
  if (showLink) {
    els.endLink.href = end.linkUrl.trim();
    els.endLink.textContent = end.linkLabel || "Learn more";
    els.endLink.hidden = false;
  } else {
    els.endLink.hidden = true;
    els.endLink.removeAttribute("href");
  }
  if (end.logoUrl) {
    els.endLogo.src = end.logoUrl;
    els.endLogo.hidden = false;
  } else {
    els.endLogo.hidden = true;
  }

  els.swipeText.textContent = c.gameplay.swipeHintText || "Swipe to move";
  els.powered.hidden = c.showPoweredBy === false;

  const intro = c.intro;
  els.introPositiveText.textContent = intro.positiveLine || "Catch these to earn points";
  els.introNegativeText.textContent = intro.negativeLine || "Avoid catching these or lose points";
  els.introNext.textContent = intro.nextLabel || "Next";
  const hideNegative = c.gameplay.positiveOnly;
  els.introNegativeWrap.hidden = hideNegative;
  renderIntroVariants(els.introPositiveList, c.sprites.positive, "catch-intro__sprite--positive");
  if (!hideNegative) {
    renderIntroVariants(els.introNegativeList, c.sprites.negative, "catch-intro__sprite--negative", true);
  } else {
    els.introNegativeList.innerHTML = "";
  }

  injectFonts(c);
  preloadCatchSfx([
    c.sounds.positiveCatch,
    c.sounds.negativeCatch,
    c.sounds.gameEnd,
  ]);
  void preloadSprites(c);
  setupMusic(c);
  applyMusicVolume();
}

function setViewportBackground(mode: "game" | "end") {
  if (!cfg) return;
  const root = document.documentElement;
  if (mode === "end") {
    const endBg = pickEndBackgroundUrl(cfg);
    root.style.setProperty("--catch-viewport-bg-solid", cfg.backgroundHex || "#0f1a24");
    root.style.setProperty("--catch-viewport-bg-image", endBg ? `url("${endBg}")` : "none");
  } else {
    const bg = pickBackgroundUrl(cfg);
    root.style.setProperty("--catch-viewport-bg-solid", cfg.backgroundHex || "#1a2a3a");
    root.style.setProperty("--catch-viewport-bg-image", bg ? `url("${bg}")` : "none");
  }
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
  const urls = [
    c.catcherSpriteUrl,
    ...c.sprites.positive.map((v) => v.url),
    ...c.sprites.negative.map((v) => v.url),
    c.banner.logoUrl,
    c.endScreen.logoUrl,
    pickBackgroundUrl(c),
  ];
  await Promise.all(urls.map((url) => loadImage(url)));
}

function renderIntroVariants(
  container: HTMLElement,
  variants: CatchItemVariant[],
  placeholderClass: string,
  negative = false,
) {
  container.innerHTML = "";
  const usable = variants.filter((v) => v.url);
  if (!usable.length) {
    const ph = document.createElement("div");
    ph.className = `catch-intro__sprite--placeholder ${placeholderClass}`;
    container.appendChild(ph);
    return;
  }
  for (const v of usable) {
    const row = document.createElement("div");
    row.className = "catch-intro__variant";
    const img = document.createElement("img");
    img.className = "catch-intro__sprite";
    img.src = v.url;
    img.alt = "";
    const pts = document.createElement("p");
    pts.className = "catch-intro__points";
    pts.textContent = negative ? `−${v.points}` : v.points === 1 ? "+1" : `+${v.points}`;
    row.appendChild(img);
    row.appendChild(pts);
    container.appendChild(row);
  }
}

function itemVariantUrl(c: CatchConfig, kind: "positive" | "negative", variantId: string) {
  const list = kind === "positive" ? c.sprites.positive : c.sprites.negative;
  return list.find((v) => v.id === variantId)?.url || list.find((v) => v.url)?.url || "";
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

function showNameUi() {
  els.nameScreen.hidden = false;
  els.intro.hidden = true;
  els.startOverlay.hidden = true;
  els.countdownOverlay.hidden = true;
  els.swipeHint.hidden = true;
  els.end.hidden = true;
  setViewportBackground("game");
  if (cfg) {
    els.nameStart.maxLength = nameMaxLen();
    const saved = localStorage.getItem(nameStorageKey(cfg.slug));
    if (saved) els.nameStart.value = saved.slice(0, nameMaxLen());
  }
}

function updateHud() {
  if (!engine || !cfg) return;
  els.score.textContent = String(engine.score);
  els.timer.textContent = formatTime(engine.timeLeft);
}

function showIntroUi() {
  els.nameScreen.hidden = true;
  els.intro.hidden = false;
  els.startOverlay.hidden = true;
  els.countdownOverlay.hidden = true;
  els.swipeHint.hidden = true;
  els.end.hidden = true;
  setViewportBackground("game");
}

function showStartUi() {
  els.nameScreen.hidden = true;
  els.intro.hidden = true;
  els.startOverlay.hidden = false;
  els.countdownOverlay.hidden = true;
  els.swipeHint.hidden = false;
  els.end.hidden = true;
  setViewportBackground("game");
}

function showCountdownUi(n: number) {
  els.nameScreen.hidden = true;
  els.intro.hidden = true;
  els.startOverlay.hidden = true;
  els.countdownOverlay.hidden = false;
  els.swipeHint.hidden = true;
  els.countdownNum.textContent = String(n);
}

function showPlayingUi() {
  els.nameScreen.hidden = true;
  els.intro.hidden = true;
  els.startOverlay.hidden = true;
  els.countdownOverlay.hidden = true;
  els.swipeHint.hidden = true;
  els.end.hidden = true;
}

async function submitToLeaderboard() {
  if (!cfg?.linkedLeaderboardSlug || !cfg.id || !engine) return;
  try {
    await submitLinkedScore({
      leaderboardSlug: cfg.linkedLeaderboardSlug,
      sourceGameId: cfg.id,
      displayName: needsPlayerName() ? getPlayerName() : "Player",
      score: engine.score,
      externalId: getLeaderboardExternalId(),
    });
  } catch {
    /* optional */
  }
}

async function showEndUi() {
  if (!engine || !cfg) return;
  els.nameScreen.hidden = true;
  els.intro.hidden = true;
  els.end.hidden = false;
  els.startOverlay.hidden = true;
  els.countdownOverlay.hidden = true;
  els.swipeHint.hidden = true;
  setViewportBackground("end");
  els.endScore.textContent = `${cfg.endScreen.scorePrefix || "Score:"} ${engine.score}`;
  playCatchSfx(cfg.sounds.gameEnd);
  els.music.pause();

  els.endNameWrap.hidden = true;
  void submitToLeaderboard();

  track({
    type: "catch.round_end",
    gameId: cfg.id || cfg.slug,
    payload: { slug: cfg.slug, score: engine.score },
  });
}

function stagePointerX(clientX: number): number {
  return mapPointerX(clientX, els.fit);
}

function beginRound() {
  if (!engine || !cfg || engine.state !== "idle") return;
  void unlockCatchAudio();
  engine.beginFromTouch();
  lastCountdownBeep = 0;
  lastTimerBeepSec = -1;
  if (!isCatchMuted()) void els.music.play().catch(() => undefined);
  track({
    type: "catch.round_start",
    gameId: cfg.id || cfg.slug,
    payload: { slug: cfg.slug },
  });
}

function onPointer(clientX: number) {
  if (!engine || !cfg) return;
  void unlockCatchAudio();
  const x = stagePointerX(clientX);
  engine.setCatcherX(x);
  if (engine.state === "idle") beginRound();
}

function handleMenuGamepad() {
  const action = pollMenuAction();
  if (!action || !engine || !cfg) return;

  if (!els.nameScreen.hidden) {
    if (action === "advance") els.nameContinue.click();
    return;
  }
  if (!els.intro.hidden) {
    if (action === "advance") els.introNext.click();
    return;
  }
  if (!els.end.hidden) {
    if (action === "replay") els.endPlay.click();
    return;
  }
  if (!els.startOverlay.hidden && engine.state === "idle" && action === "start") {
    beginRound();
  }
}

function bindInput() {
  const onDown = (e: PointerEvent) => {
    if (els.nameScreen.hidden === false || els.intro.hidden === false) return;
    const target = e.currentTarget as HTMLElement;
    if (target.setPointerCapture) target.setPointerCapture(e.pointerId);
    onPointer(e.clientX);
  };
  const onMove = (e: PointerEvent) => {
    if (!engine || els.nameScreen.hidden === false || els.intro.hidden === false) return;
    if (engine.state === "playing" || engine.state === "countdown" || engine.state === "idle") {
      engine.setCatcherX(stagePointerX(e.clientX));
    }
  };
  els.fit.addEventListener("pointerdown", onDown);
  els.fit.addEventListener("pointermove", onMove);
  els.nameContinue.addEventListener("click", () => {
    if (!cfg) return;
    const name = els.nameStart.value.trim().slice(0, nameMaxLen());
    if (!name) {
      els.nameStart.focus();
      return;
    }
    savePlayerName(name);
    getLeaderboardExternalId();
    showIntroUi();
  });
  els.nameStart.addEventListener("keydown", (e) => {
    if (e.key === "Enter") els.nameContinue.click();
  });
  els.introNext.addEventListener("click", () => showStartUi());
  els.muteBtn.addEventListener("click", () => {
    setCatchMuted(!isCatchMuted());
    updateMuteUi();
    applyMusicVolume();
    if (isCatchMuted()) els.music.pause();
  });
  els.endPlay.addEventListener("click", () => {
    if (!engine || !cfg) return;
    if (flowMode) {
      emitStepComplete({ "catch.score": engine.score, completed: true });
      return;
    }
    engine.reset(cfg);
    lastCountdownBeep = 0;
    lastTimerBeepSec = -1;
    updateHud();
    showIntroUi();
  });
  unbindKeyboard?.();
  unbindKeyboard = bindCatchKeyboard();
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
  item: {
    x: number;
    y: number;
    kind: "positive" | "negative";
    variantId: string;
    rotation: number;
    size: number;
  },
) {
  if (!ctx) return;
  const url = itemVariantUrl(c, item.kind, item.variantId);
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

  handleMenuGamepad();

  const padX = pollHorizontalInput();
  if (padX && (engine.state === "playing" || engine.state === "countdown" || engine.state === "idle")) {
    engine.nudgeCatcher(padX, dt);
  }

  if (engine.state === "playing" && engine.score !== prevScore) {
    const delta = engine.score - prevScore;
    playCatchSfx(delta > 0 ? cfg.sounds.positiveCatch : cfg.sounds.negativeCatch);
  }

  if (engine.state === "countdown" && engine.countdownValue !== lastCountdownBeep) {
    lastCountdownBeep = engine.countdownValue;
    playCatchBeep(660);
  }

  if (engine.state === "playing") {
    const sec = Math.ceil(engine.timeLeft);
    if (sec <= 5 && sec > 0 && sec !== lastTimerBeepSec) {
      lastTimerBeepSec = sec;
      playCatchBeep(sec <= 3 ? 880 : 740);
    }
  } else {
    lastTimerBeepSec = -1;
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
  let hitW = g.catcherWidth;
  let hitH = g.catcherHeight;
  if (catcherImg && catcherImg.complete && catcherImg.naturalWidth) {
    const scale = Math.min(g.catcherWidth / catcherImg.naturalWidth, g.catcherHeight / catcherImg.naturalHeight);
    hitW = catcherImg.naturalWidth * scale;
    hitH = catcherImg.naturalHeight * scale;
    drawImageContain(ctx, catcherImg, cx, cy, g.catcherWidth, g.catcherHeight);
  } else {
    ctx.fillStyle = "#f4d35e";
    ctx.fillRect(cx - g.catcherWidth / 2, cy - g.catcherHeight / 2, g.catcherWidth, g.catcherHeight);
  }
  engine.setCatcherHitSize(hitW, hitH);

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
  lastCountdownBeep = 0;
  lastTimerBeepSec = -1;
  if (needsPlayerName()) showNameUi();
  else showIntroUi();
  els.app.hidden = false;
  els.muteBtn.hidden = false;
  lastTs = 0;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(drawFrame);
}

function onBreakpointChange() {
  if (!cfg) return;
  layoutCatchStage(els.fit, els.stage);
  setViewportBackground(els.end.hidden ? "game" : "end");
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
  const flowCtx = parseFlowContextFromSearch(new URLSearchParams(window.location.search));
  if (flowCtx) saveFlowContext(flowCtx);
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
    els.muteBtn.hidden = true;
  });
}
