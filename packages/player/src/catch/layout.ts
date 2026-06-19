import { CATCH_DESIGN_H, CATCH_DESIGN_W } from "@rngames/shared";

let catchScale = 1;

export function getCatchScale() {
  return catchScale;
}

/** Wide viewports fill width; portrait/mobile contain within the viewport. */
export function layoutCatchStage(
  root: HTMLElement,
  designW = CATCH_DESIGN_W,
  designH = CATCH_DESIGN_H,
) {
  const vw = Math.max(1, window.innerWidth);
  const vh = Math.max(1, window.innerHeight);
  const scaleW = vw / designW;
  const scaleH = vh / designH;
  const fillWidth = vw >= 768 && vw / vh >= designW / designH;
  catchScale = fillWidth ? scaleW : Math.min(scaleW, scaleH);
  root.style.setProperty("--catch-scale", String(catchScale));
  root.style.setProperty("--catch-design-w", String(designW));
  root.style.setProperty("--catch-design-h", String(designH));
}

export function bindCatchLayout(root: HTMLElement = document.documentElement) {
  const run = () => layoutCatchStage(root);
  run();
  window.addEventListener("resize", run);
  return () => window.removeEventListener("resize", run);
}

export function pointerToStageX(clientX: number, fitEl: HTMLElement): number {
  const rect = fitEl.getBoundingClientRect();
  const scale = catchScale || 1;
  const x = (clientX - rect.left) / scale;
  return Math.max(0, Math.min(CATCH_DESIGN_W, x));
}
