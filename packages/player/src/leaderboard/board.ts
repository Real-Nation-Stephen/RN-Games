import type { LeaderboardConfig, LeaderboardPublicState, LeaderboardRow } from "./types";
import { fetchPublicConfig, getSlugFromPath, pollState } from "./api";
import { runnerSheetFrameCount, runnerSheetFrameRect } from "@rngames/shared";
import { track } from "@rngames/shared/track";

const AVATAR_SIZE = 32;
const AVATAR_FPS = 3;

type AvatarStop = () => void;
const avatarStops: AvatarStop[] = [];

function clearAvatarAnimators() {
  for (const stop of avatarStops) stop();
  avatarStops.length = 0;
}

function paintSpriteFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cellW: number,
  cellH: number,
  frameIndex: number,
) {
  const sheet = { url: "", cellWidth: cellW, cellHeight: cellH };
  const { sx, sy, sw, sh } = runnerSheetFrameRect(
    sheet,
    frameIndex,
    img.naturalWidth,
    img.naturalHeight,
  );
  ctx.clearRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  const scale = Math.min(AVATAR_SIZE / sw, AVATAR_SIZE / sh);
  const destW = sw * scale;
  const destH = sh * scale;
  const feetX = AVATAR_SIZE / 2;
  const feetY = AVATAR_SIZE - 2;
  ctx.drawImage(img, sx, sy, sw, sh, feetX - destW / 2, feetY - destH, destW, destH);
}

function appendAvatar(nameEl: HTMLElement, row: LeaderboardRow) {
  const url = row.avatarUrl?.trim();
  if (!url) return;
  const cellW = row.avatarCellWidth || 64;
  const cellH = row.avatarCellHeight || 64;
  const wrap = document.createElement("span");
  wrap.className = "lb-avatar-wrap";
  const canvas = document.createElement("canvas");
  canvas.className = "lb-avatar";
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  wrap.appendChild(canvas);
  nameEl.appendChild(wrap);

  const img = new Image();
  img.crossOrigin = "anonymous";
  let running = true;
  let raf = 0;
  let acc = 0;

  const stop: AvatarStop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };
  avatarStops.push(stop);

  img.onload = () => {
    if (!running) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const sheet = { url: "", cellWidth: cellW, cellHeight: cellH };
    const total = runnerSheetFrameCount(sheet, img.naturalWidth, img.naturalHeight);
    paintSpriteFrame(ctx, img, cellW, cellH, 0);
    if (total <= 1) return;

    let last = performance.now();
    const tick = (now: number) => {
      if (!running) return;
      acc += now - last;
      last = now;
      const frame = Math.floor((acc * AVATAR_FPS) / 1000) % total;
      paintSpriteFrame(ctx, img, cellW, cellH, frame);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };
  img.onerror = () => {
    stop();
    wrap.hidden = true;
  };
  img.src = url;
}

function $(id: string) {
  return document.getElementById(id)!;
}

function applyChrome(cfg: LeaderboardConfig) {
  const b = cfg.board;
  const root = document.documentElement;
  root.style.setProperty("--lb-bg-solid", b.backgroundHex || "#0f1a24");
  root.style.setProperty("--lb-header", b.headerHex || "#ffffff");
  root.style.setProperty("--lb-subhead", b.subheadHex || "#c8d4e0");
  if (b.useBackgroundImage && b.backgroundImage) {
    root.style.setProperty("--lb-bg-image", `url("${b.backgroundImage}")`);
  } else {
    root.style.setProperty("--lb-bg-image", "none");
  }
  $("lb-header").textContent = b.header || cfg.title || "Leaderboard";
  $("lb-subhead").textContent = b.subhead || "";
  const brand = $("lb-brand");
  if (b.brandLogoUrl) {
    brand.innerHTML = `<img src="${b.brandLogoUrl}" alt="" />`;
    brand.hidden = false;
    document.body.dataset.brandCorner = b.brandLogoCorner || "bl";
  } else {
    brand.hidden = true;
  }
  const powered = document.getElementById("powered-by-rn") as HTMLElement | null;
  if (powered) powered.hidden = cfg.showPoweredBy === false;
}

function renderList(state: LeaderboardPublicState) {
  clearAvatarAnimators();
  const list = $("lb-list");
  const indicator = $("lb-indicator");
  list.innerHTML = "";
  if (state.indicator) {
    indicator.textContent = state.indicator;
    indicator.hidden = false;
  } else {
    indicator.hidden = true;
    indicator.textContent = "";
  }
  if (!state.rows.length) {
    list.innerHTML = `<li class="lb-empty muted">No scores yet.</li>`;
    return;
  }
  for (const row of state.rows) {
    const li = document.createElement("li");
    li.className = "lb-row";
    li.innerHTML = `<span class="lb-rank">${row.rank}</span>`;
    const name = document.createElement("span");
    name.className = "lb-name";
    appendAvatar(name, row);
    const text = document.createElement("span");
    text.className = "lb-name-text";
    text.textContent = row.displayName;
    name.appendChild(text);
    const score = document.createElement("span");
    score.className = "lb-score";
    score.textContent = String(row.score);
    li.appendChild(name);
    li.appendChild(score);
    list.appendChild(li);
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

const isPreview = new URLSearchParams(window.location.search).get("preview") === "1";

window.addEventListener("message", (e) => {
  if (e.origin !== window.location.origin) return;
  if (e.data?.type === "rngames-leaderboard-config" && e.data.config) {
    const cfg = e.data.config as LeaderboardConfig;
    document.title = cfg.title || document.title;
    applyFavicon(cfg.faviconUrl);
    applyChrome(cfg);
    $("app").hidden = false;
  }
});

async function main() {
  const slug = getSlugFromPath();
  if (!slug) throw new Error("Missing leaderboard slug");
  const cfg = await fetchPublicConfig(slug);
  document.title = cfg.title || document.title;
  applyFavicon(cfg.faviconUrl);
  applyChrome(cfg);
  $("app").hidden = false;

  track({ type: "leaderboard.view", gameId: cfg.id || slug, payload: { slug, surface: "live" } });

  let rev = 0;
  const loop = async () => {
    try {
      const r = await pollState(slug, rev);
      if (r.changed && r.state) {
        rev = r.state.revision;
        renderList(r.state);
      }
    } catch {
      /* ignore transient */
    } finally {
      window.setTimeout(loop, 3000);
    }
  };
  void loop();

  const fsBtn = $("lb-fs-btn") as HTMLButtonElement;
  if (document.documentElement.requestFullscreen) {
    fsBtn.addEventListener("click", async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch {
        /* ignore */
      }
    });
  } else {
    fsBtn.hidden = true;
  }
}

if (!isPreview) {
  main().catch((e) => {
    const err = $("lb-error");
    const msg = $("lb-error-msg");
    err.hidden = false;
    msg.textContent = e instanceof Error ? e.message : "Failed to load";
    $("app").hidden = true;
  });
}
