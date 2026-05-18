import type {
  PinboardConfig,
  PinboardFrameAsset,
  PinboardPhotoEditorSticker,
  PinboardPhotoStickerAsset,
} from "./types";
import { flattenPhotoEdit } from "./photo-render";

export interface PhotoEditResult {
  rawDataUrl: string;
  compositeDataUrl: string;
  frameId: string | null;
  stickers: PinboardPhotoEditorSticker[];
}

type StickerEl = {
  id: string;
  assetId: string;
  el: HTMLElement;
  x: number;
  y: number;
  rot: number;
  scale: number;
};

export type PhotoEditorHost = {
  root: HTMLElement;
  stage: HTMLElement;
  photoLayer: HTMLElement;
  frameLayer: HTMLElement;
  stickerLayer: HTMLElement;
  framePicker: HTMLElement;
  stickerTray: HTMLElement;
  errEl: HTMLElement;
  onBack: () => void;
  onDone: (result: PhotoEditResult) => void;
};

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function ang(a: { x: number; y: number }, b: { x: number; y: number }) {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

export function createPhotoEditor(cfg: PinboardConfig, host: PhotoEditorHost) {
  const frames: PinboardFrameAsset[] = cfg.mobile.photoFrames?.length
    ? cfg.mobile.photoFrames
    : [{ id: "none", label: "No frame", imageUrl: "" }];
  const stickerAssets: PinboardPhotoStickerAsset[] = cfg.mobile.photoStickers ?? [];

  let photoDataUrl = "";
  let frameId: string | null = frames.some((f) => f.id === "none") ? null : (frames[0]?.id ?? null);
  const stickers: StickerEl[] = [];
  let selectedId: string | null = null;

  const pointers = new Map<number, { x: number; y: number }>();
  let gesture:
    | { kind: "drag"; id: string; ox: number; oy: number; startX: number; startY: number }
    | {
        kind: "pinch";
        id: string;
        startDist: number;
        startAngle: number;
        startScale: number;
        startRot: number;
      }
    | null = null;

  function setErr(msg: string) {
    host.errEl.textContent = msg;
    host.errEl.hidden = !msg;
  }

  function applyStickerTransform(s: StickerEl) {
    s.el.style.left = `${s.x}%`;
    s.el.style.top = `${s.y}%`;
    s.el.style.transform = `translate(-50%, -50%) rotate(${s.rot}deg) scale(${s.scale})`;
  }

  function selectSticker(id: string | null) {
    selectedId = id;
    stickers.forEach((s) => s.el.classList.toggle("is-selected", s.id === id));
  }

  function renderFramePicker() {
    host.framePicker.innerHTML = "";
    for (const f of frames) {
      const b = document.createElement("button");
      b.type = "button";
      const active = frameId === f.id || (!frameId && f.id === "none");
      b.className = active ? "is-active" : "";
      b.title = f.label;
      if (f.imageUrl) {
        const img = document.createElement("img");
        img.src = f.imageUrl;
        img.alt = f.label;
        b.appendChild(img);
      } else {
        b.textContent = "None";
      }
      b.addEventListener("click", () => {
        frameId = f.id === "none" ? null : f.id;
        renderFramePicker();
        updateFrameLayer();
      });
      host.framePicker.appendChild(b);
    }
  }

  function updateFrameLayer() {
    const frame = frameId ? frames.find((f) => f.id === frameId) : null;
    host.frameLayer.innerHTML = "";
    if (frame?.imageUrl) {
      const img = document.createElement("img");
      img.src = frame.imageUrl;
      img.alt = "";
      img.draggable = false;
      host.frameLayer.appendChild(img);
    }
  }

  function renderStickerTray() {
    host.stickerTray.innerHTML = "";
    if (!stickerAssets.length) {
      host.stickerTray.hidden = true;
      return;
    }
    host.stickerTray.hidden = false;
    for (const asset of stickerAssets) {
      const b = document.createElement("button");
      b.type = "button";
      b.title = `Add ${asset.label}`;
      const img = document.createElement("img");
      img.src = asset.imageUrl;
      img.alt = asset.label;
      b.appendChild(img);
      b.addEventListener("click", () => addSticker(asset));
      host.stickerTray.appendChild(b);
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const s = stickers.find((x) => x.id === selectedId);
    if (!s || !gesture || gesture.id !== s.id) return;

    const rect = host.stage.getBoundingClientRect();

    if (gesture.kind === "drag" && pointers.size === 1) {
      const dx = ((e.clientX - gesture.startX) / rect.width) * 100;
      const dy = ((e.clientY - gesture.startY) / rect.height) * 100;
      s.x = Math.max(5, Math.min(95, gesture.ox + dx));
      s.y = Math.max(5, Math.min(95, gesture.oy + dy));
      applyStickerTransform(s);
    } else if (gesture.kind === "pinch" && pointers.size >= 2) {
      const pts = [...pointers.values()];
      const d = dist(pts[0], pts[1]);
      const a = ang(pts[0], pts[1]);
      if (gesture.startDist > 0) {
        s.scale = Math.max(0.35, Math.min(3, gesture.startScale * (d / gesture.startDist)));
      }
      s.rot = gesture.startRot + (a - gesture.startAngle);
      applyStickerTransform(s);
    }
  }

  function onPointerUp(e: PointerEvent) {
    pointers.delete(e.pointerId);
    try {
      (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    if (pointers.size === 0) {
      gesture = null;
      return;
    }
    if (pointers.size === 1 && selectedId) {
      const s = stickers.find((x) => x.id === selectedId);
      const pt = [...pointers.values()][0];
      if (s && pt) {
        gesture = { kind: "drag", id: s.id, ox: s.x, oy: s.y, startX: pt.x, startY: pt.y };
      }
    }
  }

  function bindStickerGestures(s: StickerEl) {
    const el = s.el;
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectSticker(s.id);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture(e.pointerId);

      if (pointers.size === 1) {
        gesture = {
          kind: "drag",
          id: s.id,
          ox: s.x,
          oy: s.y,
          startX: e.clientX,
          startY: e.clientY,
        };
      } else if (pointers.size === 2) {
        const pts = [...pointers.values()];
        gesture = {
          kind: "pinch",
          id: s.id,
          startDist: dist(pts[0], pts[1]),
          startAngle: ang(pts[0], pts[1]),
          startScale: s.scale,
          startRot: s.rot,
        };
      }
    });
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
  }

  function addSticker(asset: PinboardPhotoStickerAsset) {
    const id = crypto.randomUUID();
    const el = document.createElement("div");
    el.className = "pin-photo-sticker";
    const img = document.createElement("img");
    img.src = asset.imageUrl;
    img.alt = asset.label;
    img.draggable = false;
    el.appendChild(img);

    const s: StickerEl = {
      id,
      assetId: asset.id,
      el,
      x: 50 + (Math.random() * 16 - 8),
      y: 50 + (Math.random() * 16 - 8),
      rot: Math.round(Math.random() * 24 - 12),
      scale: 1,
    };
    applyStickerTransform(s);
    bindStickerGestures(s);
    stickers.push(s);
    host.stickerLayer.appendChild(el);
    selectSticker(id);
  }

  function clearStickers() {
    stickers.length = 0;
    host.stickerLayer.innerHTML = "";
    selectedId = null;
  }

  host.stage.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest(".pin-photo-sticker")) return;
    if (selectedId && stickers.some((s) => s.id === selectedId)) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const s = stickers.find((x) => x.id === selectedId)!;
        const pts = [...pointers.values()];
        gesture = {
          kind: "pinch",
          id: s.id,
          startDist: dist(pts[0], pts[1]),
          startAngle: ang(pts[0], pts[1]),
          startScale: s.scale,
          startRot: s.rot,
        };
      }
      return;
    }
    selectSticker(null);
  });

  host.stage.addEventListener("pointermove", onPointerMove);
  host.stage.addEventListener("pointerup", onPointerUp);
  host.stage.addEventListener("pointercancel", onPointerUp);

  async function finish(): Promise<PhotoEditResult | null> {
    setErr("");
    const frame = frameId ? frames.find((f) => f.id === frameId) : null;
    const stickerState: PinboardPhotoEditorSticker[] = stickers.map((s) => ({
      id: s.id,
      assetId: s.assetId,
      x: s.x,
      y: s.y,
      rot: s.rot,
      scale: s.scale,
    }));

    try {
      const compositeDataUrl = await flattenPhotoEdit({
        photoDataUrl,
        frame: frame?.imageUrl ? frame : null,
        stickers: stickerState,
        stickerAssets,
      });
      return {
        rawDataUrl: photoDataUrl,
        compositeDataUrl,
        frameId,
        stickers: stickerState,
      };
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save photo");
      return null;
    }
  }

  return {
    open(dataUrl: string) {
      photoDataUrl = dataUrl;
      host.photoLayer.style.backgroundImage = `url(${dataUrl})`;
      clearStickers();
      frameId = frames.some((f) => f.id === "none") ? null : (frames[0]?.id ?? null);
      renderFramePicker();
      renderStickerTray();
      updateFrameLayer();
      setErr("");
      host.root.hidden = false;
    },
    close() {
      host.root.hidden = true;
    },
    async submit() {
      const result = await finish();
      if (result) host.onDone(result);
    },
    back() {
      host.onBack();
    },
  };
}
