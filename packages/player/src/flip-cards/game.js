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

let closing = false;
let musicEl = null;
let musicStarted = false;

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

  const availW = gridArea?.clientWidth ?? main.clientWidth;
  const availH = gridArea?.clientHeight ?? main.clientHeight;

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
  if (shuffleBar && shuffleBtn) {
    const show = sh.enabled !== false;
    shuffleBar.hidden = !show;
    if (show) {
      shuffleBtn.textContent = sh.label || "Shuffle";
      shuffleBtn.style.background = sh.buttonBg || "rgba(255,255,255,0.15)";
      shuffleBtn.style.color = sh.textColor || "#ffffff";
      shuffleBtn.style.fontSize = `${Number(sh.textSizePx) || Number(sh.buttonFontSizePx) || 16}px`;
      shuffleBtn.style.padding = `${Math.max(6, (Number(sh.buttonFontSizePx) || 15) * 0.4)}px ${Math.max(12, (Number(sh.buttonFontSizePx) || 15) * 0.9)}px`;
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
  musicEl.volume = Math.min(1, Math.max(0, typeof cfg.sounds?.musicVolume === "number" ? cfg.sounds.musicVolume : 0.35));
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

    slot.innerHTML = `
      <div class="card-tile">
        <img src="${front || ""}" alt="" width="827" height="1417" decoding="async" />
      </div>
    `;

    slot.addEventListener("click", () => {
      unlockMusic();
      openDetail(slotIdx);
    });
    grid.appendChild(slot);
  });

  gridSection.replaceChildren(grid);
}

function playCardSound(deckIndex) {
  const url = (liveConfig?.cards?.[deckIndex]?.soundUrl || "").trim();
  if (!url) return;
  try {
    const a = new Audio(url);
    void a.play();
  } catch {
    /* ignore */
  }
}

function openDetail(slotIndex) {
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
  }

  playCardSound(deckIdx);
  backBtn.focus();
}

function closeDetail() {
  if (!detail?.classList.contains("is-open") || closing) return;
  closing = true;

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

function dealAndRender() {
  if (!liveConfig) return;
  const n = liveConfig.deckSize;
  const k = liveConfig.cardsDealt;
  dealtDeckIndices = randomDeal(n, k);
  buildGrid();
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
    dealAndRender();
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
  dealAndRender();
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

shuffleBtn?.addEventListener("click", () => {
  unlockMusic();
  dealAndRender();
});

document.body.addEventListener(
  "click",
  () => {
    unlockMusic();
  },
  { once: true },
);

void bootstrap();
