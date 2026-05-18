import type { PinboardFrameAsset, PinboardPhotoEditorSticker, PinboardPhotoStickerAsset } from "./types";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

export interface FlattenPhotoOpts {
  photoDataUrl: string;
  frame: PinboardFrameAsset | null;
  stickers: PinboardPhotoEditorSticker[];
  stickerAssets: PinboardPhotoStickerAsset[];
  /** Output long edge px */
  maxSize?: number;
}

/**
 * Bake photo + optional frame overlay + stickers into one PNG data URL.
 */
export async function flattenPhotoEdit(opts: FlattenPhotoOpts): Promise<string> {
  const maxSize = opts.maxSize ?? 1200;
  const photo = await loadImage(opts.photoDataUrl);

  const aspect = photo.width / photo.height;
  let w: number;
  let h: number;
  if (photo.width >= photo.height) {
    w = Math.min(maxSize, photo.width);
    h = Math.round(w / aspect);
  } else {
    h = Math.min(maxSize, photo.height);
    w = Math.round(h * aspect);
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.drawImage(photo, 0, 0, w, h);

  if (opts.frame?.imageUrl) {
    const frame = await loadImage(opts.frame.imageUrl);
    ctx.drawImage(frame, 0, 0, w, h);
  }

  for (const st of opts.stickers) {
    const asset = opts.stickerAssets.find((a) => a.id === st.assetId);
    if (!asset) continue;
    const img = await loadImage(asset.imageUrl);
    const base = Math.min(w, h) * 0.22 * st.scale;
    const sw = base * (img.width / img.height);
    const sh = base;
    const cx = (st.x / 100) * w;
    const cy = (st.y / 100) * h;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((st.rot * Math.PI) / 180);
    ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
    ctx.restore();
  }

  return canvas.toDataURL("image/jpeg", 0.9);
}
