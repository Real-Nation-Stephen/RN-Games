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

export function runnerAuthorHeight(cfg: { character: { groundY: number } }) {
  return inferRunnerAuthorHeight(cfg.character.groundY);
}

export function scaledGroundY(cfg: { character: { groundY: number } }, designH: number) {
  const authorH = runnerAuthorHeight(cfg);
  const y = scaleRunnerY(cfg.character.groundY, designH, authorH);
  return Math.min(designH - 24, Math.max(132 + 60, y));
}
