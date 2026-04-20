export function isCompact() {
  return Math.min(window.innerWidth, window.innerHeight) <= 820;
}

export function layoutStage(stage: HTMLElement, fit: HTMLElement, designW = 1920, designH = 1080) {
  const pad = isCompact() ? 10 : 18;
  const vw = window.innerWidth - pad * 2;
  const vh = window.innerHeight - pad * 2;
  const scale = Math.min(vw / designW, vh / designH);
  stage.style.transform = `scale(${scale})`;
  fit.style.width = `${designW * scale}px`;
  fit.style.height = `${designH * scale}px`;
}

