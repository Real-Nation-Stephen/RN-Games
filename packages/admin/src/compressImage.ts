/** Stay under Netlify Functions ~6MB JSON body limit after base64 inflation. */
const MAX_OUTPUT_BYTES = 3_200_000;
const MAX_DIMENSION = 1600;

function fileBaseName(name: string) {
  return name.replace(/\.[^.]+$/, "") || "image";
}

function isPngFile(file: File) {
  return file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
}

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

async function encodePngUnderLimit(bitmap: ImageBitmap, baseName: string): Promise<File> {
  let scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));

  for (let attempt = 0; attempt < 10; attempt++) {
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) break;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await canvasToBlob(canvas, "image/png");
    if (blob && blob.size <= MAX_OUTPUT_BYTES) {
      return new File([blob], `${baseName}.png`, { type: "image/png" });
    }
    scale *= 0.82;
  }

  throw new Error(
    `PNG "${baseName}" is too large even after resizing. Try a narrower image or fewer pixels.`,
  );
}

async function encodeJpegUnderLimit(bitmap: ImageBitmap, baseName: string): Promise<File> {
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not prepare image for upload.");
  }
  ctx.drawImage(bitmap, 0, 0, w, h);

  let blob: Blob | null = null;
  for (let q = 0.9; q >= 0.45; q -= 0.08) {
    blob = await canvasToBlob(canvas, "image/jpeg", q);
    if (blob && blob.size <= MAX_OUTPUT_BYTES) break;
  }

  if (!blob) {
    throw new Error(
      `Image "${baseName}" is still too large after compression. Use a smaller file (under ~3MB).`,
    );
  }

  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}

/**
 * Downscale and re-encode photos before upload so /api/upload stays under platform limits.
 * PNG assets keep alpha — never converted to JPEG (which would matte transparency as black).
 */
export async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;
  if (file.type === "image/jpeg" && file.size <= 1_500_000) return file;
  if (isPngFile(file) && file.size <= MAX_OUTPUT_BYTES) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      `Could not read "${file.name}". Try JPEG or PNG under 4MB, or re-export the image.`,
    );
  }

  const baseName = fileBaseName(file.name);
  try {
    if (isPngFile(file)) {
      return await encodePngUnderLimit(bitmap, baseName);
    }
    return await encodeJpegUnderLimit(bitmap, baseName);
  } finally {
    bitmap.close();
  }
}
