import type { PinboardStickyAsset } from "./types";

/** Composite sticky PNG + text/drawing into one data URL for the board. */
export async function renderStickyNote(opts: {
  sticky: PinboardStickyAsset;
  text?: string;
  drawDataUrl?: string;
  mode: "type" | "draw";
}): Promise<string> {
  const size = 560;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  const bg = await loadImage(opts.sticky.imageUrl);
  ctx.drawImage(bg, 0, 0, size, size);

  if (opts.mode === "draw" && opts.drawDataUrl) {
    const draw = await loadImage(opts.drawDataUrl);
    ctx.drawImage(draw, 0, 0, size, size);
  } else if (opts.text?.trim()) {
    ctx.fillStyle = "#1a1a1a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fontSize = Math.max(22, Math.min(36, Math.floor(420 / Math.max(1, opts.text.length / 3))));
    ctx.font = `600 ${fontSize}px PinBody, system-ui, sans-serif`;
    wrapText(ctx, opts.text.trim(), size / 2, size / 2, size * 0.72, fontSize * 1.35);
  }

  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load sticky image"));
    img.src = src;
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const totalH = lines.length * lineHeight;
  let yy = y - totalH / 2 + lineHeight / 2;
  for (const ln of lines) {
    ctx.fillText(ln, x, yy);
    yy += lineHeight;
  }
}
