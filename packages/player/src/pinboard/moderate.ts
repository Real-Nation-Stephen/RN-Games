import type { PinboardSubmission } from "./types";
import {
  loadConfig,
  getEventIdFromQuery,
  subscribeState,
  updateSubmission,
  clearBoard,
  removeFromBoard,
  loadState,
} from "./store";
import { applyBranding } from "./theme";
import { computePlacement } from "./placement";

type ModTab = "queue" | "board";

const ui = {
  tab: "queue" as ModTab,
  selectedId: "",
};

function $(id: string) {
  return document.getElementById(id)!;
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function boardZone() {
  return {
    left: window.innerWidth * 0.05,
    top: window.innerHeight * 0.12,
    width: window.innerWidth * 0.9,
    height: window.innerHeight * 0.72,
  };
}

function renderPreview(s: PinboardSubmission | null) {
  const box = $("pin-mod-preview");
  if (!s?.imageDataUrl) {
    box.innerHTML = `<p class="muted">Select a submission</p>`;
    return;
  }
  box.innerHTML = `<img src="${s.imageDataUrl}" alt="" />`;
}

function updateActionButtons(s: PinboardSubmission | null) {
  const approve = $("pin-approve") as HTMLButtonElement;
  const reject = $("pin-reject") as HTMLButtonElement;
  const onQueue = ui.tab === "queue" && s?.status === "pending";
  approve.hidden = !onQueue;
  reject.hidden = !onQueue;
  approve.disabled = !onQueue;
  reject.disabled = !onQueue;
}

function renderList(state: { submissions: PinboardSubmission[] }) {
  const list = $("pin-mod-list");
  const items =
    ui.tab === "queue"
      ? state.submissions.filter((s) => s.status === "pending")
      : state.submissions.filter((s) => s.status === "approved");

  list.innerHTML = "";
  if (!items.length) {
    list.innerHTML = `<p class="muted">No items.</p>`;
    ui.selectedId = "";
    renderPreview(null);
    updateActionButtons(null);
    return;
  }

  if (!items.some((s) => s.id === ui.selectedId)) ui.selectedId = items[0].id;

  for (const s of items) {
    if (ui.tab === "board") {
      const row = document.createElement("div");
      row.className = "pin-mod-board-item";
      const img = document.createElement("img");
      img.src = s.imageDataUrl || "";
      img.alt = "";
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = `${s.type} · ${formatTime(s.createdAt)}`;
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "pin-btn pin-btn--danger";
      rm.textContent = "Remove";
      rm.style.padding = "8px 12px";
      rm.addEventListener("click", () => void removeFromBoard(getEventIdFromQuery(), s.id));
      row.appendChild(img);
      row.appendChild(meta);
      row.appendChild(rm);
      list.appendChild(row);
    } else {
      const b = document.createElement("button");
      b.type = "button";
      b.className = ui.selectedId === s.id ? "is-active" : "";
      const img = document.createElement("img");
      img.src = s.imageDataUrl || "";
      img.alt = "";
      const text = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = s.type === "photo" ? "Photo" : "Note";
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = formatTime(s.createdAt);
      text.appendChild(strong);
      text.appendChild(meta);
      b.appendChild(img);
      b.appendChild(text);
      b.addEventListener("click", () => {
        ui.selectedId = s.id;
        renderList(state);
      });
      list.appendChild(b);
    }
  }

  const sel = state.submissions.find((s) => s.id === ui.selectedId) || null;
  renderPreview(sel);
  updateActionButtons(sel);
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

async function bootstrap() {
  document.body.classList.add("pinboard-moderate");
  const eventId = getEventIdFromQuery();
  const cfg = await loadConfig(eventId);
  document.title = `${cfg.moderator.headline} · ${cfg.title}`;
  applyFavicon(cfg.faviconUrl);
  applyBranding(cfg.moderator);

  $("pin-mod-title").textContent = cfg.moderator.headline;
  $("pin-approve").textContent = cfg.moderator.approveLabel;
  $("pin-reject").textContent = cfg.moderator.rejectLabel;

  document.querySelectorAll(".pin-mod-tabs button").forEach((b) => {
    b.addEventListener("click", () => {
      ui.tab = b.getAttribute("data-tab") as ModTab;
      document.querySelectorAll(".pin-mod-tabs button").forEach((x) => {
        x.classList.toggle("is-active", x === b);
      });
      $("pin-queue-actions").hidden = ui.tab !== "queue";
      $("pin-mod-preview-wrap").hidden = ui.tab === "board";
      void loadState(eventId).then((st) => renderList(st));
    });
  });

  $("pin-approve").addEventListener("click", () => {
    void (async () => {
      const st = await loadState(eventId);
      const s = st.submissions.find((x) => x.id === ui.selectedId);
      if (!s) return;
      const placement = computePlacement({
        type: s.type,
        existing: st.submissions,
        zone: boardZone(),
      });
      await updateSubmission(eventId, s.id, { status: "approved", placement });
    })();
  });

  $("pin-reject").addEventListener("click", () => {
    if (ui.selectedId) void updateSubmission(eventId, ui.selectedId, { status: "rejected" });
  });

  $("pin-clear-board").addEventListener("click", () => {
    $("pin-clear-dialog").hidden = false;
  });
  $("pin-clear-cancel").addEventListener("click", () => {
    $("pin-clear-dialog").hidden = true;
  });
  $("pin-clear-confirm").addEventListener("click", () => {
    void clearBoard(eventId);
    $("pin-clear-dialog").hidden = true;
  });

  subscribeState(eventId, (state) => {
    $("pin-count-queue").textContent = String(state.submissions.filter((s) => s.status === "pending").length);
    $("pin-count-board").textContent = String(state.submissions.filter((s) => s.status === "approved").length);
    renderList(state);
  });
}

void bootstrap();
