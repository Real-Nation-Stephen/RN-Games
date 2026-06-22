/** Runner arcade game — shared record shape (keep in sync with lib/runner.mjs). */

import type { HighScoreSettings } from "./leaderboard.js";

export const RUNNER_PORTRAIT_W = 1080;
export const RUNNER_PORTRAIT_H = 1920;
export const RUNNER_LANDSCAPE_W = 1920;
export const RUNNER_LANDSCAPE_H = 1080;

export const RUNNER_MAX_PARALLAX_LAYERS = 5;
export const RUNNER_MAX_CHARACTERS = 8;
/** Max sprite cell width (one frame in a horizontal strip). */
export const RUNNER_MAX_SPRITE_CELL_W = 1024;
/** Max sprite cell height (tall single-frame sprites). */
export const RUNNER_MAX_SPRITE_CELL_H = 2048;
/** @deprecated Use RUNNER_MAX_SPRITE_CELL_W */
export const RUNNER_MAX_SPRITE_CELL = RUNNER_MAX_SPRITE_CELL_W;
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
  id: string;
  label: string;
  run: RunnerSpriteSheet;
  jump: RunnerSpriteSheet;
  death: RunnerSpriteSheet;
  /** Scale offset %: 0 = 100%, -50 = half, 50 = 150%. Draw size follows run sprite cell aspect. */
  scale: number;
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
  /** When true, draws above player, items, and ground. */
  renderInFront: boolean;
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
  /** Playable characters (1–8). Use characters[0] via `character` for legacy tools. */
  characters: RunnerCharacter[];
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

export function emptyRunnerCharacter(partial?: Partial<RunnerCharacter> & { id?: string; label?: string }): RunnerCharacter {
  const run = emptySpriteSheet();
  const jump = emptySpriteSheet();
  const death = emptySpriteSheet();
  return {
    id: partial?.id || "c1",
    label: partial?.label || "Character 1",
    scale: 0,
    groundY: 980,
    jumpHeight: 280,
    ...partial,
    run: { ...run, ...(partial?.run || {}) },
    jump: { ...jump, ...(partial?.jump || {}) },
    death: { ...death, ...(partial?.death || {}) },
  };
}

export function normalizeRunnerCharacter(
  raw: Partial<RunnerCharacter> | undefined,
  defaults: RunnerCharacter,
  index: number,
): RunnerCharacter {
  const c = { ...defaults, ...(raw || {}) };
  c.id = String(c.id || `c${index + 1}`);
  c.label = String(c.label || `Character ${index + 1}`).slice(0, 32);
  c.run = { ...defaults.run, ...(c.run || {}) };
  c.jump = { ...defaults.jump, ...(c.jump || {}) };
  c.death = { ...defaults.death, ...(c.death || {}) };
  c.run.cellWidth = Math.max(8, Math.min(RUNNER_MAX_SPRITE_CELL_W, Number(c.run.cellWidth) || 64));
  c.run.cellHeight = Math.max(8, Math.min(RUNNER_MAX_SPRITE_CELL_H, Number(c.run.cellHeight) || 64));
  c.jump.cellWidth = Math.max(8, Math.min(RUNNER_MAX_SPRITE_CELL_W, Number(c.jump.cellWidth) || c.run.cellWidth));
  c.jump.cellHeight = Math.max(8, Math.min(RUNNER_MAX_SPRITE_CELL_H, Number(c.jump.cellHeight) || c.run.cellHeight));
  c.death.cellWidth = Math.max(8, Math.min(RUNNER_MAX_SPRITE_CELL_W, Number(c.death.cellWidth) || c.run.cellWidth));
  c.death.cellHeight = Math.max(8, Math.min(RUNNER_MAX_SPRITE_CELL_H, Number(c.death.cellHeight) || c.run.cellHeight));
  c.scale = normalizeRunnerCharacterScale(c);
  c.groundY = Math.max(100, Math.min(1900, Number(c.groundY) || defaults.groundY));
  c.jumpHeight = Math.max(40, Math.min(600, Number(c.jumpHeight) || 280));
  return c;
}

export function normalizeRunnerCharacters(
  doc: { characters?: RunnerCharacter[]; character?: RunnerCharacter },
  defaultChar: RunnerCharacter,
): RunnerCharacter[] {
  const raw =
    Array.isArray(doc.characters) && doc.characters.length > 0
      ? doc.characters
      : doc.character
        ? [doc.character]
        : [defaultChar];
  return raw
    .slice(0, RUNNER_MAX_CHARACTERS)
    .map((c, i) => normalizeRunnerCharacter(c, defaultChar, i));
}

export function runnerCharacterList(doc: {
  characters?: RunnerCharacter[];
  character?: RunnerCharacter;
}): RunnerCharacter[] {
  if (Array.isArray(doc.characters) && doc.characters.length > 0) return doc.characters;
  if (doc.character) return [doc.character];
  return [];
}

/** Scale multiplier shared by parallax layers and character draw size. */
export function runnerScaleMultiplier(scalePct: number) {
  const mult = (100 + scalePct) / 100;
  return Math.max(0.05, Math.min(3, mult));
}

/** Author-space draw size from run sprite cell dimensions + scale. */
export function runnerCharacterAuthorSize(char: RunnerCharacter) {
  const mult = runnerScaleMultiplier(Number(char.scale) || 0);
  const cellW = Math.max(1, char.run.cellWidth);
  const cellH = Math.max(1, char.run.cellHeight);
  return { width: cellW * mult, height: cellH * mult };
}

function normalizeRunnerCharacterScale(raw: Partial<RunnerCharacter> & { width?: number; height?: number }) {
  if (Number.isFinite(raw.scale)) {
    return Math.max(-99, Math.min(200, Number(raw.scale)));
  }
  const cellH = Math.max(1, Number(raw.run?.cellHeight) || 64);
  const cellW = Math.max(1, Number(raw.run?.cellWidth) || 64);
  const legacyH = Number(raw.height);
  if (Number.isFinite(legacyH) && legacyH > 0) {
    return Math.max(-99, Math.min(200, Math.round((legacyH / cellH - 1) * 100)));
  }
  const legacyW = Number(raw.width);
  if (Number.isFinite(legacyW) && legacyW > 0) {
    return Math.max(-99, Math.min(200, Math.round((legacyW / cellW - 1) * 100)));
  }
  return 0;
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

/** Horizontal strip frame count; single-frame PNGs always return 1. */
export function runnerSheetFrameCount(
  sheet: RunnerSpriteSheet,
  imgW: number,
  imgH: number,
): number {
  if (imgW <= 0 || imgH <= 0) return 1;
  const cellW = Math.max(1, sheet.cellWidth);
  if (imgW <= cellW) return 1;
  return Math.max(1, Math.min(RUNNER_MAX_SHEET_FRAMES, Math.floor(imgW / cellW)));
}

/** Source rect for a frame; uses the full PNG when only one frame. */
export function runnerSheetFrameRect(
  sheet: RunnerSpriteSheet,
  frameIndex: number,
  imgW: number,
  imgH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  if (imgW <= 0 || imgH <= 0) return { sx: 0, sy: 0, sw: 1, sh: 1 };
  const total = runnerSheetFrameCount(sheet, imgW, imgH);
  if (total <= 1) return { sx: 0, sy: 0, sw: imgW, sh: imgH };

  const cellW = Math.max(1, sheet.cellWidth);
  const cellH = Math.max(1, sheet.cellHeight);
  const frame = ((frameIndex % total) + total) % total;
  const sx = frame * cellW;
  return {
    sx,
    sy: 0,
    sw: Math.min(cellW, imgW - sx),
    sh: Math.min(cellH, imgH),
  };
}

/** Default cell size when a sprite PNG is first uploaded. */
export function inferRunnerSpriteSheetCells(imgW: number, imgH: number) {
  if (imgW <= 0 || imgH <= 0) return { cellWidth: 64, cellHeight: 64 };
  return {
    cellWidth: Math.min(RUNNER_MAX_SPRITE_CELL_W, imgW),
    cellHeight: Math.min(RUNNER_MAX_SPRITE_CELL_H, imgH),
  };
}

export function emptyRunner(partial: { id: string; slug: string }): RunnerRecord {
  const starter = emptyRunnerCharacter();
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
    characters: [starter],
    character: starter,
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

  const characters = normalizeRunnerCharacters(doc, defaults.character);
  const character = characters[0];

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
        renderInFront: l.renderInFront === true,
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
    characters,
    character,
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
