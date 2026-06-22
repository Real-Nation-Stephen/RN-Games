import {
  type RunnerHudSlotKind,
  type RunnerItemVariant,
  type RunnerSpriteSheet,
  runnerCharacterList,
} from "@rngames/shared";
import { track } from "@rngames/shared/track";
import { submitLinkedScore } from "../leaderboard/api";
import {
  fetchPublicConfig,
  getSlugFromPath,
  pickBackgroundUrl,
  pickEndBackgroundUrl,
} from "./api";
import { RunnerEngine } from "./engine";
import {
  initRunnerAudio,
  isRunnerMuted,
  playRunnerBeep,
  playRunnerSfx,
  preloadRunnerSfx,
  setRunnerMuted,
  unlockRunnerAudio,
} from "./audio";
import { bindRunnerKeyboard, pollJumpInput, pollMenuAction } from "./gamepad";
import {
  bindRunnerLayout,
  getRunnerDesignSize,
  layoutRunnerBanner,
  layoutRunnerHud,
  layoutRunnerStage,
  needsLandscapeLock,
  pickRunnerOrientation,
} from "./layout";
import { parallaxDrawHeight, runnerAuthorHeight, scaleRunnerSize, scaleRunnerY } from "./coords";
import type { RunnerConfig } from "./types";

const isPreview = new URLSearchParams(window.location.search).get("preview") === "1";

const els = {
  app: document.getElementById("app")!,
  fit: document.getElementById("fit")!,
  stage: document.getElementById("stage")!,
  canvas: document.getElementById("runner-canvas") as HTMLCanvasElement,
  banner: document.getElementById("runner-banner")!,
  hudLeft: document.getElementById("runner-hud-left")!,
  hudCenter: document.getElementById("runner-hud-center")!,
  hudRight: document.getElementById("runner-hud-right")!,
  hud: document.querySelector(".runner-hud") as HTMLElement,
  jumpHint: document.getElementById("runner-jump-hint")!,
  jumpText: document.getElementById("runner-jump-text")!,
  intro: document.getElementById("runner-intro")!,
  introPositiveText: document.getElementById("runner-intro-positive-text")!,
  introPositiveList: document.getElementById("runner-intro-positive-list")!,
  introNegativeWrap: document.getElementById("runner-intro-negative-wrap")!,
  introNegativeText: document.getElementById("runner-intro-negative-text")!,
  introNegativeList: document.getElementById("runner-intro-negative-list")!,
  introNext: document.getElementById("runner-intro-next") as HTMLButtonElement,
  charSelect: document.getElementById("runner-char-select")!,
  charSelectList: document.getElementById("runner-char-select-list")!,
  nameScreen: document.getElementById("runner-name-screen")!,
  nameStart: document.getElementById("runner-name-start") as HTMLInputElement,
  nameContinue: document.getElementById("runner-name-continue") as HTMLButtonElement,
  muteBtn: document.getElementById("runner-mute") as HTMLButtonElement,
  startOverlay: document.getElementById("runner-start-overlay")!,
  countdownOverlay: document.getElementById("runner-countdown-overlay")!,
  countdownNum: document.getElementById("runner-countdown-num")!,
  end: document.getElementById("runner-end")!,
  endLogo: document.getElementById("runner-end-logo") as HTMLImageElement,
  endHeadline: document.getElementById("runner-end-headline")!,
  endSubhead: document.getElementById("runner-end-subhead")!,
  endScore: document.getElementById("runner-end-score")!,
  endPlay: document.getElementById("runner-end-play") as HTMLButtonElement,
  endLink: document.getElementById("runner-end-link") as HTMLAnchorElement,
  rotate: document.getElementById("runner-rotate")!,
  powered: document.getElementById("powered-by-rn") as HTMLElement,
  music: document.getElementById("runner-music") as HTMLAudioElement,
};

let cfg: RunnerConfig | null = null;
let engine: RunnerEngine | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let lastTs = 0;
let raf = 0;
let unbindLayout: (() => void) | null = null;
let unbindKeyboard: (() => void) | null = null;
let lastCountdownBeep = 0;
let lastTimerBeepSec = -1;
let pastNameGate = false;
let charSelectAnimAcc = 0;

const imageCache = new Map<string, HTMLImageElement>();
const hudRefs = {
  score: null as HTMLElement | null,
  timer: null as HTMLElement | null,
  health: null as HTMLElement | null,
};

initRunnerAudio();
updateMuteUi();

function nameStorageKey(slug: string) {
  return `runner-name:${slug}`;
}

function externalIdStorageKey(slug: string) {
  return `runner-lb-ext:${slug}`;
}

function charStorageKey(slug: string) {
  return `runner-char:${slug}`;
}

function needsCharSelect() {
  if (!cfg) return false;
  return runnerCharacterList(cfg).length > 1;
}

function showCharSelectOrIntro() {
  if (needsCharSelect()) showCharSelectUi();
  else showIntroUi();
}

function restoreCharacterIndex() {
  if (!cfg || !engine) return;
  const list = runnerCharacterList(cfg);
  if (list.length <= 1) {
    engine.setCharacterIndex(0);
    return;
  }
  const saved = localStorage.getItem(charStorageKey(cfg.slug));
  const idx = saved ? Number.parseInt(saved, 10) : 0;
  engine.setCharacterIndex(Number.isFinite(idx) ? idx : 0);
}

function saveCharacterIndex(index: number) {
  if (!cfg) return;
  localStorage.setItem(charStorageKey(cfg.slug), String(index));
}

function needsPlayerName() {
  if (!cfg) return false;
  if (cfg.highScore?.enabled === true) return true;
  return !!cfg.linkedLeaderboardSlug?.trim();
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
    id = `runner-${cfg.id}-${crypto.randomUUID()}`;
    localStorage.setItem(key, id);
  }
  return id;
}

function updateMuteUi() {
  document.body.classList.toggle("runner-muted", isRunnerMuted());
  if (isRunnerMuted()) els.music.pause();
}

function applyMusicVolume() {
  if (!cfg) return;
  els.music.volume = isRunnerMuted() ? 0 : (cfg.sounds.musicVolume ?? 0.35);
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

function injectFonts(c: RunnerConfig) {
  const uploads = c.fontUploads || {};
  for (const [role, meta] of Object.entries(uploads)) {
    if (!meta?.url) continue;
    const id = `runner-font-${role}`;
    if (document.getElementById(id)) continue;
    const style = document.createElement("style");
    style.id = id;
    const family = meta.family || `Runner${role}`;
    style.textContent = `@font-face{font-family:'${family}';src:url('${meta.url}') format('woff2'),url('${meta.url}') format('woff'),url('${meta.url}');font-display:swap;}`;
    document.head.appendChild(style);
  }
  const root = document.documentElement;
  root.style.setProperty("--runner-font-heading", c.fonts.heading || "system-ui, sans-serif");
  root.style.setProperty("--runner-font-body", c.fonts.body || "system-ui, sans-serif");
  root.style.setProperty("--runner-font-score", c.fonts.score || c.fonts.body || "system-ui, sans-serif");
}

function applyTheme(c: RunnerConfig) {
  const { w, h } = getRunnerDesignSize();
  const root = document.documentElement;
  root.style.setProperty("--runner-design-w", String(w));
  root.style.setProperty("--runner-design-h", String(h));
  root.style.setProperty("--runner-bg-solid", c.backgroundHex || "#87c38f");
  const bg = pickBackgroundUrl(c);
  root.style.setProperty("--runner-bg-image", bg ? `url("${bg}")` : "none");
  setViewportBackground("game");

  const b = c.banner;
  root.style.setProperty("--runner-banner-bg", b.backgroundHex || "#5a8f62");
  const align = b.logoAlign === "left" || b.logoAlign === "right" ? b.logoAlign : "center";
  els.banner.className = `runner-banner runner-banner--${align}`;
  if (b.logoUrl) {
    els.banner.innerHTML = `<span class="runner-banner__logo"><img src="${b.logoUrl}" alt="" /></span>`;
  } else {
    els.banner.innerHTML = "";
  }

  const hud = c.hud;
  root.style.setProperty("--runner-hud-score", hud.scoreHex || "#ffffff");
  root.style.setProperty("--runner-hud-timer", hud.timerHex || "#ffffff");
  root.style.setProperty("--runner-hud-health", hud.healthHex || "#ff6b6b");
  root.style.setProperty("--runner-hud-health-empty", hud.healthEmptyHex || "#4a4a4a");
  root.style.setProperty("--runner-hud-label", hud.labelHex || "#e8f5e9");

  const end = c.endScreen;
  root.style.setProperty("--runner-end-headline", end.headlineHex || "#ffffff");
  root.style.setProperty("--runner-end-subhead", end.subheadHex || "#c8d4e0");
  root.style.setProperty("--runner-end-text", end.textHex || "#eef2f7");
  root.style.setProperty("--runner-end-btn", end.buttonHex || "#2d6a4f");
  root.style.setProperty("--runner-end-btn-text", end.buttonTextHex || "#ffffff");
  const endBg = pickEndBackgroundUrl(c);
  root.style.setProperty("--runner-end-bg-solid", c.backgroundHex || "#0f1a24");
  root.style.setProperty("--runner-end-bg-image", endBg ? `url("${endBg}")` : "none");
  root.style.setProperty("--runner-end-overlay", end.overlayHex || "rgba(8, 14, 22, 0.88)");
  root.style.setProperty("--runner-end-flash-start", "transparent");

  els.endHeadline.textContent = end.headline || "Run complete!";
  els.endSubhead.textContent = end.subhead || "";
  els.endPlay.textContent = end.playAgainLabel || "Play again";
  root.style.setProperty("--runner-end-link-btn", end.linkButtonHex || "#1e81ff");
  root.style.setProperty("--runner-end-link-btn-text", end.linkButtonTextHex || "#ffffff");
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

  els.jumpText.textContent = c.gameplay.jumpHintText || "Tap or press A to jump";
  els.powered.hidden = c.showPoweredBy === false;

  const intro = c.intro;
  els.introPositiveText.textContent = intro.positiveLine || "Collect these for bonuses";
  els.introNegativeText.textContent = intro.negativeLine || "Avoid these obstacles";
  els.introNext.textContent = intro.nextLabel || "Next";
  renderIntroVariants(els.introPositiveList, c.items.positive, "runner-intro__sprite--positive", false, c);
  const hasNegative = c.items.negative.some((v) => v.url);
  els.introNegativeWrap.hidden = !hasNegative;
  if (hasNegative) {
    renderIntroVariants(els.introNegativeList, c.items.negative, "runner-intro__sprite--negative", true, c);
  } else {
    els.introNegativeList.innerHTML = "";
  }

  buildHudSlots(c);
  injectFonts(c);
  preloadRunnerSfx([
    c.sounds.positiveItem,
    c.sounds.negativeItem,
    c.sounds.gameEnd,
  ]);
  void preloadAssets(c);
  setupMusic(c);
  applyMusicVolume();
}

function setViewportBackground(mode: "game" | "end") {
  if (!cfg) return;
  const root = document.documentElement;
  if (mode === "end") {
    const endBg = pickEndBackgroundUrl(cfg);
    root.style.setProperty("--runner-viewport-bg-solid", cfg.backgroundHex || "#0f1a24");
    root.style.setProperty("--runner-viewport-bg-image", endBg ? `url("${endBg}")` : "none");
  } else {
    const bg = pickBackgroundUrl(cfg);
    root.style.setProperty("--runner-viewport-bg-solid", cfg.backgroundHex || "#87c38f");
    root.style.setProperty("--runner-viewport-bg-image", bg ? `url("${bg}")` : "none");
  }
}

function setupMusic(c: RunnerConfig) {
  const url = (c.sounds.music || "").trim();
  if (!url) {
    els.music.pause();
    els.music.removeAttribute("src");
    return;
  }
  const absolute = new URL(url, window.location.origin).href;
  if (els.music.src !== absolute) {
    els.music.src = url;
    els.music.loop = true;
    els.music.load();
  }
  applyMusicVolume();
}

function tryPlayMusic() {
  if (!cfg?.sounds.music?.trim() || isRunnerMuted()) return;
  applyMusicVolume();
  void unlockRunnerAudio().then(() => {
    if (els.music.paused) void els.music.play().catch(() => undefined);
  });
}

async function preloadAssets(c: RunnerConfig) {
  const chars = runnerCharacterList(c);
  const urls = [
    ...chars.flatMap((char) => [char.run.url, char.jump.url, char.death.url]),
    ...c.items.positive.map((v) => v.url),
    ...c.items.negative.map((v) => v.url),
    ...c.parallax.map((l) => l.url),
    c.ground.url,
    c.banner.logoUrl,
    c.endScreen.logoUrl,
    pickBackgroundUrl(c),
  ];
  await Promise.all(urls.map((url) => loadImage(url)));
}

function renderIntroVariants(
  container: HTMLElement,
  variants: RunnerItemVariant[],
  placeholderClass: string,
  negative = false,
  c?: RunnerConfig,
) {
  container.innerHTML = "";
  const usable = variants.filter((v) => v.url);
  if (!usable.length) {
    const ph = document.createElement("div");
    ph.className = `runner-intro__sprite--placeholder ${placeholderClass}`;
    container.appendChild(ph);
    return;
  }
  for (const v of usable) {
    const row = document.createElement("div");
    row.className = "runner-intro__variant";
    const img = document.createElement("img");
    img.className = "runner-intro__sprite";
    img.src = v.url;
    img.alt = "";
    const pts = document.createElement("p");
    pts.className = "runner-intro__points";
    pts.textContent = variantIntroLabel(v, negative, c);
    row.appendChild(img);
    row.appendChild(pts);
    container.appendChild(row);
  }
}

function variantIntroLabel(v: RunnerItemVariant, negative: boolean, c?: RunnerConfig) {
  const fx = v.effects;
  const ptsLabel = (c?.intro.pointsLabel || "Pts").trim() || "Pts";
  if (fx.addPoints) return fx.pointsAmount === 1 ? `+1 ${ptsLabel}` : `+${fx.pointsAmount} ${ptsLabel}`;
  if (fx.removePoints) {
    return fx.pointsAmount === 1 ? `−1 ${ptsLabel}` : `−${fx.pointsAmount} ${ptsLabel}`;
  }
  if (fx.addHealth) return `+${fx.healthAmount} ♥`;
  if (fx.removeHealth) return `−${fx.healthAmount} ♥`;
  if (fx.addTime) return `+${fx.timeAmount}s`;
  if (fx.removeTime) return `−${fx.timeAmount}s`;
  return negative ? "Avoid" : "Collect";
}

function hudSlotLabel(kind: RunnerHudSlotKind) {
  if (kind === "score") return "Score";
  if (kind === "timer") return "Time";
  if (kind === "health") return "Health";
  return "";
}

function buildHudSlots(c: RunnerConfig) {
  hudRefs.score = null;
  hudRefs.timer = null;
  hudRefs.health = null;
  populateHudSlot(els.hudLeft, c.hud.slots.left, c);
  populateHudSlot(els.hudCenter, c.hud.slots.center, c);
  populateHudSlot(els.hudRight, c.hud.slots.right, c);
}

function populateHudSlot(container: HTMLElement, kind: RunnerHudSlotKind, c: RunnerConfig) {
  container.innerHTML = "";
  if (kind === "none") return;
  const block = document.createElement("div");
  block.className = "runner-hud__block";
  const label = document.createElement("p");
  label.className = "runner-hud__label";
  label.textContent = hudSlotLabel(kind);
  block.appendChild(label);

  if (kind === "score") {
    const value = document.createElement("p");
    value.className = "runner-hud__value runner-hud__score";
    value.textContent = "0";
    block.appendChild(value);
    hudRefs.score = value;
  } else if (kind === "timer") {
    const value = document.createElement("p");
    value.className = "runner-hud__value runner-hud__timer";
    value.textContent = formatTime(c.gameplay.durationSec);
    block.appendChild(value);
    hudRefs.timer = value;
  } else if (kind === "health") {
    const wrap = document.createElement("div");
    wrap.className =
      c.hud.healthDisplay === "bar" ? "runner-hud__bar-wrap" : "runner-hud__hearts";
    block.appendChild(wrap);
    hudRefs.health = wrap;
  }

  container.appendChild(block);
}

function itemVariantUrl(c: RunnerConfig, kind: "positive" | "negative", variantId: string) {
  const list = kind === "positive" ? c.items.positive : c.items.negative;
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

function formatLeaderboardValue(c: RunnerConfig, value: number) {
  const m = c.gameplay.leaderboardMetric;
  if (m === "time") return formatTime(value);
  if (m === "distance") return String(value);
  return String(value);
}

function updateRotateOverlay() {
  const orientation = pickRunnerOrientation();
  const show =
    needsLandscapeLock(orientation) &&
    pastNameGate &&
    els.nameScreen.hidden;
  els.rotate.hidden = !show;
}

function setHudVisible(visible: boolean) {
  if (els.hud) els.hud.hidden = !visible;
}

function showNameUi() {
  els.nameScreen.hidden = false;
  els.charSelect.hidden = true;
  els.intro.hidden = true;
  setHudVisible(false);
  els.startOverlay.hidden = true;
  els.countdownOverlay.hidden = true;
  els.jumpHint.hidden = true;
  els.end.hidden = true;
  setViewportBackground("game");
  updateRotateOverlay();
  if (cfg) {
    els.nameStart.maxLength = nameMaxLen();
    const saved = localStorage.getItem(nameStorageKey(cfg.slug));
    if (saved) els.nameStart.value = saved.slice(0, nameMaxLen());
  }
}

function showCharSelectUi() {
  els.nameScreen.hidden = true;
  els.charSelect.hidden = false;
  els.intro.hidden = true;
  setHudVisible(false);
  els.startOverlay.hidden = true;
  els.countdownOverlay.hidden = true;
  els.jumpHint.hidden = true;
  els.end.hidden = true;
  setViewportBackground("game");
  charSelectAnimAcc = 0;
  if (cfg) renderCharSelect(cfg);
  updateRotateOverlay();
}

function showIntroUi() {
  els.nameScreen.hidden = true;
  els.charSelect.hidden = true;
  els.intro.hidden = false;
  setHudVisible(false);
  els.startOverlay.hidden = true;
  els.countdownOverlay.hidden = true;
  els.jumpHint.hidden = true;
  els.end.hidden = true;
  setViewportBackground("game");
  updateRotateOverlay();
}

function showStartUi() {
  els.nameScreen.hidden = true;
  els.charSelect.hidden = true;
  els.intro.hidden = true;
  setHudVisible(true);
  els.startOverlay.hidden = false;
  els.countdownOverlay.hidden = true;
  els.jumpHint.hidden = false;
  els.end.hidden = true;
  setViewportBackground("game");
  updateRotateOverlay();
}

function showCountdownUi(n: number) {
  els.nameScreen.hidden = true;
  els.charSelect.hidden = true;
  els.intro.hidden = true;
  els.startOverlay.hidden = true;
  els.countdownOverlay.hidden = false;
  els.jumpHint.hidden = true;
  els.countdownNum.textContent = String(n);
  updateRotateOverlay();
}

function showPlayingUi() {
  els.nameScreen.hidden = true;
  els.charSelect.hidden = true;
  els.intro.hidden = true;
  els.startOverlay.hidden = true;
  els.countdownOverlay.hidden = true;
  els.jumpHint.hidden = true;
  els.end.hidden = true;
  updateRotateOverlay();
}

function updateHud() {
  if (!engine || !cfg) return;
  if (hudRefs.score) hudRefs.score.textContent = String(engine.score);
  if (hudRefs.timer) {
    if (cfg.gameplay.timerEnabled) {
      hudRefs.timer.textContent = formatTime(engine.timeLeft);
    } else {
      hudRefs.timer.textContent = formatTime(engine.elapsedSec);
    }
  }
  if (hudRefs.health) {
    const max = cfg.gameplay.maxHealth;
    const cur = engine.health;
    if (cfg.hud.healthDisplay === "bar") {
      const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
      hudRefs.health.innerHTML = `<div class="runner-health-bar"><div class="runner-health-bar__fill" style="width:${pct}%"></div></div>`;
    } else {
      hudRefs.health.innerHTML = "";
      for (let i = 0; i < max; i++) {
        const heart = document.createElement("span");
        heart.className =
          i < cur ? "runner-hud__heart runner-hud__heart--full" : "runner-hud__heart runner-hud__heart--empty";
        heart.textContent = "♥";
        heart.style.color = i < cur ? cfg.hud.healthHex : cfg.hud.healthEmptyHex;
        hudRefs.health.appendChild(heart);
      }
    }
  }
}

async function submitToLeaderboard() {
  if (!cfg?.linkedLeaderboardSlug || !cfg.id || !engine) return;
  try {
    await submitLinkedScore({
      leaderboardSlug: cfg.linkedLeaderboardSlug,
      sourceGameId: cfg.id,
      displayName: needsPlayerName() ? getPlayerName() : "Player",
      score: engine.leaderboardScore(),
      externalId: getLeaderboardExternalId(),
    });
  } catch {
    /* optional */
  }
}

async function showEndUi() {
  if (!engine || !cfg) return;
  const flashStart =
    cfg.feedback.damageFlashEnabled !== false && engine.damageFlash > 0
      ? hexWithAlpha(cfg.feedback.damageFlashHex, 0.45)
      : "transparent";
  document.documentElement.style.setProperty("--runner-end-flash-start", flashStart);
  engine.damageFlash = 0;
  engine.pickupGlow = 0;
  els.nameScreen.hidden = true;
  els.charSelect.hidden = true;
  els.intro.hidden = true;
  els.end.hidden = false;
  els.end.classList.remove("runner-end--animate");
  void els.end.offsetWidth;
  els.end.classList.add("runner-end--animate");
  els.startOverlay.hidden = true;
  els.countdownOverlay.hidden = true;
  els.jumpHint.hidden = true;
  setHudVisible(false);
  setViewportBackground("end");
  const metricValue = engine.leaderboardScore();
  els.endScore.textContent = `${cfg.endScreen.scorePrefix || "Score:"} ${formatLeaderboardValue(cfg, metricValue)}`;
  playRunnerSfx(cfg.sounds.gameEnd);
  els.music.pause();
  void submitToLeaderboard();
  track({
    type: "runner.round_end",
    gameId: cfg.id || cfg.slug,
    payload: { slug: cfg.slug, score: metricValue },
  });
  updateRotateOverlay();
}

function beginRound() {
  if (!engine || !cfg || engine.state !== "idle") return;
  void unlockRunnerAudio();
  engine.beginFromTouch();
  lastCountdownBeep = 0;
  lastTimerBeepSec = -1;
  if (!isRunnerMuted()) tryPlayMusic();
  track({
    type: "runner.round_start",
    gameId: cfg.id || cfg.slug,
    payload: { slug: cfg.slug },
  });
}

function handleJumpInput() {
  if (!engine || !cfg) return;
  if (!els.nameScreen.hidden || !els.charSelect.hidden || !els.intro.hidden || !els.end.hidden) return;
  const onStart =
    engine.state === "idle" && !els.startOverlay.hidden;
  const active =
    engine.state === "playing" ||
    engine.state === "countdown" ||
    onStart;
  if (!active) return;
  if (onStart) {
    beginRound();
    return;
  }
  engine.jump();
}

function handleMenuGamepad() {
  if (!engine || !cfg) return;
  if (engine.state === "playing" || engine.state === "dying") return;
  const action = pollMenuAction();
  if (!action || !engine || !cfg) return;

  if (!els.nameScreen.hidden) {
    if (action === "advance") els.nameContinue.click();
    return;
  }
  if (!els.charSelect.hidden) return;
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
    if (!els.nameScreen.hidden || !els.charSelect.hidden || !els.intro.hidden || !els.end.hidden) return;
    const target = e.currentTarget as HTMLElement;
    if (target.setPointerCapture) target.setPointerCapture(e.pointerId);
    void unlockRunnerAudio();
    tryPlayMusic();
    if (engine?.state === "idle" && !els.startOverlay.hidden) {
      beginRound();
      return;
    }
    if (engine?.state === "playing") engine.jump();
  };

  els.fit.addEventListener("pointerdown", onDown);
  els.nameContinue.addEventListener("click", () => {
    if (!cfg) return;
    const name = els.nameStart.value.trim().slice(0, nameMaxLen());
    if (!name) {
      els.nameStart.focus();
      return;
    }
    savePlayerName(name);
    getLeaderboardExternalId();
    pastNameGate = true;
    showCharSelectOrIntro();
  });
  els.nameStart.addEventListener("keydown", (e) => {
    if (e.key === "Enter") els.nameContinue.click();
  });
  els.introNext.addEventListener("click", () => showStartUi());
  els.muteBtn.addEventListener("click", () => {
    setRunnerMuted(!isRunnerMuted());
    updateMuteUi();
    applyMusicVolume();
    if (isRunnerMuted()) els.music.pause();
  });
  els.endPlay.addEventListener("click", () => {
    if (!engine || !cfg) return;
    const { w, h } = getRunnerDesignSize();
    engine.reset(cfg, w, h);
    lastCountdownBeep = 0;
    lastTimerBeepSec = -1;
    updateHud();
    showCharSelectOrIntro();
  });
  unbindKeyboard?.();
  unbindKeyboard = bindRunnerKeyboard();
}

function sheetFrameCount(sheet: RunnerSpriteSheet, img: HTMLImageElement) {
  const cols = Math.max(1, Math.floor(img.naturalWidth / sheet.cellWidth));
  const rows = Math.max(1, Math.floor(img.naturalHeight / sheet.cellHeight));
  return cols * rows;
}

function drawSpriteFrame(
  context: CanvasRenderingContext2D,
  img: HTMLImageElement,
  sheet: RunnerSpriteSheet,
  frameIndex: number,
  feetX: number,
  feetY: number,
  destW: number,
  destH: number,
) {
  const cols = Math.max(1, Math.floor(img.naturalWidth / sheet.cellWidth));
  const total = sheetFrameCount(sheet, img);
  const frame = ((frameIndex % total) + total) % total;
  const col = frame % cols;
  const row = Math.floor(frame / cols);
  const sx = col * sheet.cellWidth;
  const sy = row * sheet.cellHeight;
  context.drawImage(
    img,
    sx,
    sy,
    sheet.cellWidth,
    sheet.cellHeight,
    feetX - destW / 2,
    feetY - destH,
    destW,
    destH,
  );
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

function drawLoopingStrip(
  context: CanvasRenderingContext2D,
  img: HTMLImageElement,
  scrollX: number,
  y: number,
  destH: number,
  viewportW: number,
) {
  const ih = img.naturalHeight || 1;
  const iw = img.naturalWidth || 1;
  const scale = destH / ih;
  const tileW = iw * scale;
  if (tileW <= 0) return;
  const offset = ((scrollX % tileW) + tileW) % tileW;
  for (let x = -offset; x < viewportW + tileW; x += tileW) {
    context.drawImage(img, x, y, tileW, destH);
  }
}

function drawItem(
  c: RunnerConfig,
  item: {
    kind: "positive" | "negative";
    variantId: string;
    worldX: number;
    y: number;
    width: number;
    height: number;
  },
  scrollOffset: number,
) {
  if (!ctx || !engine) return;
  const screenX = item.worldX - scrollOffset;
  const url = itemVariantUrl(c, item.kind, item.variantId);
  const img = url ? imageCache.get(url) : null;
  const top = item.y - item.height;
  if (img && img.complete && img.naturalWidth) {
    drawImageContain(ctx, img, screenX, top + item.height / 2, item.width, item.height);
  } else {
    ctx.fillStyle = item.kind === "positive" ? "#3ecf8e" : "#e05d5d";
    ctx.fillRect(screenX - item.width / 2, top, item.width, item.height);
  }
}

function hexWithAlpha(hex: string, alpha: number) {
  const h = (hex || "#ffffff").replace("#", "");
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  if (h.length >= 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return `rgba(255,255,255,${alpha})`;
}

function renderCharSelect(c: RunnerConfig) {
  const list = runnerCharacterList(c);
  els.charSelectList.innerHTML = "";
  list.forEach((char, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "runner-char-select__option";
    const canvas = document.createElement("canvas");
    canvas.className = "runner-char-select__preview";
    canvas.width = 120;
    canvas.height = 120;
    canvas.dataset.charIndex = String(index);
    const label = document.createElement("span");
    label.className = "runner-char-select__label";
    label.textContent = char.label || `Character ${index + 1}`;
    btn.appendChild(canvas);
    btn.appendChild(label);
    btn.addEventListener("click", () => {
      if (!engine) return;
      engine.setCharacterIndex(index);
      saveCharacterIndex(index);
      showIntroUi();
    });
    els.charSelectList.appendChild(btn);
  });
  paintCharSelectPreviews(0);
}

function paintCharSelectPreviews(dt: number) {
  if (els.charSelect.hidden || !cfg) return;
  charSelectAnimAcc += dt;
  const list = runnerCharacterList(cfg);
  const canvases = els.charSelectList.querySelectorAll<HTMLCanvasElement>(".runner-char-select__preview");
  canvases.forEach((canvas) => {
    const index = Number(canvas.dataset.charIndex);
    const char = list[index];
    if (!char) return;
    const ctx2 = canvas.getContext("2d");
    if (!ctx2) return;
    const sheet = char.run;
    const img = sheet.url ? imageCache.get(sheet.url) : null;
    ctx2.clearRect(0, 0, canvas.width, canvas.height);
    if (!img?.complete || !img.naturalWidth) {
      ctx2.fillStyle = "#f4d35e";
      ctx2.fillRect(40, 20, 40, 80);
      return;
    }
    const total = sheetFrameCount(sheet, img);
    const fps = 3;
    const frame = Math.floor(charSelectAnimAcc * fps) % total;
    const destH = Math.min(canvas.height - 8, char.height);
    const destW = (char.width / char.height) * destH;
    drawSpriteFrame(ctx2, img, sheet, frame, canvas.width / 2, canvas.height - 8, destW, destH);
  });
}

function drawParallaxLayers(
  layers: RunnerConfig["parallax"],
  scroll: number,
  designW: number,
  designH: number,
  authorH: number,
) {
  if (!ctx) return;
  for (const layer of layers) {
    const img = layer.url ? imageCache.get(layer.url) : null;
    if (!img?.complete || !img.naturalWidth) continue;
    const layerScroll = scroll * layer.speed;
    const layerY = scaleRunnerY(layer.y, designH, authorH);
    const destH = parallaxDrawHeight(layer.height, img.naturalHeight, designH, authorH);
    drawLoopingStrip(ctx, img, layerScroll, layerY, destH, designW);
  }
}

function drawCharacter() {
  if (!ctx || !engine || !cfg) return;
  const char = engine.activeCharacter();
  const authorH = runnerAuthorHeight(char.groundY);
  const { h: designH } = getRunnerDesignSize();
  let sheet: RunnerSpriteSheet;
  let frame = 0;

  if (engine.state === "dying") {
    sheet = char.death;
    const deathImg = sheet.url ? imageCache.get(sheet.url) : null;
    const total = deathImg ? sheetFrameCount(sheet, deathImg) : 1;
    frame = Math.min(total - 1, Math.floor(engine.deathAnimAcc / 0.12));
  } else if (engine.state === "playing" && !engine.onGround) {
    sheet = char.jump;
    const jumpImg = sheet.url ? imageCache.get(sheet.url) : null;
    const total = jumpImg ? sheetFrameCount(sheet, jumpImg) : 1;
    frame = Math.min(total - 1, engine.jumpAnimFrame);
  } else {
    sheet = char.run;
    frame = engine.animFrame;
  }

  const img = sheet.url ? imageCache.get(sheet.url) : null;
  const feetX = engine.charX;
  const feetY = engine.charY;
  const w = scaleRunnerSize(char.width, designH, authorH);
  const h = scaleRunnerSize(char.height, designH, authorH);

  if (img && img.complete && img.naturalWidth) {
    drawSpriteFrame(ctx, img, sheet, frame, feetX, feetY, w, h);
  } else {
    ctx.fillStyle = "#f4d35e";
    ctx.fillRect(feetX - w / 2, feetY - h, w, h);
  }
}

function drawFrame() {
  if (!ctx || !engine || !cfg) return;
  const prevState = engine.state;
  const prevDamageFlash = engine.damageFlash;
  const prevPickupGlow = engine.pickupGlow;

  const now = performance.now();
  const dt = lastTs ? Math.min(0.05, (now - lastTs) / 1000) : 0;
  lastTs = now;
  engine.update(dt);

  handleMenuGamepad();
  if (pollJumpInput()) handleJumpInput();

  if (engine.damageFlash > 0 && prevDamageFlash <= 0) {
    playRunnerSfx(cfg.sounds.negativeItem);
  }
  if (engine.pickupGlow > 0 && prevPickupGlow <= 0) {
    playRunnerSfx(cfg.sounds.positiveItem);
  }

  if (engine.state === "countdown" && engine.countdownValue !== lastCountdownBeep) {
    lastCountdownBeep = engine.countdownValue;
    playRunnerBeep(660);
  }

  if (engine.state === "playing" && cfg.gameplay.timerEnabled) {
    const sec = Math.ceil(engine.timeLeft);
    if (sec <= 5 && sec > 0 && sec !== lastTimerBeepSec) {
      lastTimerBeepSec = sec;
      playRunnerBeep(sec <= 3 ? 880 : 740);
    }
  } else {
    lastTimerBeepSec = -1;
  }

  if (engine.state === "countdown") {
    showCountdownUi(engine.countdownValue);
    tryPlayMusic();
  } else if (engine.state === "playing" || engine.state === "dying") {
    showPlayingUi();
    tryPlayMusic();
  } else if (engine.state === "ended" && prevState !== "ended") void showEndUi();

  updateHud();

  if (!els.charSelect.hidden) paintCharSelectPreviews(dt);

  const { w: designW, h: designH } = getRunnerDesignSize();
  const authorH = runnerAuthorHeight(engine.activeCharacter().groundY);
  ctx.clearRect(0, 0, designW, designH);

  const scroll = engine.scrollOffset;
  const backLayers = cfg.parallax.filter((l) => !l.renderInFront);
  const frontLayers = cfg.parallax.filter((l) => l.renderInFront);

  drawParallaxLayers(backLayers, scroll, designW, designH, authorH);

  if (cfg.ground.enabled && cfg.ground.url) {
    const gImg = imageCache.get(cfg.ground.url);
    if (gImg?.complete && gImg.naturalWidth) {
      const groundY = scaleRunnerY(cfg.ground.y, designH, authorH);
      const groundH = scaleRunnerSize(cfg.ground.height, designH, authorH);
      const extendH = Math.max(groundH, designH - groundY);
      drawLoopingStrip(ctx, gImg, scroll, groundY, extendH, designW);
    }
  }

  for (const item of engine.items) {
    if (item.kind === "positive") drawItem(cfg, item, scroll);
  }

  if (engine.state !== "ended") {
    drawCharacter();
  }

  for (const item of engine.items) {
    if (item.kind === "negative") drawItem(cfg, item, scroll);
  }

  drawParallaxLayers(frontLayers, scroll, designW, designH, authorH);

  if (engine.damageFlash > 0 && cfg.feedback.damageFlashEnabled !== false) {
    const alpha = Math.min(1, engine.damageFlash / 0.35) * 0.45;
    ctx.fillStyle = hexWithAlpha(cfg.feedback.damageFlashHex, alpha);
    ctx.fillRect(0, 0, designW, designH);
  }

  if (engine.pickupGlow > 0) {
    const alpha = Math.min(1, engine.pickupGlow / 0.45) * 0.35;
    ctx.fillStyle = hexWithAlpha(cfg.feedback.pickupGlowHex, alpha);
    ctx.fillRect(0, 0, designW, designH);
  }

  raf = requestAnimationFrame(drawFrame);
}

function resizeCanvas() {
  const { w, h } = getRunnerDesignSize();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  els.canvas.width = Math.round(w * dpr);
  els.canvas.height = Math.round(h * dpr);
  els.canvas.style.width = `${w}px`;
  els.canvas.style.height = `${h}px`;
  ctx = els.canvas.getContext("2d");
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function mountGame(c: RunnerConfig) {
  layoutRunnerStage(els.fit, els.stage, pickRunnerOrientation());
  layoutRunnerHud(els.hud);
  layoutRunnerBanner(els.banner);
  cfg = c;
  document.title = c.title || "Runner game";
  applyFavicon(c.faviconUrl);
  applyTheme(c);
  const { w, h } = getRunnerDesignSize();
  engine = new RunnerEngine(c, w, h);
  restoreCharacterIndex();
  resizeCanvas();
  unbindLayout?.();
  unbindLayout = bindRunnerLayout(els.fit, els.stage, els.hud, els.banner);
  layoutRunnerBanner(els.banner);
  updateHud();
  lastCountdownBeep = 0;
  lastTimerBeepSec = -1;
  pastNameGate = !needsPlayerName();
  if (needsPlayerName()) showNameUi();
  else showCharSelectOrIntro();
  els.app.hidden = false;
  els.muteBtn.hidden = false;
  lastTs = 0;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(drawFrame);
}

function onBreakpointChange() {
  if (!cfg) return;
  layoutRunnerStage(els.fit, els.stage, pickRunnerOrientation());
  layoutRunnerHud(els.hud);
  layoutRunnerBanner(els.banner);
  const { w, h } = getRunnerDesignSize();
  resizeCanvas();
  if (engine && (engine.designW !== w || engine.designH !== h)) {
    engine.reset(cfg, w, h);
    updateHud();
  }
  setViewportBackground(els.end.hidden ? "game" : "end");
  updateRotateOverlay();
}

window.addEventListener("message", (e) => {
  if (e.origin !== window.location.origin) return;
  if (e.data?.type === "rngames-runner-config" && e.data.config) {
    mountGame(e.data.config as RunnerConfig);
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
    const err = document.getElementById("runner-error")!;
    const msg = document.getElementById("runner-error-msg")!;
    err.hidden = false;
    msg.textContent = e instanceof Error ? e.message : "Failed to load";
    els.app.hidden = true;
    els.muteBtn.hidden = true;
  });
}
