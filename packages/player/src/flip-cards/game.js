/**
 * Flip cards — production player (public API or admin preview postMessage).
 */
const API_BASE = "/api";

const CARD_W_PER_H = 827 / 1417;

/** @type {Record<string, unknown> | null} */
let liveConfig = null;

/** Deck indices currently dealt (length = cards shown in grid) */
let dealtDeckIndices = [];

function gapPx(innerWidth) {
  return Math.min(22, Math.max(10, innerWidth * 0.022));
}

function effectiveMaxCols(innerWidth, maxColsLg) {
  let cap = maxColsLg;
  if (innerWidth <= 360) cap = Math.min(cap, 2);
  else if (innerWidth <= 900) cap = Math.min(cap, 3);
  return Math.max(1, cap);
}

function densityForCount(count) {
  if (count <= 7) return 1;
  return Math.max(0.72, 1 - (count - 7) * 0.028);
}

/** Fisher–Yates shuffle, returns first k unique indices from 0..n-1 */
function randomDeal(n, k) {
  const kk = Math.min(Math.max(1, k), n);
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, kk);
}

function resolveFront(cfg, deckIndex) {
  const c = cfg.cards[deckIndex];
  if (!c) return "";
  const shared = (cfg.sharedFrontImage || "").trim();
  return (c.frontImage || "").trim() || shared || "";
}

function resolveBack(cfg, deckIndex) {
  const c = cfg.cards[deckIndex];
  return (c?.backImage || "").trim();
}

const gridSection = document.getElementById("grid-section");
const selectionTitleEl = document.querySelector(".selection-title");
const detail = document.getElementById("detail");
const detailBackdrop = document.querySelector(".detail-backdrop");
const detailFlip = document.querySelector(".detail-flip");
const detailFlipInner = document.querySelector(".detail-flip-inner");
const detailFrontImg = document.querySelector(".detail-face--front img");
const detailBackImg = document.querySelector(".detail-face--back img");
const detailTitle = document.getElementById("detail-title");
const detailBody = document.getElementById("detail-body");
const backBtn = document.querySelector(".back-btn");
const brandMarkEl = document.getElementById("brand-mark");
const poweredByEl = document.getElementById("powered-by-rn");
const shuffleBar = document.getElementById("shuffle-bar");
const shuffleBtn = document.getElementById("shuffle-btn");
const muteBtn = document.getElementById("flip-mute-btn");
const fsBtn = document.getElementById("flip-fs-btn");

/** Primary + icon controls scale (studio sizes × this in applyTheme) */
const CONTROL_SIZE_SCALE = 1.25;

let closing = false;
let musicEl = null;
let musicStarted = false;
/** Configured music volume (0–1); applied unless user mutes */
let targetMusicVolume = 0.35;
/** Mutes background music, card SFX, and shuffle swoosh */
let audioMuted = false;

/** Speaker icons — subtle, matches button text colour */
const ICON_SOUND_ON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
const ICON_SOUND_OFF = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;

const ICON_FS_ENTER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`;
const ICON_FS_EXIT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V4h4"/><path d="M20 8V4h-4"/><path d="M4 16v4h4"/><path d="M20 16v4h-4"/></svg>`;

/** Current card overlay SFX only — not background music */
let cardSoundAudio = null;

/** Reused for shuffle swoosh (user gesture resumes if suspended) */
let sfxAudioContext = null;

function getSfxAudioContext() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!sfxAudioContext) sfxAudioContext = new AC();
  if (sfxAudioContext.state === "suspended") {
    void sfxAudioContext.resume();
  }
  return sfxAudioContext;
}

function stopCardSound() {
  if (!cardSoundAudio) return;
  try {
    cardSoundAudio.pause();
    cardSoundAudio.currentTime = 0;
  } catch {
    /* ignore */
  }
  cardSoundAudio = null;
}

function applyMusicVolumeFromState() {
  if (!musicEl) return;
  musicEl.volume = audioMuted ? 0 : Math.min(1, Math.max(0, targetMusicVolume));
}

function updateMuteButtonUi() {
  if (!muteBtn) return;
  const wrap = muteBtn.querySelector(".flip-mute-btn__icon");
  muteBtn.setAttribute("aria-pressed", audioMuted ? "true" : "false");
  muteBtn.setAttribute("aria-label", audioMuted ? "Sound off — tap to turn on" : "Sound on — tap to mute");
  if (wrap) wrap.innerHTML = audioMuted ? ICON_SOUND_OFF : ICON_SOUND_ON;
}

function getFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function fullscreenSupported() {
  const el = document.documentElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

function updateFullscreenButtonUi() {
  if (!fsBtn) return;
  const active = !!getFullscreenElement();
  const wrap = fsBtn.querySelector(".flip-fs-btn__icon");
  fsBtn.setAttribute("aria-pressed", active ? "true" : "false");
  fsBtn.setAttribute("aria-label", active ? "Exit fullscreen" : "Enter fullscreen");
  if (wrap) wrap.innerHTML = active ? ICON_FS_EXIT : ICON_FS_ENTER;
}

function toggleFullscreen() {
  const cur = getFullscreenElement();
  const docEl = document.documentElement;
  try {
    if (cur) {
      if (document.exitFullscreen) void document.exitFullscreen();
      else if (document.webkitExitFullscreen) void document.webkitExitFullscreen();
    } else if (docEl.requestFullscreen) {
      void docEl.requestFullscreen();
    } else if (docEl.webkitRequestFullscreen) {
      void docEl.webkitRequestFullscreen();
    }
  } catch {
    /* ignore */
  }
}

/**
 * Subtle “card turning” tick — Web Audio, respects mute
 */
function playCardFlipSound() {
  if (audioMuted) return;
  const ctx = getSfxAudioContext();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const dur = 0.1;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(220, t0);
  osc.frequency.exponentialRampToValueAtTime(520, t0 + dur * 0.85);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.038, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur);
}

function preloadImageUrl(url) {
  if (!url || !String(url).trim()) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
}

/** Preload front/back images for dealt indices; warm card audio cache */
async function preloadDealAssets(cfg, deckIndices) {
  const urls = [];
  for (const idx of deckIndices) {
    urls.push(resolveFront(cfg, idx), resolveBack(cfg, idx));
  }
  const unique = [...new Set(urls.filter(Boolean))];
  await Promise.all(unique.map(preloadImageUrl));
  for (const idx of deckIndices) {
    const u = (cfg.cards[idx]?.soundUrl || "").trim();
    if (u) {
      try {
        const a = new Audio();
        a.preload = "auto";
        a.src = u;
      } catch {
        /* ignore */
      }
    }
  }
}

function idlePreloadRestOfDeck(cfg) {
  const dealt = new Set(dealtDeckIndices);
  const urls = [];
  const n = cfg.deckSize;
  for (let i = 0; i < n; i++) {
    if (dealt.has(i)) continue;
    urls.push(resolveFront(cfg, i), resolveBack(cfg, i));
  }
  const unique = [...new Set(urls.filter(Boolean))];
  const run = () => {
    void Promise.all(unique.map(preloadImageUrl));
  };
  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(run, { timeout: 5000 });
  } else {
    window.setTimeout(run, 400);
  }
}

/**
 * Wait for detail overlay images so flip animation runs with pixels ready
 */
async function waitDetailImagesReady(frontImg, backImg, timeoutMs = 800) {
  const waitOne = (img) => {
    if (!img?.src) return Promise.resolve();
    if (img.complete && img.naturalWidth > 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const done = () => resolve();
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    });
  };

  const decode = (img) => {
    if (!img?.src) return Promise.resolve();
    if (typeof img.decode === "function") {
      return img.decode().catch(() => {});
    }
    return Promise.resolve();
  };

  const race = Promise.race([
    Promise.all([waitOne(frontImg), waitOne(backImg)]).then(() => Promise.all([decode(frontImg), decode(backImg)])),
    new Promise((resolve) => {
      window.setTimeout(resolve, timeoutMs);
    }),
  ]);

  await race;
}

/** Short bandpass noise sweep — feels like a deck shuffle / swoosh */
function playShuffleSwoosh() {
  if (audioMuted) return;
  const ctx = getSfxAudioContext();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const dur = 0.32;
  const bufferSize = Math.floor(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize) ** 0.5;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.7;
  filter.frequency.setValueAtTime(300, t0);
  filter.frequency.exponentialRampToValueAtTime(2800, t0 + dur * 0.55);
  filter.frequency.exponentialRampToValueAtTime(400, t0 + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.14, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(t0);
  noise.stop(t0 + dur);
}

let gridState = { cardCount: 0, maxColumnsFull: 4 };

function fitCardGrid() {
  const grid = gridSection?.querySelector(".card-grid");
  const gridArea = document.querySelector(".selection-grid-area");
  const main = document.querySelector(".selection-main");
  if (!grid || !main) return;

  const { cardCount, maxColumnsFull } = gridState;
  const density = densityForCount(cardCount);
  const iw = window.innerWidth;
  const maxCols = effectiveMaxCols(iw, maxColumnsFull);
  const rows = Math.ceil(cardCount / maxCols);
  const gap = gapPx(iw);

  /** Prefer #grid-section box — matches visible area after fullscreen / flex layout */
  const secRect = gridSection?.getBoundingClientRect();
  let availW = gridArea?.clientWidth ?? main.clientWidth;
  let availH = gridArea?.clientHeight ?? main.clientHeight;
  if (secRect && secRect.width > 30 && secRect.height > 30) {
    availW = secRect.width;
    availH = secRect.height;
  }

  if (availW < 40 || availH < 40) return;

  const cellW = ((availW - (maxCols - 1) * gap) / maxCols) * density;
  const maxCardH = (availH - (rows - 1) * gap) / rows;
  const maxWFromH = maxCardH * CARD_W_PER_H;

  let cardW = Math.min(cellW, maxWFromH);
  cardW = Math.max(44, Math.floor(cardW * 100) / 100);

  grid.style.setProperty("--fit-card-w", `${cardW}px`);
}

let gridResizeObserver = null;

function setupGridFit() {
  const main = document.querySelector(".selection-main");
  const scheduleFit = () => {
    requestAnimationFrame(() => fitCardGrid());
  };

  scheduleFit();
  requestAnimationFrame(() => scheduleFit());
  if (document.fonts?.ready) void document.fonts.ready.then(() => scheduleFit());

  window.addEventListener("resize", scheduleFit);
  window.addEventListener("orientationchange", scheduleFit);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", scheduleFit);
    window.visualViewport.addEventListener("scroll", scheduleFit);
  }

  const observeEl = document.querySelector(".selection-grid-area") || main;
  if (observeEl && typeof ResizeObserver !== "undefined") {
    gridResizeObserver?.disconnect();
    gridResizeObserver = new ResizeObserver(scheduleFit);
    gridResizeObserver.observe(observeEl);
  }
}

function injectFonts(cfg) {
  const f = cfg.fonts || {};
  let id = document.getElementById("flip-font-faces");
  if (!id) {
    id = document.createElement("style");
    id.id = "flip-font-faces";
    document.head.appendChild(id);
  }
  const parts = [];
  if (f.heading) {
    parts.push(`@font-face{font-family:FlipHeading;src:url('${f.heading}') format('woff2'),url('${f.heading}') format('woff'),url('${f.heading}') format('truetype');font-display:swap;}`);
  }
  if (f.body) {
    parts.push(`@font-face{font-family:FlipBody;src:url('${f.body}') format('woff2'),url('${f.body}') format('woff'),url('${f.body}') format('truetype');font-display:swap;}`);
  }
  if (f.button) {
    parts.push(`@font-face{font-family:FlipButton;src:url('${f.button}') format('woff2'),url('${f.button}') format('woff'),url('${f.button}') format('truetype');font-display:swap;}`);
  }
  id.textContent = parts.join("\n");
  document.documentElement.style.setProperty("--flip-font-heading", f.heading ? "FlipHeading, system-ui, sans-serif" : "inherit");
  document.documentElement.style.setProperty("--flip-font-body", f.body ? "FlipBody, system-ui, sans-serif" : "inherit");
  document.documentElement.style.setProperty("--flip-font-button", f.button ? "FlipButton, system-ui, sans-serif" : "inherit");
}

function applyTheme(cfg) {
  document.documentElement.classList.add("flip-cards-root");
  document.body.classList.add("flip-cards-game");

  const hex = cfg.backgroundColor || "#9f2527";
  document.documentElement.style.setProperty("--dada-bg", hex);
  document.documentElement.style.setProperty("--flip-bg-solid", hex);
  const bg = (cfg.backgroundImage || "").trim();
  document.documentElement.style.setProperty("--flip-bg-image", bg ? `url('${bg}')` : "none");

  document.body.dataset.brandCorner = cfg.brandLogoCorner || "bl";

  if (selectionTitleEl) selectionTitleEl.textContent = cfg.selectionHeading || "Tap a card";

  if (brandMarkEl) {
    const logo = (cfg.brandLogoUrl || "").trim();
    if (logo) {
      brandMarkEl.innerHTML = `<img src="${logo}" alt="" />`;
    } else {
      brandMarkEl.textContent = "";
    }
  }

  if (poweredByEl) {
    poweredByEl.hidden = cfg.showPoweredBy === false;
  }

  const sh = cfg.shuffle || {};
  const showShuffle = sh.enabled !== false;
  const showMute = sh.showMuteButton !== false;
  const showFs = sh.showFullscreenButton !== false && fullscreenSupported();
  if (shuffleBar && shuffleBtn) {
    shuffleBar.hidden = !showShuffle && !showMute && !showFs;
    shuffleBtn.hidden = !showShuffle;
    const labelPx = (Number(sh.textSizePx) || Number(sh.buttonFontSizePx) || 16) * CONTROL_SIZE_SCALE;
    const bfs = (Number(sh.buttonFontSizePx) || 15) * CONTROL_SIZE_SCALE;
    if (showShuffle) {
      shuffleBtn.textContent = sh.label || "Shuffle";
      shuffleBtn.style.background = sh.buttonBg || "rgba(255,255,255,0.15)";
      shuffleBtn.style.color = sh.textColor || "#ffffff";
      shuffleBtn.style.fontSize = `${labelPx}px`;
      shuffleBtn.style.padding = "";
    }
    if (muteBtn) {
      muteBtn.hidden = !showMute;
      if (showMute) {
        const bg = sh.buttonBg || "rgba(255,255,255,0.15)";
        const col = sh.textColor || "#ffffff";
        muteBtn.style.background = bg;
        muteBtn.style.color = col;
        muteBtn.style.fontSize = `${Math.max(14, Math.round(bfs * 0.72))}px`;
      }
      updateMuteButtonUi();
    }
    if (fsBtn) {
      fsBtn.hidden = !showFs;
      if (showFs) {
        const bg = sh.buttonBg || "rgba(255,255,255,0.15)";
        const col = sh.textColor || "#ffffff";
        fsBtn.style.background = bg;
        fsBtn.style.color = col;
        fsBtn.style.fontSize = `${Math.max(14, Math.round(bfs * 0.72))}px`;
      }
      updateFullscreenButtonUi();
    }
  }

  injectFonts(cfg);

  if (cfg.title) document.title = cfg.title;

  maybeStartMusic(cfg);
}

function maybeStartMusic(cfg) {
  const url = cfg.sounds?.music;
  if (!url || !url.trim()) return;
  if (!musicEl) {
    musicEl = new Audio();
    musicEl.loop = true;
  }
  musicEl.src = url;
  targetMusicVolume = Math.min(1, Math.max(0, typeof cfg.sounds?.musicVolume === "number" ? cfg.sounds.musicVolume : 0.35));
  applyMusicVolumeFromState();
}

function unlockMusic() {
  if (musicStarted || !musicEl) return;
  musicStarted = true;
  void musicEl.play().catch(() => {});
}

function buildGrid() {
  const cfg = liveConfig;
  if (!cfg || !gridSection) return;

  const n = dealtDeckIndices.length;
  gridState = {
    cardCount: n,
    maxColumnsFull: Math.min(6, Math.max(1, Number(cfg.maxColumns) || 4)),
  };

  const grid = document.createElement("div");
  grid.className = "card-grid";
  grid.style.setProperty("--max-cols-lg", String(gridState.maxColumnsFull));
  grid.style.setProperty("--density", String(densityForCount(n)));
  grid.style.setProperty("--card-count", String(n));

  dealtDeckIndices.forEach((deckIdx, slotIdx) => {
    const front = resolveFront(cfg, deckIdx);
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = "card-slot";
    slot.style.setProperty("--i", String(slotIdx));
    slot.setAttribute("aria-label", `Open card ${slotIdx + 1}`);

    const img = document.createElement("img");
    img.src = front || "";
    img.alt = "";
    img.width = 827;
    img.height = 1417;
    img.decoding = "async";
    img.loading = "eager";
    if (slotIdx === 0) img.setAttribute("fetchpriority", "high");

    const tile = document.createElement("div");
    tile.className = "card-tile";
    tile.appendChild(img);
    slot.appendChild(tile);

    slot.addEventListener("click", () => {
      unlockMusic();
      void getSfxAudioContext();
      void openDetail(slotIdx);
    });
    grid.appendChild(slot);
  });

  gridSection.replaceChildren(grid);
}

function playCardSound(deckIndex) {
  stopCardSound();
  if (audioMuted) return;
  const url = (liveConfig?.cards?.[deckIndex]?.soundUrl || "").trim();
  if (!url) return;
  try {
    const a = new Audio(url);
    cardSoundAudio = a;
    void a.play();
    a.addEventListener(
      "ended",
      () => {
        if (cardSoundAudio === a) cardSoundAudio = null;
      },
      { once: true },
    );
  } catch {
    cardSoundAudio = null;
  }
}

async function openDetail(slotIndex) {
  if (closing || !liveConfig) return;
  const deckIdx = dealtDeckIndices[slotIndex];
  if (deckIdx === undefined) return;
  const card = liveConfig.cards[deckIdx];
  if (!card) return;

  detailFlipInner.style.transform = "";

  detailFrontImg.src = resolveFront(liveConfig, deckIdx);
  detailBackImg.src = resolveBack(liveConfig, deckIdx);
  detailTitle.textContent = card.header || "";
  detailBody.textContent = card.body || "";
  backBtn.textContent = card.overlayButtonText || "Back";

  await waitDetailImagesReady(detailFrontImg, detailBackImg);

  gridSection.classList.add("is-behind");
  detail.classList.add("is-open");
  detail.setAttribute("aria-hidden", "false");

  detailFlip.classList.remove("is-anim-in");
  void detailFlip.offsetWidth;
  detailFlip.classList.add("is-anim-in");

  const prefersReduced =
    typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) {
    detailFlipInner.style.transform = "rotateY(180deg) scale(1)";
  } else {
    playCardFlipSound();
  }

  playCardSound(deckIdx);
  backBtn.focus();
}

function closeDetail() {
  if (!detail?.classList.contains("is-open") || closing) return;
  closing = true;
  stopCardSound();

  detailFlip.classList.remove("is-anim-in");
  detailFlipInner.style.transform = "rotateY(0deg) scale(1)";
  detail.classList.remove("is-open");
  detail.setAttribute("aria-hidden", "true");
  gridSection.classList.remove("is-behind");

  window.setTimeout(() => {
    closing = false;
    detailFlipInner.style.transform = "";
  }, 450);
}

async function dealAndRender() {
  if (!liveConfig) return;
  const n = liveConfig.deckSize;
  const k = liveConfig.cardsDealt;
  dealtDeckIndices = randomDeal(n, k);
  await preloadDealAssets(liveConfig, dealtDeckIndices);
  buildGrid();
  idlePreloadRestOfDeck(liveConfig);
  requestAnimationFrame(() => fitCardGrid());
}

function setupPreviewMode() {
  if (selectionTitleEl) selectionTitleEl.textContent = "Preview";
  window.addEventListener("message", (e) => {
    if (e.origin !== window.location.origin) return;
    if (e.data?.type !== "rngames-flip-cards-config") return;
    const cfg = e.data.config;
    if (!cfg || cfg.gameType !== "flip-cards") return;
    liveConfig = cfg;
    applyTheme(cfg);
    void dealAndRender();
    setupGridFit();
  });
}

async function bootstrap() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("preview") === "1") {
    setupPreviewMode();
    return;
  }

  const slug = params.get("slug")?.trim();
  if (!slug) {
    if (selectionTitleEl) selectionTitleEl.textContent = "Missing game slug.";
    return;
  }

  const res = await fetch(`${API_BASE}/public-wheel?slug=${encodeURIComponent(slug)}`);
  if (!res.ok) {
    if (selectionTitleEl) selectionTitleEl.textContent = "Game not found.";
    return;
  }

  const data = await res.json();
  if (data.gameType !== "flip-cards") {
    if (selectionTitleEl) selectionTitleEl.textContent = "Not a flip card game.";
    return;
  }

  liveConfig = data;
  applyTheme(data);
  await dealAndRender();
  setupGridFit();
}

detailBackdrop?.addEventListener("click", closeDetail);
backBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  closeDetail();
});

document.querySelector(".detail-panel")?.addEventListener("click", (e) => {
  e.stopPropagation();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && detail?.classList.contains("is-open")) {
    closeDetail();
  }
});

const SHUFFLE_ANIM_MS = 480;

muteBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  audioMuted = !audioMuted;
  if (audioMuted) stopCardSound();
  applyMusicVolumeFromState();
  updateMuteButtonUi();
});

fsBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleFullscreen();
});

function onFullscreenLayoutChange() {
  updateFullscreenButtonUi();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => fitCardGrid());
  });
}

document.addEventListener("fullscreenchange", onFullscreenLayoutChange);
document.addEventListener("webkitfullscreenchange", onFullscreenLayoutChange);

shuffleBtn?.addEventListener("click", () => {
  unlockMusic();
  void getSfxAudioContext();

  const prefersReduced =
    typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReduced) {
    void (async () => {
      await dealAndRender();
      requestAnimationFrame(() => fitCardGrid());
    })();
    return;
  }

  const grid = gridSection?.querySelector(".card-grid");
  playShuffleSwoosh();
  if (grid) {
    grid.classList.remove("is-shuffling");
    void grid.offsetWidth;
    grid.classList.add("is-shuffling");
  }
  shuffleBtn.disabled = true;

  window.setTimeout(() => {
    void (async () => {
      await dealAndRender();
      requestAnimationFrame(() => fitCardGrid());
      shuffleBtn.disabled = false;
    })();
  }, SHUFFLE_ANIM_MS);
});

document.body.addEventListener(
  "click",
  () => {
    unlockMusic();
  },
  { once: true },
);

void bootstrap();
