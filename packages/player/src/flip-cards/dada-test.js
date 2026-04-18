/**
 * DADÁ Wines flip-card test
 *
 * Grid: `GRID` below (full game: editor / API).
 * Optional URL params: ?cards=1–15 &cols=1–6 — e.g. ?cards=12&cols=4
 * Logo: ?logo=tl|tr|bl|br
 */
const BASE = `${import.meta.env.BASE || "/play/"}flip-cards-test/dada-wines/`;

const FRONT = `${BASE}Card_Front.png`;
/** 8 physical back assets — indices 1..8 cycle when cardCount > 8 */
const BACK_COUNT = 8;
const backUrl = (i) => `${BASE}Card_Back_${(i % BACK_COUNT) + 1}.png`;

/** Default grid: 7 cards, max 4 columns at full width (responsive caps below that). */
const GRID_DEFAULT = {
  cardCount: 7,
  maxColumnsFull: 4,
};

/** Per-card title + body — full game: editor / API (support up to 15 cards). */
const CARD_COPY = [
  {
    title: "Your pour awaits",
    body: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. A bold red with notes of dark fruit — perfect for your next celebration.",
  },
  {
    title: "A vintage twist",
    body: "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. This bottle pairs beautifully with good company and late evenings.",
  },
  {
    title: "Fortune favours the curious",
    body: "Ut enim ad minim veniam, quis nostrud exercitation. Try something new tonight — the cards suggest a surprising match.",
  },
  {
    title: "The cellar whispers",
    body: "Duis aute irure dolor in reprehenderit in voluptate velit. Earthy, structured, and quietly confident.",
  },
  {
    title: "Sunset in a glass",
    body: "Excepteur sint occaecat cupidatat non proident. Light the candles and pour slowly; this moment is yours.",
  },
  {
    title: "Bold moves only",
    body: "Nemo enim ipsam voluptatem quia voluptas sit aspernatur. The reading says: choose the bottle that scares you a little.",
  },
  {
    title: "Last pour, best pour",
    body: "At vero eos et accusamus et iusto odio dignissimos. Finish strong — and save a sip for tomorrow’s story.",
  },
  {
    title: "Eighth revelation",
    body: "Placeholder copy for the eighth card. In production, each card’s header and body come from the editor.",
  },
  {
    title: "The ninth gate",
    body: "Add more cards to the deck — the grid scales density so up to fifteen cards stay comfortable on screen.",
  },
  {
    title: "Tenth chapter",
    body: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pairings, tasting notes, or campaign copy can live here.",
  },
  {
    title: "Eleventh hour",
    body: "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium.",
  },
  {
    title: "Twelfth night",
    body: "Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni.",
  },
  {
    title: "Thirteen tales",
    body: "At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque.",
  },
  {
    title: "Fourteen floors",
    body: "Et harum quidem rerum facilis est et expedita distinctio. Nam libero tempore, cum soluta nobis est eligendi.",
  },
  {
    title: "Fifteenth vision",
    body: "Omnis voluptas assumenda est, omnis dolor repellendus. Temporibus autem quibusdam et aut officiis debitis aut rerum.",
  },
];

const CORNERS = new Set(["tl", "tr", "bl", "br"]);

function applyLogoCornerFromQuery() {
  const q = new URLSearchParams(window.location.search).get("logo");
  if (q && CORNERS.has(q)) {
    document.body.dataset.brandCorner = q;
  }
}

function readGridOptions() {
  const p = new URLSearchParams(window.location.search);
  let cardCount = GRID_DEFAULT.cardCount;
  let maxColumnsFull = GRID_DEFAULT.maxColumnsFull;
  const n = p.get("cards");
  const c = p.get("cols");
  if (n) {
    const v = Number.parseInt(n, 10);
    if (Number.isFinite(v) && v >= 1 && v <= 15) cardCount = v;
  }
  if (c) {
    const v = Number.parseInt(c, 10);
    if (Number.isFinite(v) && v >= 1 && v <= 6) maxColumnsFull = v;
  }
  return { cardCount, maxColumnsFull };
}

/**
 * Slightly shrink each card when many are shown (1–15), so the grid stays balanced.
 * @param {number} count
 */
function densityForCount(count) {
  if (count <= 7) return 1;
  return Math.max(0.72, 1 - (count - 7) * 0.028);
}

/** Card width : height (827×1417 assets) */
const CARD_W_PER_H = 827 / 1417;

function gapPx(innerWidth) {
  return Math.min(22, Math.max(10, innerWidth * 0.022));
}

/** Match dada-test.css breakpoints for --max-cols */
function effectiveMaxCols(innerWidth, maxColsLg) {
  let cap = maxColsLg;
  if (innerWidth <= 360) cap = Math.min(cap, 2);
  else if (innerWidth <= 900) cap = Math.min(cap, 3);
  return Math.max(1, cap);
}

/**
 * Size cards so the full grid fits in `.selection-main` (no page scroll).
 */
function fitCardGrid() {
  const grid = gridSection.querySelector(".card-grid");
  const main = document.querySelector(".selection-main");
  if (!grid || !main) return;

  const { cardCount, maxColumnsFull } = gridState;
  const density = densityForCount(cardCount);
  const iw = window.innerWidth;
  const maxCols = effectiveMaxCols(iw, maxColumnsFull);
  const rows = Math.ceil(cardCount / maxCols);
  const gap = gapPx(iw);

  const availW = main.clientWidth;
  const availH = main.clientHeight;

  if (availW < 40 || availH < 40) return;

  const cellW = ((availW - (maxCols - 1) * gap) / maxCols) * density;
  const maxCardH = (availH - (rows - 1) * gap) / rows;
  const maxWFromH = maxCardH * CARD_W_PER_H;

  let cardW = Math.min(cellW, maxWFromH);
  cardW = Math.max(44, Math.floor(cardW * 100) / 100);

  grid.style.setProperty("--fit-card-w", `${cardW}px`);
}

/** @type {ResizeObserver | null} */
let gridResizeObserver = null;

function setupGridFit() {
  const main = document.querySelector(".selection-main");
  const scheduleFit = () => {
    requestAnimationFrame(() => fitCardGrid());
  };

  scheduleFit();
  requestAnimationFrame(() => scheduleFit());
  if (typeof document !== "undefined" && document.fonts?.ready) {
    void document.fonts.ready.then(() => scheduleFit());
  }

  window.addEventListener("resize", scheduleFit);
  window.addEventListener("orientationchange", scheduleFit);

  if (main && typeof ResizeObserver !== "undefined") {
    gridResizeObserver?.disconnect();
    gridResizeObserver = new ResizeObserver(scheduleFit);
    gridResizeObserver.observe(main);
  }
}

const gridSection = document.getElementById("grid-section");
const detail = document.getElementById("detail");
const detailBackdrop = document.querySelector(".detail-backdrop");
const detailFlip = document.querySelector(".detail-flip");
const detailFlipInner = document.querySelector(".detail-flip-inner");
const detailFrontImg = document.querySelector(".detail-face--front img");
const detailBackImg = document.querySelector(".detail-face--back img");
const detailTitle = document.getElementById("detail-title");
const detailBody = document.getElementById("detail-body");
const backBtn = document.querySelector(".back-btn");

let closing = false;

let gridState = { cardCount: 7, maxColumnsFull: 4 };

function buildGrid() {
  gridState = readGridOptions();
  const { cardCount, maxColumnsFull } = gridState;
  const density = densityForCount(cardCount);

  const grid = document.createElement("div");
  grid.className = "card-grid";
  grid.dataset.cardCount = String(cardCount);
  grid.style.setProperty("--max-cols-lg", String(maxColumnsFull));
  grid.style.setProperty("--density", String(density));
  grid.style.setProperty("--card-count", String(cardCount));

  for (let i = 0; i < cardCount; i++) {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = "card-slot";
    slot.style.setProperty("--i", String(i));
    slot.setAttribute("aria-label", `Open card ${i + 1}`);

    slot.innerHTML = `
      <div class="card-tile">
        <img src="${FRONT}" alt="" width="827" height="1417" decoding="async" />
      </div>
    `;

    const idx = i;
    slot.addEventListener("click", () => openDetail(idx));
    grid.appendChild(slot);
  }

  gridSection.replaceChildren(grid);
}

function openDetail(index) {
  if (closing) return;
  const { cardCount } = gridState;
  if (index < 0 || index >= cardCount) return;

  const backSrc = backUrl(index);

  detailFlipInner.style.transform = "";

  detailFrontImg.src = FRONT;
  detailBackImg.src = backSrc;
  const copy = CARD_COPY[index] ?? CARD_COPY[0];
  detailTitle.textContent = copy.title;
  detailBody.textContent = copy.body;

  gridSection.classList.add("is-behind");
  detail.classList.add("is-open");
  detail.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  detailFlip.classList.remove("is-anim-in");
  void detailFlip.offsetWidth;
  detailFlip.classList.add("is-anim-in");

  const prefersReduced =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) {
    detailFlipInner.style.transform = "rotateY(180deg) scale(1)";
  }

  backBtn.focus();
}

function closeDetail() {
  if (!detail.classList.contains("is-open") || closing) return;
  closing = true;

  detailFlip.classList.remove("is-anim-in");
  detailFlipInner.style.transform = "rotateY(0deg) scale(1)";
  detail.classList.remove("is-open");
  detail.setAttribute("aria-hidden", "true");
  gridSection.classList.remove("is-behind");
  document.body.style.overflow = "hidden";

  window.setTimeout(() => {
    closing = false;
    detailFlipInner.style.transform = "";
  }, 450);
}

detailBackdrop.addEventListener("click", closeDetail);
backBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  closeDetail();
});

document.querySelector(".detail-panel")?.addEventListener("click", (e) => {
  e.stopPropagation();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && detail.classList.contains("is-open")) {
    closeDetail();
  }
});

applyLogoCornerFromQuery();
buildGrid();
setupGridFit();
