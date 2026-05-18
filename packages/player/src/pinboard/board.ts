import QRCode from "qrcode";
import type { PinboardConfig, PinboardSubmission, PinboardState } from "./types";
import { loadConfig, getEventIdFromQuery, subscribeState, saveState, loadState } from "./store";
import { isDemoSlug, publicToConfig } from "./api";
import { applyBoardChrome } from "./theme";
import { computePlacement, type PinZone } from "./placement";
import { resolveBoardPhoto } from "./board-photo";

const zoneEl = () => document.getElementById("pin-zone");
const canvasEl = () => document.getElementById("pin-canvas");
const emptyEl = () => document.getElementById("pin-empty");

/** Live DOM nodes keyed by submission id — avoids full rebuild on each poll. */
const mounted = new Map<string, HTMLElement>();

function submitUrl(slug: string) {
  if (isDemoSlug(slug)) {
    const u = new URL("/play/pinboard-submit.html", window.location.origin);
    u.searchParams.set("event", slug);
    return u.toString();
  }
  return new URL(`/pinboard/${encodeURIComponent(slug)}/submit`, window.location.origin).toString();
}

function getPinZone(): PinZone {
  const z = zoneEl();
  if (!z) return { left: 0, top: 0, width: 100, height: 100 };
  const r = z.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function applyItemLayout(el: HTMLElement, sub: PinboardSubmission, cfg: PinboardConfig) {
  if (!sub.placement) return;
  const p = sub.placement;
  const photo = sub.type === "photo" ? resolveBoardPhoto(sub, cfg) : null;
  const polaroidClass = photo?.polaroid ? " pin-item--polaroid" : "";
  el.className = `pin-item pin-item--${sub.type}${polaroidClass}`;
  el.style.left = `${p.x}%`;
  el.style.top = `${p.y}%`;
  el.style.zIndex = String(p.z);
  el.style.setProperty("--rot", `${p.rot}deg`);
  el.style.transform = `translate(-50%, -50%) rotate(${p.rot}deg)`;
  el.style.width = `${p.w}px`;
}

function createItemNode(sub: PinboardSubmission, cfg: PinboardConfig, animateIn: boolean) {
  if (!sub.placement) return null;
  const photo = sub.type === "photo" ? resolveBoardPhoto(sub, cfg) : null;
  const src = sub.type === "photo" ? photo!.src : sub.imageDataUrl;
  if (!src) return null;

  const el = document.createElement("div");
  el.dataset.submissionId = sub.id;
  if (animateIn) el.classList.add("pin-item--enter");
  applyItemLayout(el, sub, cfg);

  const inner = document.createElement("div");
  inner.className = "pin-item__inner";
  const img = document.createElement("img");
  img.src = src;
  img.alt = sub.type === "note" ? "Note" : "Photo";
  img.decoding = "async";
  inner.appendChild(img);
  if (photo?.frameOverlayUrl) {
    const frame = document.createElement("img");
    frame.className = "pin-item__frame";
    frame.src = photo.frameOverlayUrl;
    frame.alt = "";
    frame.decoding = "async";
    inner.appendChild(frame);
  }
  el.appendChild(inner);

  if (animateIn) {
    el.addEventListener(
      "animationend",
      () => {
        el.classList.remove("pin-item--enter");
      },
      { once: true },
    );
  }

  return el;
}

function setEmptyVisible(hasPins: boolean) {
  const zone = zoneEl();
  if (zone) zone.classList.toggle("has-pins", hasPins);
  const empty = emptyEl();
  if (empty) empty.hidden = hasPins;
}

function syncBoard(cfg: PinboardConfig, state: PinboardState) {
  const canvas = canvasEl();
  if (!canvas) return;

  const approved = state.submissions.filter(
    (s) => s.status === "approved" && s.placement && (s.imageDataUrl || s.photoRawDataUrl),
  );

  setEmptyVisible(approved.length > 0);

  const activeIds = new Set(approved.map((s) => s.id));

  for (const [id, el] of mounted) {
    if (!activeIds.has(id)) {
      el.remove();
      mounted.delete(id);
    }
  }

  for (const sub of approved) {
    const existing = mounted.get(sub.id);
    if (existing) {
      applyItemLayout(existing, sub, cfg);
      continue;
    }
    const node = createItemNode(sub, cfg, true);
    if (!node) continue;
    canvas.appendChild(node);
    mounted.set(sub.id, node);
  }
}

function ensurePlacements(state: PinboardState, zone: PinZone): boolean {
  let changed = false;
  for (const sub of state.submissions) {
    if (sub.status === "approved" && (sub.imageDataUrl || sub.photoRawDataUrl) && !sub.placement) {
      sub.placement = computePlacement({ type: sub.type, existing: state.submissions, zone });
      changed = true;
    }
  }
  return changed;
}

function applyChrome(cfg: PinboardConfig) {
  applyBoardChrome(cfg);
  const h1 = document.getElementById("pin-header");
  const sub = document.getElementById("pin-subhead");
  if (h1) h1.textContent = cfg.board.header;
  if (sub) sub.textContent = cfg.board.subhead;

  const brand = document.getElementById("pin-brand");
  if (brand) {
    if (cfg.board.brandLogoUrl) {
      brand.innerHTML = `<img src="${cfg.board.brandLogoUrl}" alt="" />`;
      brand.hidden = false;
    } else {
      brand.hidden = true;
    }
  }
}

async function renderQr(eventId: string) {
  const img = document.getElementById("pin-qr-img") as HTMLImageElement | null;
  if (!img) return;
  const url = submitUrl(eventId);
  img.src = await QRCode.toDataURL(url, {
    margin: 1,
    width: 210,
    color: { dark: "#1a1a1a", light: "#ffffff" },
  });
  img.alt = `QR code to ${url}`;
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
let liveCfg: PinboardConfig | null = null;

function applyPreviewConfig(data: Record<string, unknown>) {
  const slug = String(data.slug || getEventIdFromQuery());
  liveCfg = publicToConfig(data, slug);
  document.title = liveCfg.title || document.title;
  applyFavicon(liveCfg.faviconUrl);
  applyChrome(liveCfg);
  void renderQr(slug);
  void loadState(slug)
    .then((state) => syncBoard(liveCfg!, state))
    .catch(() =>
      syncBoard(liveCfg!, { version: 1, eventId: slug, submissions: [], boardClearedAt: null }),
    );
}

window.addEventListener("message", (e) => {
  if (e.origin !== window.location.origin) return;
  const d = e.data;
  if (d?.type === "rngames-pinboard-config" && d.config) {
    applyPreviewConfig(d.config as Record<string, unknown>);
  }
});

function bindResize(eventId: string, getCfg: () => PinboardConfig | null) {
  window.addEventListener("resize", () => {
    const cfg = getCfg();
    if (!cfg) return;
    void loadState(eventId).then((state) => {
      for (const sub of state.submissions) {
        if (sub.status === "approved" && sub.placement) {
          const el = mounted.get(sub.id);
          if (el) applyItemLayout(el, sub, cfg);
        }
      }
    });
  });
}

function bindStateSync(eventId: string, getCfg: () => PinboardConfig) {
  subscribeState(eventId, (state) => {
    const cfg = getCfg();
    const zone = getPinZone();
    if (ensurePlacements(state, zone) && isDemoSlug(eventId)) saveState(state);
    syncBoard(cfg, state);
  });
}

async function bootstrap() {
  document.body.classList.add("pinboard-board");
  const eventId = getEventIdFromQuery();

  if (isPreview) {
    bindStateSync(eventId, () => liveCfg ?? publicToConfig({ slug: eventId }, eventId));
    bindResize(eventId, () => liveCfg);
    return;
  }

  const cfg = await loadConfig(eventId);
  liveCfg = cfg;
  document.title = cfg.title || document.title;
  applyFavicon(cfg.faviconUrl);
  applyChrome(cfg);
  await renderQr(eventId);

  bindStateSync(eventId, () => cfg);
  bindResize(eventId, () => cfg);
}

void bootstrap();
