import {
  RUNNER_LANDSCAPE_H,
  RUNNER_LANDSCAPE_W,
  RUNNER_PORTRAIT_H,
  RUNNER_PORTRAIT_W,
} from "@rngames/shared";
import type { RunnerOrientation } from "./types";

export const RUNNER_BANNER_H = 132;
const HUD_BELOW_BANNER_GAP = 20;
/** In-canvas gameplay zoom on mobile portrait (1 = full size). Not a viewport letterbox. */
const MOBILE_SCENE_SCALE = 0.9;

let runnerScale = 1;
let runnerOffsetX = 0;
let runnerOffsetY = 0;
let runnerDesignW = RUNNER_PORTRAIT_W;
let runnerDesignH = RUNNER_PORTRAIT_H;
let unbindViewport: (() => void) | null = null;

export function getRunnerScale() {
  return runnerScale;
}

export function getRunnerLayoutMetrics() {
  return {
    scale: runnerScale,
    offsetX: runnerOffsetX,
    offsetY: runnerOffsetY,
    designW: runnerDesignW,
    designH: runnerDesignH,
    bannerH: RUNNER_BANNER_H,
    hudTop: RUNNER_BANNER_H + HUD_BELOW_BANNER_GAP,
  };
}

export function getRunnerSceneScale() {
  return isMobilePortrait() ? MOBILE_SCENE_SCALE : 1;
}

/** Extra horizontal draw area so scaled gameplay still covers the canvas sides. */
export function getRunnerSceneStripBleed(designW: number, designH: number) {
  const sceneScale = getRunnerSceneScale();
  if (sceneScale >= 1) return { x: 0, width: designW };
  const extra = 1 / sceneScale - 1;
  const padX = (designW * extra) / 2;
  return { x: -padX, width: designW + padX * 2 };
}

export function layoutRunnerHud(hud: HTMLElement) {
  const { scale, offsetY } = getRunnerLayoutMetrics();
  const bannerTop = Math.max(0, offsetY);
  const hudTop = bannerTop + (RUNNER_BANNER_H + HUD_BELOW_BANNER_GAP) * scale;
  hud.style.top = `${hudTop}px`;
  hud.style.setProperty("--runner-hud-scale", String(scale));
}

export function layoutRunnerBanner(banner: HTMLElement) {
  const { scale, offsetY } = getRunnerLayoutMetrics();
  const top = Math.max(0, offsetY);
  banner.style.top = `${top}px`;
  banner.style.height = `${RUNNER_BANNER_H * scale}px`;
  banner.style.setProperty("--runner-banner-scale", String(scale));
}

export function getRunnerDesignSize() {
  return { w: runnerDesignW, h: runnerDesignH };
}

function viewportSize() {
  const vv = window.visualViewport;
  return {
    w: Math.max(1, vv?.width ?? window.innerWidth),
    h: Math.max(1, vv?.height ?? window.innerHeight),
  };
}

export function isMobilePortrait() {
  const { w, h } = viewportSize();
  return h > w && w < 768;
}

export function pickRunnerOrientation(): RunnerOrientation {
  const { w, h } = viewportSize();
  return h > w ? "portrait" : "landscape";
}

export function isTabletViewport() {
  const w = window.innerWidth;
  return w >= 768 && w < 1200;
}

export function needsLandscapeLock(_orientation: RunnerOrientation) {
  return false;
}

export function getRunnerVisibleDesignInset() {
  const { scale, offsetX, designW } = getRunnerLayoutMetrics();
  const { w: vw } = viewportSize();
  const left = Math.max(0, -offsetX / scale);
  const right = Math.min(designW, left + vw / scale);
  return { left, right, width: right - left };
}

export function layoutRunnerStage(
  fit: HTMLElement,
  stage: HTMLElement,
  orientation: RunnerOrientation = pickRunnerOrientation(),
) {
  runnerDesignW = orientation === "portrait" ? RUNNER_PORTRAIT_W : RUNNER_LANDSCAPE_W;
  runnerDesignH = orientation === "portrait" ? RUNNER_PORTRAIT_H : RUNNER_LANDSCAPE_H;
  const { w: vw, h: vh } = viewportSize();
  const scaleW = vw / runnerDesignW;
  const scaleH = vh / runnerDesignH;
  runnerScale = Math.max(scaleW, scaleH);
  const scaledW = runnerDesignW * runnerScale;
  const scaledH = runnerDesignH * runnerScale;
  const offsetX = (vw - scaledW) / 2;
  const offsetY = (vh - scaledH) / 2;
  runnerOffsetX = offsetX;
  runnerOffsetY = offsetY;
  fit.style.width = `${vw}px`;
  fit.style.height = `${vh}px`;
  stage.style.transformOrigin = "0 0";
  stage.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${runnerScale})`;
  stage.style.width = `${runnerDesignW}px`;
  stage.style.height = `${runnerDesignH}px`;
  stage.style.left = "0";
  stage.style.top = "0";
}

export function bindRunnerLayout(
  fit: HTMLElement,
  stage: HTMLElement,
  hud?: HTMLElement | null,
  banner?: HTMLElement | null,
) {
  const run = () => {
    layoutRunnerStage(fit, stage, pickRunnerOrientation());
    if (hud) layoutRunnerHud(hud);
    if (banner) layoutRunnerBanner(banner);
  };
  run();
  window.addEventListener("resize", run);
  window.addEventListener("orientationchange", run);
  const vv = window.visualViewport;
  vv?.addEventListener("resize", run);
  vv?.addEventListener("scroll", run);
  unbindViewport?.();
  unbindViewport = () => {
    window.removeEventListener("resize", run);
    window.removeEventListener("orientationchange", run);
    vv?.removeEventListener("resize", run);
    vv?.removeEventListener("scroll", run);
  };
  return () => {
    unbindViewport?.();
    unbindViewport = null;
  };
}
