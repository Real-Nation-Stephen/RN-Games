import type { CatchRecord } from "@rngames/shared";

export type CatchConfig = Pick<
  CatchRecord,
  | "gameType"
  | "id"
  | "title"
  | "slug"
  | "faviconUrl"
  | "showPoweredBy"
  | "backgroundHex"
  | "backgrounds"
  | "banner"
  | "sprites"
  | "catcherSpriteUrl"
  | "sounds"
  | "fonts"
  | "fontUploads"
  | "hud"
  | "gameplay"
  | "intro"
  | "endScreen"
  | "highScore"
  | "linkedLeaderboardSlug"
>;

export type CatchGameState = "idle" | "countdown" | "playing" | "ended";

export interface FallingItem {
  id: number;
  x: number;
  y: number;
  kind: "positive" | "negative";
  rotation: number;
  rotSpeed: number;
  size: number;
}
