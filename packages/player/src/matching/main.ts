import {
  normalizeMatching,
  resolveMemoryBack,
  type MatchFace,
  type MatchPair,
  type MatchingRecord,
} from "@rngames/shared";
import { track } from "@rngames/shared/track";
import { emitStepComplete, emitStepEngaged, isEmbeddedShellActive } from "@rngames/shared";
import "./matching.css";

type Tile = {
  id: string;
  pairId: string;
  face: MatchFace;
  back?: MatchFace;
  matched: boolean;
};

const els = {
  app: document.getElementById("match-app")!,
  bg: document.getElementById("match-bg")!,
  banner: document.getElementById("match-banner")!,
  logo: document.getElementById("match-logo") as HTMLImageElement,
  hud: document.getElementById("match-hud")!,
  moves: document.getElementById("match-moves")!,
  timer: document.getElementById("match-timer")!,
  status: document.getElementById("match-status")!,
  intro: document.getElementById("match-intro")!,
  introHeadline: document.getElementById("match-intro-headline")!,
  introBody: document.getElementById("match-intro-body")!,
  start: document.getElementById("match-start") as HTMLButtonElement,
  board: document.getElementById("match-board")!,
  end: document.getElementById("match-end")!,
  endHeadline: document.getElementById("match-end-headline")!,
  endSubhead: document.getElementById("match-end-subhead")!,
  endStats: document.getElementById("match-end-stats")!,
  again: document.getElementById("match-again") as HTMLButtonElement,
  flowContinue: document.getElementById("match-flow-continue") as HTMLButtonElement,
  error: document.getElementById("match-error")!,
  poweredBy: document.getElementById("powered-by-rn")!,
};

let config: MatchingRecord | null = null;
let tiles: Tile[] = [];
let roundPairCount = 0;
let selectedId: string | null = null;
let locked = false;
let moves = 0;
let matchedPairs = 0;
let startedAt = 0;
let timerId: number | null = null;
let engaged = false;
let dragId: string | null = null;
let finished = false;
const revealedTemp = new Set<string>();
const isPreview = () => params().get("preview") === "1";

function params() {
  return new URLSearchParams(window.location.search);
}

function slugFromPath(): string {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] === "matching" && parts[1]) return decodeURIComponent(parts[1]);
  return params().get("slug") || "";
}

function pickBg(c: MatchingRecord): string {
  const w = window.innerWidth;
  if (w < 768 && c.backgrounds.mobile) return c.backgrounds.mobile;
  if (w < 1024 && c.backgrounds.tablet) return c.backgrounds.tablet;
  return c.backgrounds.desktop || "";
}

function applyTheme(c: MatchingRecord) {
  const root = document.documentElement;
  root.style.setProperty("--match-bg-solid", c.backgroundHex || "#0f1a24");
  const bg = pickBg(c);
  root.style.setProperty("--match-bg-image", bg ? `url("${bg}")` : "none");
  els.bg.style.backgroundColor = c.backgroundHex || "#0f1a24";
  els.bg.style.backgroundImage = bg ? `url("${bg}")` : "none";
  root.style.setProperty("--match-gap", `${c.layout.gapPx}px`);
  root.style.setProperty("--match-tile-min", `${c.layout.tileMinPx}px`);
  root.style.setProperty("--match-tile-max", `${c.layout.tileMaxPx}px`);
  root.style.setProperty("--match-pad", c.cardChrome.enabled ? `${c.cardChrome.paddingPx}px` : "4px");
  root.style.setProperty("--match-chrome-bg", c.cardChrome.backgroundHex);
  root.style.setProperty("--match-chrome-border", c.cardChrome.borderHex);
  root.style.setProperty("--match-chrome-radius", `${c.cardChrome.radiusPx}px`);
  root.style.setProperty(
    "--match-chrome-shadow",
    c.cardChrome.enabled && c.cardChrome.shadow ? "0 4px 14px rgba(0,0,0,0.2)" : "none",
  );
  root.style.setProperty("--match-btn-bg", c.endScreen.buttonHex);
  root.style.setProperty("--match-btn-text", c.endScreen.buttonTextHex);

  if (c.logoUrl) {
    els.banner.hidden = false;
    els.banner.className = `match-banner match-banner--${c.logoAlign}`;
    els.logo.src = c.logoUrl;
    els.logo.hidden = false;
  } else {
    els.banner.hidden = true;
  }
  els.poweredBy.hidden = c.showPoweredBy === false;
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

/** Draw the next round of pairs without repeating until the full deck has been dealt. */
function dealPairsForRound(c: MatchingRecord): MatchPair[] {
  const deck = c.pairs;
  const n = Math.max(1, Math.min(c.gameplay.pairsDealt, deck.length));
  const byId = new Map(deck.map((p) => [p.id, p]));
  let queue = loadDealQueue(c.id).filter((id) => byId.has(id));

  if (queue.length < n) {
    const inQueue = new Set(queue);
    const refill = shuffle(deck.map((p) => p.id).filter((id) => !inQueue.has(id)));
    queue = [...queue, ...refill];
    if (queue.length < n) {
      // Deck smaller than deal size shouldn't happen after clamp; refill from all.
      queue = shuffle(deck.map((p) => p.id));
    }
  }

  const dealtIds = queue.splice(0, n);
  saveDealQueue(c.id, queue);
  return dealtIds.map((id) => byId.get(id)!).filter(Boolean);
}

function buildTiles(c: MatchingRecord, pairs: MatchPair[]): Tile[] {
  const out: Tile[] = [];
  for (const pair of pairs) {
    const back = c.playMode === "memory" ? resolveMemoryBack(c, pair) : undefined;
    out.push({
      id: `${pair.id}-a`,
      pairId: pair.id,
      face: pair.faceA,
      back,
      matched: false,
    });
    out.push({
      id: `${pair.id}-b`,
      pairId: pair.id,
      face: pair.faceB,
      back,
      matched: false,
    });
  }
  return c.gameplay.shuffle ? shuffle(out) : out;
}

function colsFor(count: number, configured: number | "auto"): number {
  if (configured !== "auto") return configured;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  if (count <= 16) return 4;
  if (count <= 25) return 5;
  return 6;
}

function setStatus(msg: string) {
  els.status.textContent = msg;
}

function updateHud() {
  els.moves.textContent = `Moves: ${moves}`;
  if (config?.gameplay.timerSec) {
    const left = Math.max(0, config.gameplay.timerSec - Math.floor((Date.now() - startedAt) / 1000));
    els.timer.hidden = false;
    els.timer.textContent = `Time: ${left}s`;
    if (left <= 0 && !finished) finish(false);
  }
}

function fitTileSizes(tileCount: number, cols: number) {
  if (!config) return;
  const rows = Math.max(1, Math.ceil(tileCount / cols));
  const gap = config.layout.gapPx;
  const hudH = els.hud.hidden ? 0 : els.hud.getBoundingClientRect().height;
  const bannerH = els.banner.hidden ? 0 : els.banner.getBoundingClientRect().height;
  const pad = 32;
  const availW = Math.max(160, els.app.clientWidth - pad);
  const availH = Math.max(
    180,
    window.innerHeight - hudH - bannerH - pad - (isPreview() ? 24 : 48),
  );
  const cellW = Math.floor((availW - gap * (cols - 1)) / cols);
  const cellH = Math.floor((availH - gap * (rows - 1)) / rows);
  const max = config.layout.tileMaxPx;
  const min = config.layout.tileMinPx;
  // Prefer filling the viewport; allow wide cards for text-heavy art.
  let tileW = Math.min(cellW, max);
  let tileH = Math.min(cellH, max);
  tileW = Math.max(min, tileW);
  tileH = Math.max(min, Math.min(tileH, Math.round(tileW * 1.35)));
  // If height is the tighter constraint, scale width down to keep readable aspect.
  if (tileH < tileW * 0.75) {
    tileW = Math.max(min, Math.round(tileH / 0.75));
  }
  els.board.style.setProperty("--match-tile-w", `${tileW}px`);
  els.board.style.setProperty("--match-tile-h", `${tileH}px`);
  els.board.style.setProperty(
    "--match-board-w",
    `${cols * tileW + gap * (cols - 1)}px`,
  );
}

function renderBoard() {
  if (!config) return;
  const n = tiles.length;
  const cols = colsFor(n, config.layout.columns);
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
      btn.addEventListener("click", () => onSelect(tile.id));
      btn.addEventListener("keydown", (e) => onKey(e, tile.id));
      if (config.gameplay.inputModes.includes("drag")) {
        wireDrag(btn, tile.id);
      }
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
  updateHud();
  revealedTemp.add(a.id);
  revealedTemp.add(b.id);
  renderBoard();

  if (a.pairId === b.pairId) {
    a.matched = true;
    b.matched = true;
    matchedPairs += 1;
    setStatus("Match!");
    track({
      type: "matching.pair_matched",
      gameId: config.id,
      payload: { pairId: a.pairId, playMode: config.playMode },
    });
    selectedId = null;
    revealedTemp.clear();
    locked = false;
    renderBoard();
    if (matchedPairs >= roundPairCount) finish(true);
  } else {
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

function wireDrag(btn: HTMLButtonElement, tileId: string) {
  btn.draggable = true;
  btn.addEventListener("dragstart", (e) => {
    if (locked) {
      e.preventDefault();
      return;
    }
    dragId = tileId;
    btn.classList.add("is-dragging");
    e.dataTransfer?.setData("text/plain", tileId);
    e.dataTransfer!.effectAllowed = "move";
  });
  btn.addEventListener("dragend", () => {
    dragId = null;
    btn.classList.remove("is-dragging");
    document.querySelectorAll(".is-drop-target").forEach((el) => el.classList.remove("is-drop-target"));
  });
  btn.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (dragId && dragId !== tileId) btn.classList.add("is-drop-target");
  });
  btn.addEventListener("dragleave", () => btn.classList.remove("is-drop-target"));
  btn.addEventListener("drop", (e) => {
    e.preventDefault();
    btn.classList.remove("is-drop-target");
    const from = e.dataTransfer?.getData("text/plain") || dragId;
    if (!from || from === tileId) return;
    selectedId = from;
    onSelect(tileId);
  });

  let pointing = false;
  btn.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointing = true;
    dragId = tileId;
    btn.setPointerCapture(e.pointerId);
  });
  btn.addEventListener("pointerup", (e) => {
    if (!pointing) return;
    pointing = false;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const target = el?.closest(".match-tile") as HTMLElement | null;
    const toId = target?.dataset.tileId;
    if (dragId && toId && dragId !== toId) {
      selectedId = dragId;
      onSelect(toId);
    }
    dragId = null;
  });
}

function finish(won: boolean) {
  if (finished) return;
  finished = true;
  if (timerId) {
    window.clearInterval(timerId);
    timerId = null;
  }
  if (!config) return;
  els.board.hidden = true;
  els.hud.hidden = true;
  els.end.hidden = false;
  els.endHeadline.textContent = won ? config.endScreen.headline : "Time's up";
  els.endSubhead.textContent = won ? config.endScreen.subhead : "You can try again.";
  els.endStats.textContent = `${matchedPairs} pairs · ${moves} moves`;
  els.again.textContent = config.endScreen.playAgainLabel;
  const embedded = isEmbeddedShellActive();
  els.flowContinue.hidden = !embedded;
  if (embedded) {
    els.flowContinue.textContent = params().get("nextStepLabel") || "Continue";
  }
  track({
    type: "matching.round_end",
    gameId: config.id,
    payload: {
      playMode: config.playMode,
      completed: won,
      matchedPairs,
      moves,
      pairsDealt: roundPairCount,
    },
  });
  if (won) {
    emitStepComplete({
      completed: true,
      "matching.matchedPairs": matchedPairs,
      "matching.moves": moves,
      "matching.playMode": config.playMode,
    });
  }
}

function startRound() {
  if (!config) return;
  const dealt = dealPairsForRound(config);
  roundPairCount = dealt.length;
  tiles = buildTiles(config, dealt);
  selectedId = null;
  locked = false;
  moves = 0;
  matchedPairs = 0;
  finished = false;
  startedAt = Date.now();
  revealedTemp.clear();
  els.intro.hidden = true;
  els.end.hidden = true;
  els.board.hidden = false;
  els.hud.hidden = false;
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
    },
  });
  if (timerId) window.clearInterval(timerId);
  if (config.gameplay.timerSec) {
    timerId = window.setInterval(updateHud, 500);
  }
}

function showIntro(c: MatchingRecord) {
  applyTheme(c);
  els.introHeadline.textContent = c.introHeadline;
  els.introBody.textContent = c.introBody;
  els.start.textContent = c.startLabel;
  els.intro.hidden = false;
  els.board.hidden = true;
  els.end.hidden = true;
  els.hud.hidden = true;
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

els.start.addEventListener("click", () => startRound());
els.again.addEventListener("click", () => startRound());
els.flowContinue.addEventListener("click", () => {
  emitStepComplete({
    completed: true,
    "matching.matchedPairs": matchedPairs,
    "matching.moves": moves,
    "matching.playMode": config?.playMode || "match",
  });
});

window.addEventListener("resize", () => {
  if (!config || els.board.hidden) return;
  const cols = colsFor(tiles.length, config.layout.columns);
  fitTileSizes(tiles.length, cols);
});

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
