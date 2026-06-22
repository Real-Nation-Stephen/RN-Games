import {
  RUNNER_LANDSCAPE_H,
  RUNNER_LANDSCAPE_W,
  RUNNER_PORTRAIT_H,
  RUNNER_PORTRAIT_W,
} from "@rngames/shared";
import type { RunnerOrientation } from "./types";

const RUNNER_BANNER_H = 132;
const RUNNER_HUD_TOP = 156;

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
    hudTop: RUNNER_HUD_TOP,
  };
}

export function layoutRunnerHud(hud: HTMLElement) {
  const { scale, offsetY } = getRunnerLayoutMetrics();
  hud.style.top = `${offsetY + RUNNER_HUD_TOP * scale}px`;
  hud.style.setProperty("--runner-hud-scale", String(scale));
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

export function pickRunnerOrientation(): RunnerOrientation {
  return window.innerWidth < 768 ? "portrait" : "landscape";
}

export function isTabletViewport() {
  const w = window.innerWidth;
  return w >= 768 && w < 1200;
}

export function needsLandscapeLock(orientation: RunnerOrientation) {
  return isTabletViewport() && orientation === "portrait";
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

export function bindRunnerLayout(fit: HTMLElement, stage: HTMLElement, hud?: HTMLElement | null) {
  const run = () => {
    layoutRunnerStage(fit, stage, pickRunnerOrientation());
    if (hud) layoutRunnerHud(hud);
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
