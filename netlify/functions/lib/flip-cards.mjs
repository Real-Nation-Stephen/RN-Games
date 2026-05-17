/** Card back-face image URL (canonical `rearImage`; legacy `backImage` still read). */
export function flipCardRearUrl(c) {
  if (!c || typeof c !== "object") return "";
  return String(c.rearImage || c.backImage || "").trim();
}

/** Shared back-face fallback for the deck. */
export function flipCardSharedRearUrl(f) {
  if (!f || typeof f !== "object") return "";
  return String(f.sharedRearImage || f.sharedBackImage || "").trim();
}

/** Normalize one card face for storage / API responses. */
export function normalizeFlipCardFace(c, i) {
  const rear = flipCardRearUrl(c);
  return {
    frontImage: String(c?.frontImage || "").trim(),
    rearImage: rear,
    backImage: rear,
    header: String(c?.header || `Card ${i + 1}`).trim() || `Card ${i + 1}`,
    body: String(c?.body || ""),
    overlayButtonText: String(c?.overlayButtonText || "Back").trim() || "Back",
    soundUrl: String(c?.soundUrl || "").trim(),
  };
}
