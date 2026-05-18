import type { PinboardConfig, PinboardSubmission } from "./types";

/** Resolve image URL and CSS classes for an approved photo on the live board. */
export function resolveBoardPhoto(sub: PinboardSubmission, cfg: PinboardConfig) {
  const mode = cfg.mobile.photoPublishMode ?? "user_choice";
  const src =
    mode === "raw" && sub.photoRawDataUrl
      ? sub.photoRawDataUrl
      : sub.imageDataUrl || sub.photoRawDataUrl || "";

  let polaroid = false;
  let frameOverlayUrl = "";

  if (sub.type !== "photo") {
    return { src, polaroid: false, frameOverlayUrl: "" };
  }

  if (mode === "raw") {
    return { src, polaroid: false, frameOverlayUrl: "" };
  }

  if (mode === "uniform_frame") {
    const fid = cfg.mobile.uniformFrameId;
    const frame = fid ? cfg.mobile.photoFrames?.find((f) => f.id === fid) : null;
    if (frame?.imageUrl) {
      return {
        src: sub.photoRawDataUrl || sub.imageDataUrl || src,
        polaroid: false,
        frameOverlayUrl: frame.imageUrl,
      };
    }
    return {
      src: sub.photoRawDataUrl || sub.imageDataUrl || src,
      polaroid: cfg.board.polaroidFrames,
      frameOverlayUrl: "",
    };
  }

  return { src, polaroid: false, frameOverlayUrl: "" };
}
