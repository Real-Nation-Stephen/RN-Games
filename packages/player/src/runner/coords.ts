import { RUNNER_LANDSCAPE_H, RUNNER_PORTRAIT_H } from "@rngames/shared";

/** Reference height used when authoring Y positions (landscape desktop). */
export const RUNNER_AUTHOR_H = RUNNER_LANDSCAPE_H;

/** Guess whether stored Y values were authored on portrait vs landscape canvas. */
export function inferRunnerAuthorHeight(groundY: number) {
  return groundY > RUNNER_LANDSCAPE_H + 200 ? RUNNER_PORTRAIT_H : RUNNER_LANDSCAPE_H;
}

export function scaleRunnerY(y: number, designH: number, authorH: number) {
  if (!y) return 0;
  return (y / authorH) * designH;
}

export function scaleRunnerSize(size: number, designH: number, authorH: number) {
  if (!size) return 0;
  return (size / authorH) * designH;
}

export function runnerAuthorHeight(groundY: number) {
  return inferRunnerAuthorHeight(groundY);
}

export function scaledGroundY(groundY: number, designH: number) {
  const authorH = runnerAuthorHeight(groundY);
  const y = scaleRunnerY(groundY, designH, authorH);
  return Math.min(designH - 24, Math.max(132 + 60, y));
}

/** Parallax scale: 0 = 100%, -50 = 50%, 50 = 150%, -1 = 99%. */
export function parallaxScaleMultiplier(layerHeight: number) {
  const mult = (100 + layerHeight) / 100;
  return Math.max(0.05, Math.min(3, mult));
}

/** Scaled draw height; width follows image aspect ratio in drawLoopingStrip. */
export function parallaxDrawHeight(
  layerHeight: number,
  naturalH: number,
  designH: number,
  authorH: number,
) {
  const naturalScaled = scaleRunnerSize(naturalH, designH, authorH);
  return naturalScaled * parallaxScaleMultiplier(layerHeight);
}
