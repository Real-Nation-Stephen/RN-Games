import type { LeaderboardConfig, LeaderboardPublicState } from "./types";
import { fetchPublicConfig, getSlugFromPath, pollState } from "./api";
import { track } from "@rngames/shared/track";

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
    name.textContent = row.displayName;
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
