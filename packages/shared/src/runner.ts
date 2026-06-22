/** Runner arcade game — shared record shape (keep in sync with lib/runner.mjs). */

import type { HighScoreSettings } from "./leaderboard.js";

export const RUNNER_PORTRAIT_W = 1080;
export const RUNNER_PORTRAIT_H = 1920;
export const RUNNER_LANDSCAPE_W = 1920;
export const RUNNER_LANDSCAPE_H = 1080;

export const RUNNER_MAX_PARALLAX_LAYERS = 5;
export const RUNNER_MAX_SPRITE_CELL = 512;
export const RUNNER_MAX_SHEET_FRAMES = 32;

export const RUNNER_BG_SIZE_HINTS = {
  desktop: "1920×1080 landscape — background covers viewport",
  tablet: "1920×1080 landscape — background covers viewport",
  mobile: "1080×1920 portrait — background covers viewport",
} as const;

export type RunnerLogoAlign = "left" | "center" | "right";
export type RunnerBreakpointBg = { desktop: string; tablet: string; mobile: string };
export type RunnerHudSlotKind = "none" | "timer" | "health" | "score";
export type RunnerHealthDisplay = "hearts" | "bar";
export type RunnerLeaderboardMetric = "points" | "time" | "distance";
export type RunnerRespawnMode = "respawn" | "endOnZero";

export interface RunnerBanner {
  backgroundHex: string;
  logoUrl: string;
  logoAlign: RunnerLogoAlign;
}

export interface RunnerSpriteSheet {
  url: string;
  cellWidth: number;
  cellHeight: number;
}

export interface RunnerCharacter {
  run: RunnerSpriteSheet;
  jump: RunnerSpriteSheet;
  death: RunnerSpriteSheet;
  width: number;
  height: number;
  /** Feet baseline Y in design space */
  groundY: number;
  jumpHeight: number;
}

export interface RunnerItemEffects {
  addHealth: boolean;
  addPoints: boolean;
  addTime: boolean;
  removeHealth: boolean;
  removePoints: boolean;
  removeTime: boolean;
  healthAmount: number;
  pointsAmount: number;
  timeAmount: number;
}

export interface RunnerItemVariant {
  id: string;
  url: string;
  width: number;
  height: number;
  y: number;
  effects: RunnerItemEffects;
}

export interface RunnerItems {
  positive: RunnerItemVariant[];
  negative: RunnerItemVariant[];
}

export interface RunnerParallaxLayer {
  id: string;
  url: string;
  speed: number;
  /** Top Y in authoring coordinates (scaled per device). */
  y: number;
  /** Scale offset %: 0 = 100%, -50 = half, 50 = 150%. Width follows aspect ratio. */
  height: number;
}

export interface RunnerGround {
  enabled: boolean;
  url: string;
  y: number;
  height: number;
}

export interface RunnerHudSlots {
  left: RunnerHudSlotKind;
  center: RunnerHudSlotKind;
  right: RunnerHudSlotKind;
}

export interface RunnerHud {
  slots: RunnerHudSlots;
  scoreHex: string;
  timerHex: string;
  healthHex: string;
  healthEmptyHex: string;
  labelHex: string;
  healthDisplay: RunnerHealthDisplay;
}

export interface RunnerFeedback {
  damageFlashEnabled: boolean;
  damageFlashHex: string;
  pickupGlowHex: string;
}

export interface RunnerSounds {
  positiveItem: string | null;
  negativeItem: string | null;
  gameEnd: string | null;
  music: string | null;
  musicVolume: number;
}

export interface RunnerFonts {
  heading: string;
  body: string;
  score: string;
}

export interface RunnerFontUpload {
  url: string;
  family: string;
}

export interface RunnerGameplay {
  timerEnabled: boolean;
  durationSec: number;
  maxHealth: number;
  scrollSpeedStart: number;
  scrollSpeedEnd: number;
  spawnIntervalStartMs: number;
  spawnIntervalEndMs: number;
  positivePercentStart: number;
  positivePercentEnd: number;
  respawnMode: RunnerRespawnMode;
  /** Extra attempts after the first run (0 = single attempt). */
  maxRespawns: number;
  leaderboardMetric: RunnerLeaderboardMetric;
  jumpHintText: string;
}

export interface RunnerIntro {
  positiveLine: string;
  negativeLine: string;
  nextLabel: string;
  /** Label after +N on intro for point pickups, e.g. "Pts", "Coins". */
  pointsLabel: string;
}

export interface RunnerEndScreen {
  logoUrl: string;
  headline: string;
  subhead: string;
  scorePrefix: string;
  playAgainLabel: string;
  buttonHex: string;
  buttonTextHex: string;
  textHex: string;
  headlineHex: string;
  subheadHex: string;
  backgrounds: RunnerBreakpointBg;
  /** Tint over frozen game on end screen (fades in after damage flash). */
  overlayHex: string;
  linkEnabled: boolean;
  linkLabel: string;
  linkUrl: string;
  linkButtonHex: string;
  linkButtonTextHex: string;
}

export interface RunnerRecord {
  id: string;
  gameType: "runner";
  title: string;
  clientName: string;
  slug: string;
  updatedAt: string;
  reportingEnabled: boolean;
  reportingLockedAt?: string | null;
  thumbnailUrl?: string;
  faviconUrl?: string;
  reportingSheetTab?: string;
  showPoweredBy?: boolean;
  backgroundHex: string;
  backgrounds: RunnerBreakpointBg;
  banner: RunnerBanner;
  character: RunnerCharacter;
  items: RunnerItems;
  parallax: RunnerParallaxLayer[];
  ground: RunnerGround;
  sounds: RunnerSounds;
  fonts: RunnerFonts;
  fontUploads: Record<string, RunnerFontUpload>;
  hud: RunnerHud;
  feedback: RunnerFeedback;
  gameplay: RunnerGameplay;
  intro: RunnerIntro;
  endScreen: RunnerEndScreen;
  highScore: HighScoreSettings;
  linkedLeaderboardSlug: string;
}

export function emptyRunnerItemEffects(negative = false): RunnerItemEffects {
  return negative
    ? {
        addHealth: false,
        addPoints: false,
        addTime: false,
        removeHealth: true,
        removePoints: false,
        removeTime: false,
        healthAmount: 1,
        pointsAmount: 1,
        timeAmount: 1,
      }
    : {
        addHealth: false,
        addPoints: true,
        addTime: false,
        removeHealth: false,
        removePoints: false,
        removeTime: false,
        healthAmount: 1,
        pointsAmount: 1,
        timeAmount: 1,
      };
}

export function normalizeRunnerItemVariants(raw: unknown, negative = false): RunnerItemVariant[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: RunnerItemVariant[] = [];
  for (let i = 0; i < list.length; i++) {
    const v = list[i] as Partial<RunnerItemVariant> & { points?: number };
    if (!v || typeof v !== "object") continue;
    const url = String(v.url || "").trim();
    if (!url) continue;
    const fx = { ...emptyRunnerItemEffects(negative), ...(v.effects || {}) };
    fx.healthAmount = Math.max(1, Math.min(10, Number(fx.healthAmount) || 1));
    fx.pointsAmount = Math.max(1, Math.min(99, Number(fx.pointsAmount) || 1));
    fx.timeAmount = Math.max(1, Math.min(60, Number(fx.timeAmount) || 1));
    out.push({
      id: String(v.id || `v${i + 1}`),
      url,
      width: Math.max(24, Math.min(320, Number(v.width) || 72)),
      height: Math.max(24, Math.min(320, Number(v.height) || 72)),
      y: Math.max(0, Math.min(2000, Number(v.y) || 0)),
      effects: fx,
    });
  }
  return out;
}

export function normalizeRunnerItems(raw: Partial<RunnerItems> = {}): RunnerItems {
  return {
    positive: normalizeRunnerItemVariants(raw.positive, false),
    negative: normalizeRunnerItemVariants(raw.negative, true),
  };
}

function emptySpriteSheet(): RunnerSpriteSheet {
  return { url: "", cellWidth: 64, cellHeight: 64 };
}

export function emptyRunner(partial: { id: string; slug: string }): RunnerRecord {
  return {
    id: partial.id,
    gameType: "runner",
    title: "Untitled runner game",
    clientName: "",
    slug: partial.slug,
    updatedAt: new Date().toISOString(),
    reportingEnabled: false,
    reportingLockedAt: null,
    thumbnailUrl: "",
    faviconUrl: "",
    reportingSheetTab: "",
    showPoweredBy: true,
    backgroundHex: "#87c38f",
    backgrounds: { desktop: "", tablet: "", mobile: "" },
    banner: { backgroundHex: "#5a8f62", logoUrl: "", logoAlign: "center" },
    character: {
      run: emptySpriteSheet(),
      jump: emptySpriteSheet(),
      death: emptySpriteSheet(),
      width: 96,
      height: 96,
      groundY: 980,
      jumpHeight: 280,
    },
    items: { positive: [], negative: [] },
    parallax: [],
    ground: { enabled: false, url: "", y: 980, height: 48 },
    sounds: {
      positiveItem: null,
      negativeItem: null,
      gameEnd: null,
      music: null,
      musicVolume: 0.35,
    },
    fonts: { heading: "", body: "", score: "" },
    fontUploads: {},
    hud: {
      slots: { left: "score", center: "none", right: "health" },
      scoreHex: "#ffffff",
      timerHex: "#ffffff",
      healthHex: "#ff6b6b",
      healthEmptyHex: "#4a4a4a",
      labelHex: "#e8f5e9",
      healthDisplay: "hearts",
    },
    feedback: { damageFlashEnabled: true, damageFlashHex: "#ff4444", pickupGlowHex: "#ffe066" },
    gameplay: {
      timerEnabled: false,
      durationSec: 60,
      maxHealth: 3,
      scrollSpeedStart: 320,
      scrollSpeedEnd: 520,
      spawnIntervalStartMs: 1800,
      spawnIntervalEndMs: 900,
      positivePercentStart: 40,
      positivePercentEnd: 20,
      respawnMode: "respawn",
      maxRespawns: 2,
      leaderboardMetric: "points",
      jumpHintText: "Tap or press A to jump",
    },
    intro: {
      positiveLine: "Collect these for bonuses",
      negativeLine: "Avoid these obstacles",
      nextLabel: "Next",
      pointsLabel: "Pts",
    },
    endScreen: {
      logoUrl: "",
      headline: "Run complete!",
      subhead: "Nice run.",
      scorePrefix: "Score:",
      playAgainLabel: "Play again",
      buttonHex: "#2d6a4f",
      buttonTextHex: "#ffffff",
      textHex: "#eef2f7",
      headlineHex: "#ffffff",
      subheadHex: "#c8d4e0",
      backgrounds: { desktop: "", tablet: "", mobile: "" },
      overlayHex: "rgba(8, 14, 22, 0.88)",
      linkEnabled: false,
      linkLabel: "Learn more",
      linkUrl: "",
      linkButtonHex: "#1e81ff",
      linkButtonTextHex: "#ffffff",
    },
    highScore: { enabled: false, nameMaxLength: 3 },
    linkedLeaderboardSlug: "",
  };
}

export function normalizeRunner(doc: Partial<RunnerRecord> & { id: string; slug: string }): RunnerRecord {
  const defaults = emptyRunner({ id: doc.id, slug: doc.slug });
  const g = { ...defaults.gameplay, ...(doc.gameplay || {}) };
  g.timerEnabled = g.timerEnabled === true;
  g.durationSec = Math.min(300, Math.max(10, Number(g.durationSec) || 60));
  g.maxHealth = Math.min(10, Math.max(1, Number(g.maxHealth) || 3));
  g.scrollSpeedStart = Math.max(80, Number(g.scrollSpeedStart) || 320);
  g.scrollSpeedEnd = Math.max(g.scrollSpeedStart, Number(g.scrollSpeedEnd) || 520);
  g.spawnIntervalStartMs = Math.max(400, Math.min(4000, Number(g.spawnIntervalStartMs) || 1800));
  g.spawnIntervalEndMs = Math.max(400, Math.min(4000, Number(g.spawnIntervalEndMs) || 900));
  g.positivePercentStart = Math.max(0, Math.min(100, Number(g.positivePercentStart ?? 40)));
  g.positivePercentEnd = Math.max(0, Math.min(100, Number(g.positivePercentEnd ?? 20)));
  g.respawnMode = g.respawnMode === "endOnZero" ? "endOnZero" : "respawn";
  g.maxRespawns = Math.min(10, Math.max(0, Number(g.maxRespawns) || 0));
  g.leaderboardMetric =
    g.leaderboardMetric === "time" || g.leaderboardMetric === "distance" ? g.leaderboardMetric : "points";

  const slots = { ...defaults.hud.slots, ...(doc.hud?.slots || {}) };
  const slotKind = (v: unknown): RunnerHudSlotKind =>
    v === "timer" || v === "health" || v === "score" ? v : v === "none" ? "none" : "none";
  slots.left = slotKind(slots.left);
  slots.center = slotKind(slots.center);
  slots.right = slotKind(slots.right);

  const char = { ...defaults.character, ...(doc.character || {}) };
  char.run = { ...defaults.character.run, ...(char.run || {}) };
  char.jump = { ...defaults.character.jump, ...(char.jump || {}) };
  char.death = { ...defaults.character.death, ...(char.death || {}) };
  char.run.cellWidth = Math.max(8, Math.min(RUNNER_MAX_SPRITE_CELL, Number(char.run.cellWidth) || 64));
  char.run.cellHeight = Math.max(8, Math.min(RUNNER_MAX_SPRITE_CELL, Number(char.run.cellHeight) || 64));
  char.jump.cellWidth = Math.max(8, Math.min(RUNNER_MAX_SPRITE_CELL, Number(char.jump.cellWidth) || char.run.cellWidth));
  char.jump.cellHeight = Math.max(8, Math.min(RUNNER_MAX_SPRITE_CELL, Number(char.jump.cellHeight) || char.run.cellHeight));
  char.death.cellWidth = Math.max(8, Math.min(RUNNER_MAX_SPRITE_CELL, Number(char.death.cellWidth) || char.run.cellWidth));
  char.death.cellHeight = Math.max(8, Math.min(RUNNER_MAX_SPRITE_CELL, Number(char.death.cellHeight) || char.run.cellHeight));
  char.width = Math.max(32, Math.min(240, Number(char.width) || 96));
  char.height = Math.max(32, Math.min(240, Number(char.height) || 96));
  char.groundY = Math.max(100, Math.min(1900, Number(char.groundY) || defaults.character.groundY));
  char.jumpHeight = Math.max(40, Math.min(600, Number(char.jumpHeight) || 280));

  const parallax = (Array.isArray(doc.parallax) ? doc.parallax : [])
    .slice(0, RUNNER_MAX_PARALLAX_LAYERS)
    .map((layer, i) => {
      const l = layer as Partial<RunnerParallaxLayer>;
      return {
        id: String(l.id || `p${i + 1}`),
        url: String(l.url || "").trim(),
        speed: Math.max(0.1, Math.min(2, Number(l.speed) || 0.5)),
        y: Math.max(0, Math.min(2000, Number(l.y) || 0)),
        height: Math.max(-99, Math.min(200, Number(l.height) || 0)),
      };
    })
    .filter((l) => l.url);

  const banner = { ...defaults.banner, ...(doc.banner || {}) };
  const align = String(banner.logoAlign || "center");
  banner.logoAlign = align === "left" || align === "right" ? align : "center";

  const out: RunnerRecord = {
    ...defaults,
    ...doc,
    gameType: "runner",
    backgrounds: { ...defaults.backgrounds, ...(doc.backgrounds || {}) },
    banner,
    character: char,
    items: normalizeRunnerItems(doc.items),
    parallax,
    ground: { ...defaults.ground, ...(doc.ground || {}) },
    sounds: { ...defaults.sounds, ...(doc.sounds || {}) },
    fonts: { ...defaults.fonts, ...(doc.fonts || {}) },
    fontUploads: { ...(doc.fontUploads || {}) },
    hud: {
      ...defaults.hud,
      ...(doc.hud || {}),
      slots,
      healthDisplay: doc.hud?.healthDisplay === "bar" ? "bar" : "hearts",
    },
    feedback: { ...defaults.feedback, ...(doc.feedback || {}) },
    gameplay: g,
    intro: { ...defaults.intro, ...(doc.intro || {}) },
    endScreen: {
      ...defaults.endScreen,
      ...(doc.endScreen || {}),
      backgrounds: { ...defaults.endScreen.backgrounds, ...(doc.endScreen?.backgrounds || {}) },
    },
    highScore: { ...defaults.highScore, ...(doc.highScore || {}) },
  };
  out.feedback.damageFlashEnabled = out.feedback.damageFlashEnabled !== false;
  out.intro.pointsLabel = String(out.intro.pointsLabel || "Pts").slice(0, 16);
  out.endScreen.overlayHex = String(out.endScreen.overlayHex || defaults.endScreen.overlayHex);
  out.highScore.enabled = out.highScore.enabled === true;
  out.highScore.nameMaxLength = Math.min(32, Math.max(1, Number(out.highScore.nameMaxLength) || 3));
  return out;
}
