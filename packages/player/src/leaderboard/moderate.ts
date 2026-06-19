import type { LeaderboardConfig, LeaderboardPublicState } from "./types";
import {
  fetchPublicConfig,
  getSlugFromPath,
  moderateAction,
  pinStorageKey,
  pollState,
} from "./api";

function $(id: string) {
  return document.getElementById(id)!;
}

function setErr(msg: string) {
  const el = $("lb-mod-app").hidden ? $("lb-mod-err-gate") : $("lb-mod-err");
  el.textContent = msg;
  el.hidden = !msg;
}

let pin = "";
let slug = "";
let state: LeaderboardPublicState | null = null;

function applyModChrome(c: LeaderboardConfig) {
  const m = c.moderator || {};
  document.documentElement.style.setProperty("--lb-mod-bg", m.backgroundHex || "#121820");
  document.documentElement.style.setProperty("--lb-mod-text", m.textHex || "#eef2f7");
  document.documentElement.style.setProperty("--lb-mod-btn", m.buttonHex || "#2d6a4f");
  $("lb-mod-headline").textContent = m.headline || "Leaderboard moderation";
}

function renderEntries() {
  const list = $("lb-mod-list");
  list.innerHTML = "";
  const items = state?.entries?.length ? state.entries : state?.rows || [];
  if (!items.length) {
    list.innerHTML = `<p class="muted">No entries yet.</p>`;
    return;
  }
  for (const row of items) {
    const card = document.createElement("div");
    card.className = "lb-mod-card";
    card.innerHTML = `
      <div class="lb-mod-card-head">
        <span class="lb-rank">#${row.rank}</span>
        <strong>${row.displayName}</strong>
        <span class="muted">${row.source || ""}</span>
      </div>
      <label class="field">Score
        <input type="number" data-score-id="${row.id}" value="${row.score}" />
      </label>
      <div class="lb-mod-card-actions">
        <button type="button" class="btn" data-save-id="${row.id}">Save</button>
        <button type="button" class="btn btn-danger" data-remove-id="${row.id}">Remove</button>
      </div>
    `;
    list.appendChild(card);
  }
  list.querySelectorAll("[data-save-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = (btn as HTMLElement).dataset.saveId!;
      const input = list.querySelector(`[data-score-id="${id}"]`) as HTMLInputElement;
      void saveEntry(id, Number(input.value));
    });
  });
  list.querySelectorAll("[data-remove-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = (btn as HTMLElement).dataset.removeId!;
      void removeEntry(id);
    });
  });
}

async function refresh() {
  const r = await pollState(slug, 0);
  if (r.state) {
    state = r.state;
    renderEntries();
    const pan = $("lb-mod-pan") as HTMLInputElement;
    pan.value = String(state.panOffset || 0);
    const meta = $("lb-mod-meta");
    meta.textContent = state.indicator ? `${state.indicator} · ${state.total} players` : `${state.total} players`;
  }
}

async function saveEntry(id: string, score: number) {
  setErr("");
  try {
    state = await moderateAction(slug, pin, { action: "update_entry", id, score });
    renderEntries();
  } catch (e) {
    setErr(e instanceof Error ? e.message : "Save failed");
  }
}

async function removeEntry(id: string) {
  setErr("");
  try {
    state = await moderateAction(slug, pin, { action: "remove_entry", id });
    renderEntries();
  } catch (e) {
    setErr(e instanceof Error ? e.message : "Remove failed");
  }
}

function showGate() {
  $("lb-mod-gate").hidden = false;
  $("lb-mod-app").hidden = true;
}

function showApp() {
  $("lb-mod-gate").hidden = true;
  $("lb-mod-app").hidden = false;
}

async function tryPin(entered: string) {
  setErr("");
  try {
    await moderateAction(slug, entered, { action: "set_pan", offset: 0 });
    pin = entered;
    sessionStorage.setItem(pinStorageKey(slug), pin);
    showApp();
    await refresh();
  } catch {
    setErr("Incorrect PIN");
  }
}

async function main() {
  slug = getSlugFromPath();
  if (!slug) throw new Error("Missing slug");
  const cfg = await fetchPublicConfig(slug);
  document.title = `${cfg.title} — Moderator`;
  applyModChrome(cfg);

  const stored = sessionStorage.getItem(pinStorageKey(slug));
  if (stored) {
    pin = stored;
    try {
      await refresh();
      showApp();
    } catch {
      showGate();
    }
  } else {
    showGate();
  }

  $("lb-mod-pin-submit").addEventListener("click", () => {
    const v = ($("lb-mod-pin") as HTMLInputElement).value.trim();
    if (v) void tryPin(v);
  });

  $("lb-mod-add").addEventListener("click", async () => {
    const name = ($("lb-mod-name") as HTMLInputElement).value.trim();
    const score = Number(($("lb-mod-score") as HTMLInputElement).value);
    if (!name) return setErr("Name required");
    if (!Number.isFinite(score)) return setErr("Score required");
    setErr("");
    try {
      state = await moderateAction(slug, pin, { action: "add_entry", displayName: name, score });
      ($("lb-mod-name") as HTMLInputElement).value = "";
      renderEntries();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Add failed");
    }
  });

  $("lb-mod-pan-apply").addEventListener("click", async () => {
    const offset = Number(($("lb-mod-pan") as HTMLInputElement).value);
    setErr("");
    try {
      state = await moderateAction(slug, pin, { action: "set_pan", offset });
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Pan failed");
    }
  });

  $("lb-mod-clear").addEventListener("click", async () => {
    if (!confirm("Clear all entries?")) return;
    setErr("");
    try {
      state = await moderateAction(slug, pin, { action: "clear_entries" });
      renderEntries();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Clear failed");
    }
  });

  window.setInterval(() => void refresh().catch(() => {}), 3000);
}

main().catch((e) => {
  setErr(e instanceof Error ? e.message : "Failed to load");
  showGate();
});
