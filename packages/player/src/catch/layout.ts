import { CATCH_DESIGN_H, CATCH_DESIGN_W } from "@rngames/shared";

/** Scale the design stage to fit the viewport (wheel-style contain). */
export function layoutScaleToFit(
  fit: HTMLElement,
  stage: HTMLElement,
  designW = CATCH_DESIGN_W,
  designH = CATCH_DESIGN_H,
) {
  const vw = Math.max(1, window.innerWidth);
  const vh = Math.max(1, window.innerHeight);
  const scale = Math.min(vw / designW, vh / designH);
  stage.style.transform = `scale(${scale})`;
  fit.style.width = `${designW * scale}px`;
  fit.style.height = `${designH * scale}px`;
}

export function bindCatchLayout(fit: HTMLElement, stage: HTMLElement) {
  const run = () => layoutScaleToFit(fit, stage);
  run();
  window.addEventListener("resize", run);
  return () => window.removeEventListener("resize", run);
}
