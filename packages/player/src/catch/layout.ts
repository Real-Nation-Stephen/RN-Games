import { CATCH_DESIGN_H, CATCH_DESIGN_W } from "@rngames/shared";

let catchScale = 1;

export function getCatchScale() {
  return catchScale;
}

/** Scale the design stage to fit the viewport (contain — never overflow). */
export function layoutCatchStage(
  fit: HTMLElement,
  stage: HTMLElement,
  designW = CATCH_DESIGN_W,
  designH = CATCH_DESIGN_H,
) {
  const vw = Math.max(1, window.innerWidth);
  const vh = Math.max(1, window.innerHeight);
  const scaleW = vw / designW;
  const scaleH = vh / designH;
  catchScale = Math.min(scaleW, scaleH);
  stage.style.transformOrigin = "0 0";
  stage.style.transform = `scale(${catchScale})`;
  stage.style.width = `${designW}px`;
  stage.style.height = `${designH}px`;
  fit.style.width = `${designW * catchScale}px`;
  fit.style.height = `${designH * catchScale}px`;
}

export function bindCatchLayout(fit: HTMLElement, stage: HTMLElement) {
  const run = () => layoutCatchStage(fit, stage);
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
