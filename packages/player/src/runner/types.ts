import type { RunnerRecord } from "@rngames/shared";

export type RunnerConfig = RunnerRecord & { reportingEnabled?: boolean };

export type RunnerGameState = "idle" | "countdown" | "playing" | "dying" | "ended";

export type RunnerOrientation = "portrait" | "landscape";

export interface RunnerWorldItem {
  id: number;
  kind: "positive" | "negative";
  variantId: string;
  worldX: number;
  y: number;
  width: number;
  height: number;
  effects: RunnerRecord["items"]["positive"][0]["effects"];
}
