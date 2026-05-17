/** Stay under Netlify Functions ~6MB JSON body limit after base64 inflation. */
const MAX_OUTPUT_BYTES = 3_200_000;
const MAX_DIMENSION = 1600;

/**
 * Downscale and re-encode photos before upload so /api/upload stays under platform limits.
 */
export async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;
  /** Re-encode large photos so base64 JSON stays under the Netlify request cap. */
  if (file.size <= 1_500_000 && file.type === "image/jpeg") return file;
  if (file.size <= MAX_OUTPUT_BYTES && file.type === "image/png") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      `Could not read "${file.name}". Try JPEG or PNG under 4MB, or re-export the image.`,
    );
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Could not prepare image for upload.");
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  let blob: Blob | null = null;
  for (let q = 0.9; q >= 0.45; q -= 0.08) {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", q));
    if (blob && blob.size <= MAX_OUTPUT_BYTES) break;
  }

  if (!blob) {
    throw new Error(
      `Image "${file.name}" is still too large after compression. Use a smaller file (under ~3MB).`,
    );
  }

  const base = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}
