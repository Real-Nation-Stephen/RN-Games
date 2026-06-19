import { CATCH_DESIGN_H, CATCH_DESIGN_W } from "@rngames/shared";

export function layoutFitHeight(
  fit: HTMLElement,
  stage: HTMLElement,
  designW = CATCH_DESIGN_W,
  designH = CATCH_DESIGN_H,
) {
  const pad = 0;
  const vw = Math.max(1, window.innerWidth - pad * 2);
  const vh = Math.max(1, window.innerHeight - pad * 2);
  const scale = vh / designH;
  const scaledW = designW * scale;
  const scaledH = designH * scale;
  stage.style.transform = `scale(${scale})`;
  fit.style.width = `${scaledW}px`;
  fit.style.height = `${scaledH}px`;
  fit.style.marginLeft = scaledW > vw ? `${(vw - scaledW) / 2}px` : "0";
}

export function bindCatchLayout(fit: HTMLElement, stage: HTMLElement) {
  const run = () => layoutFitHeight(fit, stage);
  run();
  window.addEventListener("resize", run);
  return () => window.removeEventListener("resize", run);
}
