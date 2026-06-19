import { renderStickyNote } from "./sticky-render";
import { loadConfig, getEventIdFromQuery, addSubmission } from "./store";
import { applyBranding, injectFontFaces } from "./theme";
import { createPhotoEditor } from "./photo-editor";
import type { PinboardConfig, PinboardStickyAsset } from "./types";
import { track } from "@rngames/shared/track";

type Tab = "photo" | "note";

const state = {
  tab: "photo" as Tab,
  stickyId: "",
  noteMode: "type" as "type" | "draw",
  stream: null as MediaStream | null,
};

let activeCfg: PinboardConfig | null = null;

function guestModes(cfg: PinboardConfig) {
  const g = cfg.mobile.guestSubmit;
  return {
    photos: g?.allowPhotos !== false,
    typed: g?.allowTypedNotes !== false,
    drawn: g?.allowDrawnNotes !== false,
  };
}

function notesEnabled(cfg: PinboardConfig) {
  const m = guestModes(cfg);
  return m.typed || m.drawn;
}

function $(id: string) {
  return document.getElementById(id)!;
}

function setErr(msg: string) {
  const el = $("pin-err");
  el.textContent = msg;
  el.hidden = !msg;
}

function consentKey(eventId: string) {
  return `pinboard-consent:${eventId}`;
}

function hasConsent(eventId: string) {
  return sessionStorage.getItem(consentKey(eventId)) === "1";
}

function setupConsent(cfg: PinboardConfig, eventId: string, onAccepted: () => void) {
  const perms = cfg.permissions;
  if (!perms?.enabled) {
    $("pin-consent").hidden = true;
    $("pin-form").hidden = false;
    onAccepted();
    return;
  }
  if (hasConsent(eventId)) {
    $("pin-consent").hidden = true;
    $("pin-form").hidden = false;
    onAccepted();
    return;
  }

  $("pin-consent").hidden = false;
  $("pin-form").hidden = true;
  $("pin-photo-editor").hidden = true;
  $("pin-consent-title").textContent = perms.headline || "Before you continue";
  $("pin-consent-intro").textContent = perms.introText || "";
  const gdprWrap = $("pin-consent-gdpr-wrap");
  const gdprLink = $("pin-consent-gdpr-link") as HTMLAnchorElement;
  if (perms.gdprUrl?.trim()) {
    gdprWrap.hidden = false;
    gdprLink.href = perms.gdprUrl.trim();
    gdprLink.textContent = perms.gdprLinkLabel || "Privacy policy (GDPR)";
  } else {
    gdprWrap.hidden = true;
  }

  const itemsRoot = $("pin-consent-items");
  itemsRoot.innerHTML = "";
  const checks: HTMLInputElement[] = [];
  for (const item of perms.items || []) {
    const label = document.createElement("label");
    label.className = "pin-consent-item";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.id = item.id;
    if (item.required) input.required = true;
    const span = document.createElement("span");
    span.textContent = item.label;
    label.appendChild(input);
    label.appendChild(span);
    itemsRoot.appendChild(label);
    checks.push(input);
  }

  const acceptBtn = $("pin-consent-accept") as HTMLButtonElement;
  acceptBtn.textContent = perms.acceptButtonLabel || "Accept and continue";
  acceptBtn.disabled = true;

  const validate = () => {
    const ok = checks.every((c) => !c.required || c.checked);
    acceptBtn.disabled = !ok;
  };
  checks.forEach((c) => c.addEventListener("change", validate));
  validate();

  acceptBtn.onclick = () => {
    if (acceptBtn.disabled) return;
    sessionStorage.setItem(consentKey(eventId), "1");
    $("pin-consent").hidden = true;
    $("pin-form").hidden = false;
    onAccepted();
  };
}

function showThanks(cfg: PinboardConfig) {
  $("pin-form").hidden = true;
  $("pin-photo-editor").hidden = true;
  $("pin-consent").hidden = true;
  const t = $("pin-thanks");
  t.hidden = false;
  $("pin-thanks-msg").textContent = cfg.mobile.thankYouMessage;
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
  }
}

async function startCamera() {
  stopCamera();
  const video = $("pin-video") as HTMLVideoElement;
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
    video.srcObject = state.stream;
    await video.play();
  } catch {
    setErr("Camera access denied or unavailable. Please allow camera access to take a photo.");
  }
}

function capturePhoto(): string | null {
  const video = $("pin-video") as HTMLVideoElement;
  if (!video.videoWidth) return null;
  const canvas = document.createElement("canvas");
  const max = 1200;
  const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.88);
}

function openPhotoEditor(dataUrl: string, cfg: ReturnType<typeof loadConfig>, editor: ReturnType<typeof createPhotoEditor>) {
  stopCamera();
  $("pin-form").hidden = true;
  editor.open(dataUrl);
}

function setupDrawCanvas() {
  const canvas = $("pin-draw") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const rect = () => canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const resize = () => {
    const r = rect();
    canvas.width = Math.floor(r.width * dpr);
    canvas.height = Math.floor(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 3;
  };
  resize();
  window.addEventListener("resize", resize);

  let drawing = false;
  const pos = (e: PointerEvent) => {
    const r = rect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  canvas.addEventListener("pointerdown", (e) => {
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  });
  const end = () => {
    drawing = false;
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
}

function renderStickyPicker(stickies: PinboardStickyAsset[]) {
  const root = $("pin-sticky-picker");
  root.innerHTML = "";
  if (!stickies.length) return;
  if (!state.stickyId) state.stickyId = stickies[0].id;
  for (const s of stickies) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = state.stickyId === s.id ? "is-active" : "";
    b.title = s.label;
    const img = document.createElement("img");
    img.src = s.imageUrl;
    img.alt = s.label;
    b.appendChild(img);
    b.addEventListener("click", () => {
      state.stickyId = s.id;
      renderStickyPicker(stickies);
    });
    root.appendChild(b);
  }
}

function applyGuestModeChrome(cfg: PinboardConfig) {
  const modes = guestModes(cfg);
  const notesOn = notesEnabled(cfg);
  const photoBtn = document.querySelector('.pin-tabs button[data-tab="photo"]') as HTMLButtonElement | null;
  const noteBtn = document.querySelector('.pin-tabs button[data-tab="note"]') as HTMLButtonElement | null;
  const tabs = document.querySelector(".pin-tabs") as HTMLElement | null;
  if (photoBtn) photoBtn.hidden = !modes.photos;
  if (noteBtn) noteBtn.hidden = !notesOn;
  if (tabs) tabs.hidden = !modes.photos && !notesOn;

  const noteModesEl = document.querySelector(".pin-note-modes") as HTMLElement | null;
  if (noteModesEl) {
    noteModesEl.hidden = !notesOn;
    const typeBtn = noteModesEl.querySelector('[data-mode="type"]') as HTMLButtonElement | null;
    const drawBtn = noteModesEl.querySelector('[data-mode="draw"]') as HTMLButtonElement | null;
    if (typeBtn) typeBtn.hidden = !modes.typed;
    if (drawBtn) drawBtn.hidden = !modes.drawn;
  }

  if (modes.typed && !modes.drawn) state.noteMode = "type";
  else if (modes.drawn && !modes.typed) state.noteMode = "draw";

  $("pin-type-wrap").hidden = state.noteMode !== "type";
  $("pin-draw-wrap").hidden = state.noteMode !== "draw";
  document.querySelectorAll(".pin-note-modes button").forEach((b) => {
    b.classList.toggle("is-active", b.getAttribute("data-mode") === state.noteMode);
  });
}

function defaultTab(cfg: PinboardConfig): Tab {
  const modes = guestModes(cfg);
  if (modes.photos) return "photo";
  if (notesEnabled(cfg)) return "note";
  return "photo";
}

function setTab(tab: Tab) {
  const cfg = activeCfg;
  if (!cfg) return;
  const modes = guestModes(cfg);
  if (tab === "photo" && !modes.photos) tab = "note";
  if (tab === "note" && !notesEnabled(cfg)) tab = "photo";
  state.tab = tab;
  document.querySelectorAll(".pin-tabs button").forEach((b) => {
    b.classList.toggle("is-active", b.getAttribute("data-tab") === tab);
  });
  $("pin-panel-photo").classList.toggle("is-active", tab === "photo");
  $("pin-panel-note").classList.toggle("is-active", tab === "note");
  $("pin-submit").hidden = tab === "photo";
  if (tab === "photo") void startCamera();
  else stopCamera();
}

async function submitNote(eventId: string, cfg: PinboardConfig) {
  const modes = guestModes(cfg);
  if (!notesEnabled(cfg)) {
    setErr("Notes are not enabled for this event.");
    return;
  }
  if (state.noteMode === "type" && !modes.typed) {
    setErr("Typed notes are not enabled for this event.");
    return;
  }
  if (state.noteMode === "draw" && !modes.drawn) {
    setErr("Drawn notes are not enabled for this event.");
    return;
  }
  const sticky =
    cfg.mobile.stickyAssets.find((s) => s.id === state.stickyId) ||
    cfg.stickies.find((s) => s.id === state.stickyId) ||
    cfg.stickies[0];
  if (!sticky) {
    setErr("No sticky note style configured.");
    return;
  }
  const text = ($("pin-note-text") as HTMLTextAreaElement).value;
  const drawCanvas = $("pin-draw") as HTMLCanvasElement;
  const drawDataUrl = state.noteMode === "draw" ? drawCanvas.toDataURL("image/png") : undefined;
  if (state.noteMode === "type" && !text.trim()) {
    setErr("Type a note or switch to Draw.");
    return;
  }
  const imageDataUrl = await renderStickyNote({
    sticky,
    text: state.noteMode === "type" ? text : undefined,
    drawDataUrl,
    mode: state.noteMode,
  });
  await addSubmission(eventId, {
    type: "note",
    imageDataUrl,
    noteText: text,
    noteMode: state.noteMode,
    stickyId: sticky.id,
  });
  track({
    type: "pinboard.submit",
    gameId: eventId,
    payload: { submissionType: "note", stickyId: sticky.id },
  });
  showThanks(cfg);
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
  document.body.classList.add("pinboard-submit");
  const eventId = getEventIdFromQuery();
  const cfg = await loadConfig(eventId);
  activeCfg = cfg;
  document.title = cfg.title || document.title;
  applyFavicon(cfg.faviconUrl);
  injectFontFaces(cfg);
  applyBranding({
    ...cfg.mobile,
    backgroundImageUrl: cfg.mobile.backgroundImageUrl,
    useBackgroundImage: cfg.mobile.useBackgroundImage ?? false,
  });

  $("pin-title").textContent = cfg.mobile.headline;
  $("pin-sub").textContent = cfg.mobile.subheadline;
  $("pin-submit").textContent = cfg.mobile.submitLabel;
  const editorTitle = document.getElementById("pin-editor-title");
  if (editorTitle) editorTitle.textContent = "Style your photo";

  const photoEditor = createPhotoEditor(cfg, {
    root: $("pin-photo-editor"),
    stage: $("pin-editor-stage"),
    photoLayer: $("pin-editor-photo"),
    frameLayer: $("pin-editor-frame"),
    stickerLayer: $("pin-editor-stickers"),
    framePicker: $("pin-editor-frames"),
    stickerTray: $("pin-editor-sticker-tray"),
    errEl: $("pin-editor-err"),
    onBack: () => {
      photoEditor.close();
      $("pin-form").hidden = false;
      ($("pin-video") as HTMLVideoElement).hidden = false;
      void startCamera();
    },
    onDone: (result) => {
      void (async () => {
        try {
          await addSubmission(eventId, {
            type: "photo",
            imageDataUrl: result.compositeDataUrl,
            photoRawDataUrl: result.rawDataUrl,
            photoFrameId: result.frameId,
            photoStickers: result.stickers,
          });
          track({
            type: "pinboard.submit",
            gameId: eventId,
            payload: { submissionType: "photo", frameId: result.frameId },
          });
          photoEditor.close();
          showThanks(cfg);
        } catch (e) {
          setErr(e instanceof Error ? e.message : "Submit failed");
        }
      })();
    },
  });

  renderStickyPicker(cfg.mobile.stickyAssets);
  setupDrawCanvas();
  applyGuestModeChrome(cfg);

  document.querySelectorAll(".pin-tabs button").forEach((b) => {
    b.addEventListener("click", () => setTab(b.getAttribute("data-tab") as Tab));
  });

  document.querySelectorAll(".pin-note-modes button").forEach((b) => {
    b.addEventListener("click", () => {
      state.noteMode = b.getAttribute("data-mode") as "type" | "draw";
      document.querySelectorAll(".pin-note-modes button").forEach((x) => {
        x.classList.toggle("is-active", x === b);
      });
      $("pin-type-wrap").hidden = state.noteMode !== "type";
      $("pin-draw-wrap").hidden = state.noteMode !== "draw";
    });
  });

  $("pin-capture").addEventListener("click", () => {
    const dataUrl = capturePhoto();
    if (!dataUrl) {
      setErr("Could not capture photo. Try again.");
      return;
    }
    setErr("");
    openPhotoEditor(dataUrl, cfg, photoEditor);
  });

  $("pin-editor-back").addEventListener("click", () => photoEditor.back());
  $("pin-editor-done").addEventListener("click", () => void photoEditor.submit());

  $("pin-submit").addEventListener("click", async () => {
    setErr("");
    const btn = $("pin-submit") as HTMLButtonElement;
    btn.disabled = true;
    try {
      if (state.tab !== "note") return;
      await submitNote(eventId, cfg);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Submit failed");
    } finally {
      btn.disabled = false;
    }
  });

  setupConsent(cfg, eventId, () => setTab(defaultTab(cfg)));
}

void bootstrap();
