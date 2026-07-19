import {
  emitStepComplete,
  emitStepEngaged,
  isEmbeddedShellActive,
  matchingBreakpoint,
  normalizeMatching,
  pairsDealtForBreakpoint,
  resolveMemoryBack,
  type MatchFace,
  type MatchPair,
  type MatchingRecord,
} from "@rngames/shared";
import { track } from "@rngames/shared/track";
import { submitLinkedScore } from "../leaderboard/api";
import { notifyEndScreenReady } from "../page-module/shared";
import "./matching.css";

type Tile = {
  id: string;
  pairId: string;
  side: "a" | "b";
  face: MatchFace;
  back?: MatchFace;
  matched: boolean;
};

const ICON_FS_ENTER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`;
const ICON_FS_EXIT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V4h4"/><path d="M20 8V4h-4"/><path d="M4 16v4h4"/><path d="M20 16v4h-4"/></svg>`;

const els = {
  app: document.getElementById("match-app")!,
  bg: document.getElementById("match-bg")!,
  top: document.getElementById("match-top")!,
  banner: document.getElementById("match-banner")!,
  logo: document.getElementById("match-logo") as HTMLImageElement,
  hud: document.getElementById("match-hud")!,
  moves: document.getElementById("match-moves")!,
  score: document.getElementById("match-score")!,
  timer: document.getElementById("match-timer")!,
  status: document.getElementById("match-status")!,
  intro: document.getElementById("match-intro")!,
  introHeadline: document.getElementById("match-intro-headline")!,
  introBody: document.getElementById("match-intro-body")!,
  start: document.getElementById("match-start") as HTMLButtonElement,
  board: document.getElementById("match-board")!,
  end: document.getElementById("match-end")!,
  endLogo: document.getElementById("match-end-logo") as HTMLImageElement,
  endHeadline: document.getElementById("match-end-headline")!,
  endSubhead: document.getElementById("match-end-subhead")!,
  endScore: document.getElementById("match-end-score")!,
  endStats: document.getElementById("match-end-stats")!,
  endNameWrap: document.getElementById("match-end-name-wrap")!,
  endName: document.getElementById("match-end-name") as HTMLInputElement,
  again: document.getElementById("match-again") as HTMLButtonElement,
  error: document.getElementById("match-error")!,
  poweredBy: document.getElementById("powered-by-rn")!,
  fullscreenBtn: document.getElementById("match-fullscreen") as HTMLButtonElement,
  fullscreenIcon: document.querySelector(".match-fullscreen__icon") as HTMLElement,
};

let config: MatchingRecord | null = null;
let tiles: Tile[] = [];
let roundPairCount = 0;
let selectedId: string | null = null;
let locked = false;
let moves = 0;
let matchedPairs = 0;
let score = 0;
let startedAt = 0;
let timerId: number | null = null;
let engaged = false;
let dragId: string | null = null;
let finished = false;
let imageAspect = 0.75;
const revealedTemp = new Set<string>();

const isPreview = () => params().get("preview") === "1";
const flowMode = isEmbeddedShellActive();
const flowNextLabel = () => params().get("nextStepLabel")?.trim() || "Continue";

function params() {
  return new URLSearchParams(window.location.search);
}

function slugFromPath(): string {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] === "matching" && parts[1]) return decodeURIComponent(parts[1]);
  return params().get("slug") || "";
}

function nameStorageKey(c: MatchingRecord) {
  return `matching-name:${c.id || c.slug}`;
}

function getPlayerName(): string {
  if (!config) return "Player";
  try {
    return (localStorage.getItem(nameStorageKey(config)) || "").trim() || "Player";
  } catch {
    return "Player";
  }
}

function setPlayerName(name: string) {
  if (!config) return;
  try {
    localStorage.setItem(nameStorageKey(config), name.trim().slice(0, config.highScore.nameMaxLength || 16));
  } catch {
    /* ignore */
  }
}

function pickBg(c: MatchingRecord): string {
  const bp = matchingBreakpoint();
  if (bp === "mobile" && c.backgrounds.mobile) return c.backgrounds.mobile;
  if (bp === "tablet" && c.backgrounds.tablet) return c.backgrounds.tablet;
  return c.backgrounds.desktop || c.backgrounds.tablet || c.backgrounds.mobile || "";
}

function ensureFontFace(role: string, upload?: { url?: string; family?: string }) {
  if (!upload?.url || !upload.family) return;
  const id = `match-font-${role}`;
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `@font-face{font-family:'${upload.family}';src:url('${upload.url}');font-display:swap;}`;
  document.head.appendChild(style);
}

function hudHasContent(c: MatchingRecord): boolean {
  return c.hud.showMoves || (c.gameplay.scoreEnabled && c.hud.showScore) || !!c.gameplay.timerSec;
}

function updateTopVisibility() {
  if (!config) return;
  const playing = els.app.classList.contains("match-app--playing");
  const hasBanner = !els.banner.hidden;
  const hasHud = !els.hud.hidden && hudHasContent(config);
  els.top.hidden = !playing || (!hasBanner && !hasHud);
}

function playSound(url: string | null | undefined) {
  if (!url) return;
  try {
    const audio = new Audio(url);
    void audio.play().catch(() => undefined);
  } catch {
    /* ignore */
  }
}

function getFullscreenElement() {
  return (
    document.fullscreenElement ||
    (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement ||
    null
  );
}

function fullscreenSupported() {
  const el = document.documentElement;
  return !!(el.requestFullscreen || (el as HTMLElement & { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen);
}

function updateFullscreenButtonUi() {
  if (!els.fullscreenBtn || !els.fullscreenIcon) return;
  const active = !!getFullscreenElement();
  const allowed = fullscreenSupported() && !isPreview() && config?.showFullscreenButton !== false;
  els.fullscreenBtn.hidden = !allowed;
  els.fullscreenBtn.setAttribute("aria-pressed", active ? "true" : "false");
  els.fullscreenBtn.setAttribute("aria-label", active ? "Exit fullscreen" : "Enter fullscreen");
  els.fullscreenBtn.title = active ? "Exit fullscreen" : "Fullscreen";
  els.fullscreenIcon.innerHTML = active ? ICON_FS_EXIT : ICON_FS_ENTER;
}

function toggleFullscreen() {
  const cur = getFullscreenElement();
  const docEl = document.documentElement as HTMLElement & {
    requestFullscreen?: () => Promise<void>;
    webkitRequestFullscreen?: () => void;
  };
  try {
    if (cur) {
      if (document.exitFullscreen) void document.exitFullscreen();
      else if ((document as Document & { webkitExitFullscreen?: () => void }).webkitExitFullscreen) {
        void (document as Document & { webkitExitFullscreen?: () => void }).webkitExitFullscreen?.();
      }
    } else if (docEl.requestFullscreen) {
      void docEl.requestFullscreen();
    } else if (docEl.webkitRequestFullscreen) {
      docEl.webkitRequestFullscreen();
    }
  } catch {
    /* ignore */
  }
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

function applyTheme(c: MatchingRecord) {
  applyFavicon(c.faviconUrl);
  const root = document.documentElement;
  ensureFontFace("heading", c.fontUploads.heading);
  ensureFontFace("body", c.fontUploads.body);
  ensureFontFace("hud", c.fontUploads.hud);
  root.style.setProperty("--match-font-heading", c.fonts.heading || "system-ui, sans-serif");
  root.style.setProperty("--match-font-body", c.fonts.body || "system-ui, sans-serif");
  root.style.setProperty("--match-font-hud", c.fonts.hud || c.fonts.body || "system-ui, sans-serif");
  root.style.setProperty("--match-bg-solid", c.backgroundHex || "#0f1a24");
  const bg = pickBg(c);
  root.style.setProperty("--match-bg-image", bg ? `url("${bg}")` : "none");
  els.bg.style.backgroundColor = c.backgroundHex || "#0f1a24";
  els.bg.style.backgroundImage = bg ? `url("${bg}")` : "none";
  root.style.setProperty("--match-gap", `${c.layout.gapPx}px`);
  root.style.setProperty("--match-tile-min", `${c.layout.tileMinPx}px`);
  root.style.setProperty("--match-tile-max", `${c.layout.tileMaxPx}px`);
  root.style.setProperty("--match-image-fit", c.layout.imageFit || "cover");
  root.style.setProperty("--match-pad", c.cardChrome.enabled ? `${c.cardChrome.paddingPx}px` : "0px");
  root.style.setProperty("--match-chrome-bg", c.cardChrome.backgroundHex);
  root.style.setProperty("--match-chrome-border", c.cardChrome.borderHex);
  root.style.setProperty("--match-chrome-radius", `${c.cardChrome.radiusPx}px`);
  root.style.setProperty(
    "--match-chrome-shadow",
    c.cardChrome.enabled && c.cardChrome.shadow ? "0 4px 14px rgba(0,0,0,0.2)" : "none",
  );
  root.style.setProperty("--match-btn-bg", c.endScreen.buttonHex);
  root.style.setProperty("--match-btn-text", c.endScreen.buttonTextHex);
  root.style.setProperty("--match-intro-headline", c.introHeadlineHex);
  root.style.setProperty("--match-intro-body", c.introBodyHex);
  root.style.setProperty("--match-intro-btn", c.introButtonHex);
  root.style.setProperty("--match-intro-btn-text", c.introButtonTextHex);
  root.style.setProperty("--match-end-headline", c.endScreen.headlineHex);
  root.style.setProperty("--match-end-subhead", c.endScreen.subheadHex);
  root.style.setProperty("--match-end-text", c.endScreen.textHex);
  root.style.setProperty("--match-end-overlay", c.endScreen.overlayHex || "rgba(8, 14, 22, 0.88)");
  root.style.setProperty("--match-hud-moves", c.hud.movesHex);
  root.style.setProperty("--match-hud-score", c.hud.scoreHex);
  root.style.setProperty("--match-hud-timer", c.hud.timerHex);
  root.style.setProperty("--match-hud-label", c.hud.labelHex);

  els.top.className = `match-top match-top--${c.logoAlign}`;
  if (c.logoUrl) {
    els.banner.hidden = false;
    els.banner.className = "match-banner";
    els.logo.src = c.logoUrl;
    els.logo.hidden = false;
  } else {
    els.banner.hidden = true;
    els.logo.hidden = true;
  }
  els.poweredBy.hidden = c.showPoweredBy === false;
  updateFullscreenButtonUi();
  updateTopVisibility();
}

function faceContent(face: MatchFace, faceDown: boolean): string {
  if (faceDown) {
    if (face.kind === "image" && face.imageUrl) {
      return `<img class="match-face-img" src="${face.imageUrl}" alt="${escapeAttr(face.alt || "Card back")}" draggable="false" />`;
    }
    if (face.kind === "icon" && face.iconUrl) {
      if (face.iconUrl.startsWith("/") || face.iconUrl.startsWith("http")) {
        return `<img class="match-face-img" src="${face.iconUrl}" alt="" draggable="false" />`;
      }
      return `<span class="match-face-icon" aria-hidden="true">${escapeHtml(face.iconUrl)}</span>`;
    }
    return `<span class="match-face-text">${escapeHtml(face.text || "?")}</span>`;
  }
  if (face.kind === "image" && face.imageUrl) {
    return `<img class="match-face-img" src="${face.imageUrl}" alt="${escapeAttr(face.alt || "")}" draggable="false" />`;
  }
  if (face.kind === "icon" && face.iconUrl) {
    if (face.iconUrl.startsWith("/") || face.iconUrl.startsWith("http")) {
      return `<img class="match-face-img" src="${face.iconUrl}" alt="${escapeAttr(face.alt || "")}" draggable="false" />`;
    }
    return `<span class="match-face-icon">${escapeHtml(face.iconUrl)}</span>`;
  }
  if (face.kind === "audio") {
    return `<span class="match-face-text">🔊 ${escapeHtml(face.alt || face.text || "Play")}</span>`;
  }
  return `<span class="match-face-text">${escapeHtml(face.text || "")}</span>`;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s: string) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dealKey(gameId: string) {
  return `matching-deal-queue:${gameId}`;
}

function loadDealQueue(gameId: string): string[] {
  try {
    const raw = sessionStorage.getItem(dealKey(gameId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function saveDealQueue(gameId: string, queue: string[]) {
  try {
    sessionStorage.setItem(dealKey(gameId), JSON.stringify(queue));
  } catch {
    /* ignore */
  }
}

function clearDealQueue(gameId: string) {
  try {
    sessionStorage.removeItem(dealKey(gameId));
  } catch {
    /* ignore */
  }
}

function dealPairsForRound(c: MatchingRecord): MatchPair[] {
  const deck = c.pairs;
  const n = pairsDealtForBreakpoint(c);
  const byId = new Map(deck.map((p) => [p.id, p]));
  let queue = loadDealQueue(c.id).filter((id) => byId.has(id));

  if (queue.length < n) {
    const inQueue = new Set(queue);
    const refill = shuffle(deck.map((p) => p.id).filter((id) => !inQueue.has(id)));
    queue = [...queue, ...refill];
    if (queue.length < n) queue = shuffle(deck.map((p) => p.id));
  }

  const dealtIds = queue.splice(0, n);
  saveDealQueue(c.id, queue);
  return dealtIds.map((id) => byId.get(id)!).filter(Boolean);
}

/** Nudges a column pairing apart when independent shuffles happen to align a pair on the same row. */
function avoidRowCollisions(colA: Tile[], colB: Tile[]) {
  for (let i = 0; i < colA.length; i++) {
    if (colA[i].pairId !== colB[i].pairId) continue;
    const swapWith = (i + 1) % colB.length;
    if (swapWith === i) break;
    [colB[i], colB[swapWith]] = [colB[swapWith], colB[i]];
  }
}

function buildTiles(c: MatchingRecord, pairs: MatchPair[]): Tile[] {
  const orderedPairs = shuffle(pairs);
  const out: Tile[] = [];
  for (const pair of orderedPairs) {
    const back = c.playMode === "memory" ? resolveMemoryBack(c, pair) : undefined;
    out.push({
      id: `${pair.id}-a`,
      pairId: pair.id,
      side: "a",
      face: pair.faceA,
      back,
      matched: false,
    });
    out.push({
      id: `${pair.id}-b`,
      pairId: pair.id,
      side: "b",
      face: pair.faceB,
      back,
      matched: false,
    });
  }

  if (c.gameplay.globalShuffle) {
    return shuffle(out);
  }

  // Side A left column, Side B right — shuffle each column independently so
  // matching pairs don't land on the same row (side-by-side).
  const colA = shuffle(out.filter((t) => t.side === "a"));
  const colB = shuffle(out.filter((t) => t.side === "b"));
  avoidRowCollisions(colA, colB);
  const interleaved: Tile[] = [];
  for (let i = 0; i < colA.length; i++) {
    interleaved.push(colA[i], colB[i]);
  }
  return interleaved;
}

function colsFor(tileCount: number, c: MatchingRecord): number {
  const bp = matchingBreakpoint();
  if (!c.gameplay.globalShuffle) return 2;
  if (bp === "mobile" || bp === "tablet") return 2;
  if (c.layout.columns !== "auto") return c.layout.columns;
  if (tileCount <= 4) return 2;
  if (tileCount <= 9) return 3;
  if (tileCount <= 16) return 4;
  return 5;
}

function setStatus(msg: string) {
  els.status.textContent = msg;
}

function updateHud() {
  if (!config) return;
  els.moves.hidden = !config.hud.showMoves;
  els.moves.textContent = `Moves: ${moves}`;
  const showScore = config.gameplay.scoreEnabled && config.hud.showScore;
  els.score.hidden = !showScore;
  els.score.textContent = `Score: ${score}`;
  if (config.gameplay.timerSec) {
    const left = Math.max(0, config.gameplay.timerSec - Math.floor((Date.now() - startedAt) / 1000));
    els.timer.hidden = false;
    els.timer.textContent = `Time: ${left}s`;
    if (left <= 0 && !finished) finish(false);
  } else {
    els.timer.hidden = true;
  }
}

function measureImageAspect(url: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const a = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0.75;
      resolve(a);
    };
    img.onerror = () => resolve(0.75);
    img.src = url;
  });
}

async function resolveRoundAspect(pairs: MatchPair[]): Promise<number> {
  const urls: string[] = [];
  for (const p of pairs) {
    for (const face of [p.faceA, p.faceB]) {
      if (face.kind === "image" && face.imageUrl) urls.push(face.imageUrl);
    }
  }
  if (!urls.length) return 0.75;
  const aspects = await Promise.all(urls.slice(0, 8).map(measureImageAspect));
  aspects.sort((a, b) => a - b);
  return aspects[Math.floor(aspects.length / 2)] || 0.75;
}

function fitTileSizes(tileCount: number, cols: number) {
  if (!config) return;
  const rows = Math.max(1, Math.ceil(tileCount / cols));
  const gap = config.layout.gapPx;
  const topH = els.top.hidden ? 0 : els.top.offsetHeight;
  const padX = 20;
  const padY = 16;
  const bp = matchingBreakpoint();
  // Use the full viewport so desktop cards grow with available space.
  const availW = Math.max(160, Math.min(els.app.clientWidth || window.innerWidth, window.innerWidth) - padX);
  const availH = Math.max(
    180,
    window.innerHeight - topH - padY - (isPreview() ? 48 : 12),
  );
  const cellW = Math.floor((availW - gap * (cols - 1)) / cols);
  const cellH = Math.floor((availH - gap * (rows - 1)) / rows);
  const min = config.layout.tileMinPx;
  const aspect = imageAspect > 0.2 ? imageAspect : 0.75;
  // Mobile keeps a soft cap; desktop/tablet fill the cell (legibility first).
  const softMax =
    bp === "mobile"
      ? Math.min(config.layout.tileMaxPx || 720, cellW, Math.round(cellH * aspect))
      : Math.max(cellW, Math.round(cellH * aspect), config.layout.tileMaxPx || 720);

  let tileW = Math.min(cellW, softMax);
  let tileH = Math.round(tileW / aspect);
  if (tileH > cellH) {
    tileH = cellH;
    tileW = Math.round(tileH * aspect);
    if (tileW > cellW) {
      tileW = cellW;
      tileH = Math.round(tileW / aspect);
    }
  }
  tileW = Math.max(min, Math.min(tileW, cellW));
  tileH = Math.max(min, Math.min(tileH, cellH));

  els.board.style.setProperty("--match-tile-w", `${tileW}px`);
  els.board.style.setProperty("--match-tile-h", `${tileH}px`);
  els.board.style.setProperty("--match-board-w", `${cols * tileW + gap * (cols - 1)}px`);
  els.board.classList.toggle("match-board--columns", !config.gameplay.globalShuffle);
}

function renderBoard() {
  if (!config) return;
  const n = tiles.length;
  const cols = colsFor(n, config);
  els.board.style.setProperty("--match-cols", String(cols));
  fitTileSizes(n, cols);
  els.board.innerHTML = "";
  const memory = config.playMode === "memory";

  for (const tile of tiles) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `match-tile${config.cardChrome.enabled ? " match-tile--chrome" : ""}`;
    btn.dataset.tileId = tile.id;
    btn.setAttribute("role", "listitem");
    const faceDown = memory && !tile.matched && selectedId !== tile.id && !isRevealed(tile.id);
    const showFace = !memory || !faceDown || tile.matched;
    const displayFace = showFace ? tile.face : tile.back || tile.face;
    btn.innerHTML = faceContent(displayFace, !showFace && memory);
    btn.setAttribute(
      "aria-label",
      tile.matched ? "Matched" : showFace ? faceLabel(tile.face) : "Hidden card",
    );
    if (tile.matched) btn.classList.add("is-matched");
    if (selectedId === tile.id) btn.classList.add("is-selected");
    if (tile.matched) {
      btn.disabled = true;
    } else {
      wireTile(btn, tile);
    }
    els.board.appendChild(btn);
  }
}

function isRevealed(id: string) {
  return revealedTemp.has(id);
}

function faceLabel(face: MatchFace): string {
  if (face.alt) return face.alt;
  if (face.text) return face.text;
  if (face.kind === "audio") return "Audio";
  return face.kind;
}

function ensureEngaged() {
  if (engaged) return;
  engaged = true;
  emitStepEngaged();
}

function onSelect(tileId: string) {
  if (!config || locked) return;
  const tile = tiles.find((t) => t.id === tileId);
  if (!tile || tile.matched) return;
  ensureEngaged();

  if (config.playMode === "memory") {
    revealedTemp.add(tileId);
  }

  if (!selectedId) {
    selectedId = tileId;
    setStatus("Pick a match");
    renderBoard();
    return;
  }
  if (selectedId === tileId) {
    selectedId = null;
    revealedTemp.clear();
    setStatus("");
    renderBoard();
    return;
  }

  const a = tiles.find((t) => t.id === selectedId)!;
  const b = tile;
  locked = true;
  moves += 1;
  revealedTemp.add(a.id);
  revealedTemp.add(b.id);
  renderBoard();

  if (a.pairId === b.pairId) {
    a.matched = true;
    b.matched = true;
    matchedPairs += 1;
    if (config.gameplay.scoreEnabled) {
      score += config.gameplay.pointsPerMatch;
    }
    updateHud();
    setStatus("Match!");
    playSound(config.sounds.pairMatch);
    track({
      type: "matching.pair_matched",
      gameId: config.id,
      payload: { pairId: a.pairId, playMode: config.playMode, score },
    });
    selectedId = null;
    revealedTemp.clear();
    locked = false;
    renderBoard();
    if (matchedPairs >= roundPairCount) finish(true);
  } else {
    if (config.gameplay.scoreEnabled && config.gameplay.mismatchPenalty) {
      score = Math.max(0, score - config.gameplay.mismatchPenalty);
    }
    updateHud();
    setStatus("Try again");
    window.setTimeout(() => {
      selectedId = null;
      revealedTemp.clear();
      locked = false;
      setStatus("");
      renderBoard();
      if (config?.gameplay.maxAttempts && moves >= config.gameplay.maxAttempts) finish(false);
    }, config.gameplay.mismatchDelayMs);
  }
}

function onKey(e: KeyboardEvent, tileId: string) {
  if (!config?.gameplay.inputModes.includes("keyboard")) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    onSelect(tileId);
  }
  if (e.key === "Escape") {
    selectedId = null;
    revealedTemp.clear();
    renderBoard();
  }
}

function selectFromTo(fromId: string, toId: string) {
  selectedId = fromId;
  onSelect(toId);
}

function wireTile(btn: HTMLButtonElement, tile: Tile) {
  btn.addEventListener("click", (e) => {
    if (btn.dataset.suppressClick === "1") {
      delete btn.dataset.suppressClick;
      e.preventDefault();
      return;
    }
    onSelect(tile.id);
  });
  btn.addEventListener("keydown", (e) => onKey(e, tile.id));

  if (!config?.gameplay.inputModes.includes("drag")) return;
  wireDragAndDrop(btn, tile);
}

/**
 * Mobile-first drag: pointer capture drives a manual drag/tap detection so
 * touch input doesn't need to rely on (largely absent) HTML5 drag-and-drop.
 * Native HTML5 DnD is kept as an additive path for desktop mouse users.
 */
function wireDragAndDrop(btn: HTMLButtonElement, tile: Tile) {
  btn.draggable = true;
  btn.addEventListener("dragstart", (e) => {
    if (locked) {
      e.preventDefault();
      return;
    }
    dragId = tile.id;
    btn.classList.add("is-dragging");
    e.dataTransfer?.setData("text/plain", tile.id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  });
  btn.addEventListener("dragend", () => {
    dragId = null;
    btn.classList.remove("is-dragging");
    document.querySelectorAll(".is-drop-target").forEach((el) => el.classList.remove("is-drop-target"));
  });
  btn.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (dragId && dragId !== tile.id) btn.classList.add("is-drop-target");
  });
  btn.addEventListener("dragleave", () => btn.classList.remove("is-drop-target"));
  btn.addEventListener("drop", (e) => {
    e.preventDefault();
    btn.classList.remove("is-drop-target");
    const from = e.dataTransfer?.getData("text/plain") || dragId;
    if (!from || from === tile.id) return;
    selectFromTo(from, tile.id);
  });

  let start: { x: number; y: number } | null = null;
  let isDragging = false;

  btn.addEventListener("pointerdown", (e) => {
    if (locked) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY };
    isDragging = false;
    dragId = tile.id;
    try {
      btn.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });

  btn.addEventListener("pointermove", (e) => {
    if (!start || dragId !== tile.id) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!isDragging && Math.hypot(dx, dy) > 10) {
      isDragging = true;
      btn.classList.add("is-dragging");
    }
  });

  btn.addEventListener("pointerup", (e) => {
    if (dragId !== tile.id) return;
    const wasDragging = isDragging;
    btn.classList.remove("is-dragging");
    start = null;
    isDragging = false;
    dragId = null;
    // Suppress the synthetic click that follows pointerup so tap/drag
    // handling here is the single source of truth for selection.
    btn.dataset.suppressClick = "1";
    if (wasDragging) {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const target = el?.closest<HTMLElement>(".match-tile");
      const toId = target?.dataset.tileId;
      if (toId && toId !== tile.id) selectFromTo(tile.id, toId);
    } else {
      onSelect(tile.id);
    }
  });

  btn.addEventListener("pointercancel", () => {
    if (dragId === tile.id) dragId = null;
    start = null;
    isDragging = false;
    btn.classList.remove("is-dragging");
  });
}

async function submitToLeaderboard() {
  if (!config?.linkedLeaderboardSlug || !config.gameplay.scoreEnabled) return;
  const name =
    config.highScore.enabled !== false
      ? (els.endName.value.trim() || getPlayerName())
      : "Player";
  if (name && name !== "Player") setPlayerName(name);
  try {
    await submitLinkedScore({
      leaderboardSlug: config.linkedLeaderboardSlug,
      sourceGameId: config.id,
      displayName: name,
      score,
      externalId: `matching:${config.id}:${name}`,
    });
  } catch {
    /* optional */
  }
}

function stepOutcomes(): Record<string, unknown> {
  return {
    completed: true,
    "matching.matchedPairs": matchedPairs,
    "matching.moves": moves,
    "matching.playMode": config?.playMode || "match",
    "matching.score": score,
  };
}

function finish(won: boolean) {
  if (finished || !config) return;
  finished = true;
  locked = true;
  if (timerId) {
    window.clearInterval(timerId);
    timerId = null;
  }
  els.app.classList.remove("match-app--playing");
  els.app.classList.add("match-app--end");
  els.hud.hidden = true;
  updateTopVisibility();
  // The end overlay sits above the board (see .match-overlay--end); the
  // board itself stays mounted rather than being hidden.
  els.end.hidden = false;
  els.endHeadline.textContent = won ? config.endScreen.headline : "Time's up";
  els.endSubhead.textContent = won ? config.endScreen.subhead : "You can try again.";
  els.endStats.textContent = `${matchedPairs} pairs · ${moves} moves`;
  if (config.gameplay.scoreEnabled) {
    els.endScore.hidden = false;
    els.endScore.textContent = `${config.endScreen.scorePrefix || "Score:"} ${score}`;
  } else {
    els.endScore.hidden = true;
  }
  if (config.endScreen.logoUrl) {
    els.endLogo.src = config.endScreen.logoUrl;
    els.endLogo.hidden = false;
  } else {
    els.endLogo.hidden = true;
  }
  els.again.textContent = flowMode ? flowNextLabel() : config.endScreen.playAgainLabel;
  const needsName =
    !!config.linkedLeaderboardSlug &&
    config.gameplay.scoreEnabled &&
    config.highScore.enabled !== false;
  els.endNameWrap.hidden = !needsName;
  if (needsName) {
    els.endName.maxLength = config.highScore.nameMaxLength || 16;
    els.endName.value = getPlayerName() === "Player" ? "" : getPlayerName();
  }
  playSound(config.sounds.roundComplete);
  void submitToLeaderboard();
  track({
    type: "matching.round_end",
    gameId: config.id,
    payload: {
      playMode: config.playMode,
      completed: won,
      matchedPairs,
      moves,
      score,
      pairsDealt: roundPairCount,
    },
  });
  // In flow/course, wait for the Continue button (like catch/runner) so the end
  // overlay is visible and the shell can override chrome. Standalone has no step bridge.
  notifyEndScreenReady();
}

async function startRound() {
  if (!config) return;
  const dealt = dealPairsForRound(config);
  roundPairCount = dealt.length;
  imageAspect = await resolveRoundAspect(dealt);
  tiles = buildTiles(config, dealt);
  selectedId = null;
  locked = false;
  moves = 0;
  matchedPairs = 0;
  score = 0;
  finished = false;
  startedAt = Date.now();
  revealedTemp.clear();
  els.app.classList.remove("match-app--intro", "match-app--end");
  els.app.classList.add("match-app--playing");
  els.intro.hidden = true;
  els.end.hidden = true;
  els.board.hidden = false;
  els.hud.hidden = false;
  updateTopVisibility();
  updateHud();
  setStatus("");
  renderBoard();
  track({
    type: "matching.round_start",
    gameId: config.id,
    payload: {
      playMode: config.playMode,
      pairCount: roundPairCount,
      deckSize: config.pairs.length,
      breakpoint: matchingBreakpoint(),
    },
  });
  if (timerId) window.clearInterval(timerId);
  if (config.gameplay.timerSec) {
    timerId = window.setInterval(updateHud, 500);
  }
}

function showIntro(c: MatchingRecord) {
  applyTheme(c);
  els.app.classList.remove("match-app--playing", "match-app--end");
  els.app.classList.add("match-app--intro");
  els.introHeadline.textContent = c.introHeadline;
  els.introBody.textContent = c.introBody;
  els.start.textContent = c.startLabel;
  els.start.style.background = c.introButtonHex;
  els.start.style.color = c.introButtonTextHex;
  els.intro.hidden = false;
  els.board.hidden = true;
  els.end.hidden = true;
  els.hud.hidden = true;
  updateTopVisibility();
  els.app.hidden = false;
  els.error.hidden = true;
}

function applyConfig(next: MatchingRecord, opts?: { resetDeal?: boolean }) {
  if (timerId) {
    window.clearInterval(timerId);
    timerId = null;
  }
  config = next;
  document.title = config.title || "Matching game";
  if (opts?.resetDeal) clearDealQueue(config.id);
  engaged = false;
  finished = false;
  selectedId = null;
  locked = false;
  revealedTemp.clear();
  showIntro(config);
}

async function fetchPublicConfig(): Promise<MatchingRecord> {
  const slug = slugFromPath();
  if (!slug) throw new Error("Missing slug");
  const res = await fetch(`/api/public-wheel?slug=${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error("Could not load matching game");
  const data = await res.json();
  if (data.gameType !== "matching") throw new Error("Not a matching game");
  return normalizeMatching(data);
}

els.start.addEventListener("click", () => void startRound());
els.again.addEventListener("click", () => {
  if (els.endName.value.trim()) setPlayerName(els.endName.value);
  if (flowMode) {
    emitStepComplete(stepOutcomes());
    return;
  }
  void startRound();
});
els.endName.addEventListener("change", () => {
  if (els.endName.value.trim()) setPlayerName(els.endName.value);
});
els.fullscreenBtn.addEventListener("click", () => toggleFullscreen());
document.addEventListener("fullscreenchange", updateFullscreenButtonUi);
document.addEventListener("webkitfullscreenchange", updateFullscreenButtonUi);

window.addEventListener("resize", () => {
  if (!config || els.board.hidden) return;
  const cols = colsFor(tiles.length, config);
  fitTileSizes(tiles.length, cols);
});

updateFullscreenButtonUi();

void (async () => {
  try {
    if (isPreview()) {
      window.addEventListener("message", (ev) => {
        if (ev.origin !== window.location.origin) return;
        if (ev.data?.type !== "rngames-matching-config" || !ev.data.config) return;
        applyConfig(normalizeMatching(ev.data.config), { resetDeal: true });
      });
      window.parent?.postMessage({ type: "rngames-matching-preview-ready" }, window.location.origin);
      return;
    }
    applyConfig(await fetchPublicConfig());
  } catch (e) {
    els.error.hidden = false;
    els.error.textContent = e instanceof Error ? e.message : "Failed to load";
  }
})();
