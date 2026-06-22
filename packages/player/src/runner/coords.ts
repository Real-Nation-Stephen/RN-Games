import { RUNNER_LANDSCAPE_H, RUNNER_PORTRAIT_H, runnerScaleMultiplier } from "@rngames/shared";
import type { RunnerCharacter } from "@rngames/shared";

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
  return runnerScaleMultiplier(layerHeight);
}

export function runnerCharacterDrawSize(
  char: RunnerCharacter,
  designH: number,
  authorH: number,
) {
  const mult = runnerScaleMultiplier(Number(char.scale) || 0);
  const w = scaleRunnerSize(char.run.cellWidth * mult, designH, authorH);
  const h = scaleRunnerSize(char.run.cellHeight * mult, designH, authorH);
  return { w, h };
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
