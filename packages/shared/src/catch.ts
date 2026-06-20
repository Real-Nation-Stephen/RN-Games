/** Catch arcade game — shared record shape (keep in sync with lib/catch.mjs). */

import type { HighScoreSettings } from "./leaderboard.js";

export const CATCH_DESIGN_W = 1080;
export const CATCH_DESIGN_H = 1920;

export const CATCH_BG_SIZE_HINTS = {
  desktop: "1920×1080 landscape — background fits viewport height",
  tablet: "1536×2048 portrait — background fits viewport height",
  mobile: "1080×1920 portrait — background fits viewport height",
} as const;

export type CatchLogoAlign = "left" | "center" | "right";
export type CatchBreakpointBg = { desktop: string; tablet: string; mobile: string };

export interface CatchBanner {
  backgroundHex: string;
  logoUrl: string;
  logoAlign: CatchLogoAlign;
}

export interface CatchItemVariant {
  id: string;
  url: string;
  points: number;
}

export interface CatchItemSprites {
  positive: CatchItemVariant[];
  negative: CatchItemVariant[];
}

export function normalizeCatchItemVariants(
  raw: unknown,
  legacyUrl?: string,
): CatchItemVariant[] {
  const list = Array.isArray(raw) ? raw : [];
  const normalized: CatchItemVariant[] = [];
  for (let i = 0; i < list.length; i++) {
    const v = list[i] as Partial<CatchItemVariant>;
    if (!v || typeof v !== "object") continue;
    const url = String(v.url || "").trim();
    if (!url) continue;
    normalized.push({
      id: String(v.id || `v${i + 1}`),
      url,
      points: Math.max(1, Math.min(99, Number(v.points) || 1)),
    });
  }
  const legacy = String(legacyUrl || "").trim();
  if (normalized.length === 0 && legacy) {
    return [{ id: "v1", url: legacy, points: 1 }];
  }
  return normalized;
}

export function normalizeCatchSprites(raw: Partial<CatchItemSprites> & { positiveUrl?: string; negativeUrl?: string } = {}): CatchItemSprites {
  return {
    positive: normalizeCatchItemVariants(raw.positive, raw.positiveUrl),
    negative: normalizeCatchItemVariants(raw.negative, raw.negativeUrl),
  };
}

export interface CatchSounds {
  positiveCatch: string | null;
  negativeCatch: string | null;
  gameEnd: string | null;
  music: string | null;
  musicVolume: number;
}

export interface CatchFonts {
  heading: string;
  body: string;
  score: string;
}

export interface CatchFontUpload {
  url: string;
  family: string;
}

export interface CatchHud {
  scoreHex: string;
  timerHex: string;
  labelHex: string;
}

export interface CatchGameplay {
  durationSec: number;
  positiveOnly: boolean;
  swipeHintText: string;
  /** Ms between spawns at round start (higher = slower). */
  spawnIntervalStartMs: number;
  /** Ms between spawns at round end (lower = faster). */
  spawnIntervalEndMs: number;
  fallSpeedStart: number;
  fallSpeedEnd: number;
  /** Positive spawn share at round start (0–100). */
  positivePercentStart: number;
  /** Positive spawn share at round end (0–100). */
  positivePercentEnd: number;
  itemSize: number;
  catcherWidth: number;
  catcherHeight: number;
  /** When on, catch points add/remove seconds by the item's point value. */
  pointsAddTime: boolean;
}

export interface CatchIntro {
  positiveLine: string;
  negativeLine: string;
  nextLabel: string;
}

export interface CatchEndScreen {
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
  backgrounds: CatchBreakpointBg;
  linkEnabled: boolean;
  linkLabel: string;
  linkUrl: string;
  linkButtonHex: string;
  linkButtonTextHex: string;
}

export interface CatchRecord {
  id: string;
  gameType: "catch";
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
  backgrounds: CatchBreakpointBg;
  banner: CatchBanner;
  sprites: CatchItemSprites;
  catcherSpriteUrl: string;
  sounds: CatchSounds;
  fonts: CatchFonts;
  fontUploads: Record<string, CatchFontUpload>;
  hud: CatchHud;
  gameplay: CatchGameplay;
  intro: CatchIntro;
  endScreen: CatchEndScreen;
  highScore: HighScoreSettings;
  linkedLeaderboardSlug: string;
}

export function emptyCatch(partial: { id: string; slug: string }): CatchRecord {
  return {
    id: partial.id,
    gameType: "catch",
    title: "Untitled catch game",
    clientName: "",
    slug: partial.slug,
    updatedAt: new Date().toISOString(),
    reportingEnabled: false,
    reportingLockedAt: null,
    thumbnailUrl: "",
    faviconUrl: "",
    reportingSheetTab: "",
    showPoweredBy: true,
    backgroundHex: "#1a2a3a",
    backgrounds: { desktop: "", tablet: "", mobile: "" },
    banner: {
      backgroundHex: "#0d1b2a",
      logoUrl: "",
      logoAlign: "center",
    },
    sprites: { positive: [], negative: [] },
    catcherSpriteUrl: "",
    sounds: {
      positiveCatch: null,
      negativeCatch: null,
      gameEnd: null,
      music: null,
      musicVolume: 0.35,
    },
    fonts: { heading: "", body: "", score: "" },
    fontUploads: {},
    hud: {
      scoreHex: "#ffffff",
      timerHex: "#ffffff",
      labelHex: "#c8d4e0",
    },
    gameplay: {
      durationSec: 60,
      positiveOnly: false,
      swipeHintText: "Swipe to move",
      spawnIntervalStartMs: 950,
      spawnIntervalEndMs: 550,
      fallSpeedStart: 220,
      fallSpeedEnd: 420,
      positivePercentStart: 50,
      positivePercentEnd: 10,
      itemSize: 72,
      catcherWidth: 140,
      catcherHeight: 120,
      pointsAddTime: false,
    },
    intro: {
      positiveLine: "Catch these to earn points",
      negativeLine: "Avoid catching these or lose points",
      nextLabel: "Next",
    },
    endScreen: {
      logoUrl: "",
      headline: "Time's up!",
      subhead: "Nice catching.",
      scorePrefix: "Score:",
      playAgainLabel: "Play again",
      buttonHex: "#2d6a4f",
      buttonTextHex: "#ffffff",
      textHex: "#eef2f7",
      headlineHex: "#ffffff",
      subheadHex: "#c8d4e0",
      backgrounds: { desktop: "", tablet: "", mobile: "" },
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

export function normalizeCatch(doc: Partial<CatchRecord> & { id: string; slug: string }): CatchRecord {
  const defaults = emptyCatch({ id: doc.id, slug: doc.slug });
  const rawGameplay = { ...defaults.gameplay, ...(doc.gameplay || {}) } as CatchGameplay & {
    spawnIntervalMs?: number;
    spawnIntervalMinMs?: number;
    spawnIntervalMaxMs?: number;
    fallSpeed?: number;
  };
  if (rawGameplay.spawnIntervalStartMs == null || rawGameplay.spawnIntervalEndMs == null) {
    const legacyMin = Number(rawGameplay.spawnIntervalMinMs);
    const legacyMax = Number(rawGameplay.spawnIntervalMaxMs);
    const base = Number(rawGameplay.spawnIntervalMs) || defaults.gameplay.spawnIntervalEndMs;
    if (Number.isFinite(legacyMin) && Number.isFinite(legacyMax)) {
      rawGameplay.spawnIntervalStartMs = Math.max(legacyMin, legacyMax);
      rawGameplay.spawnIntervalEndMs = Math.min(legacyMin, legacyMax);
    } else {
      rawGameplay.spawnIntervalStartMs = Math.round(base * 1.2);
      rawGameplay.spawnIntervalEndMs = base;
    }
  }
  if (rawGameplay.fallSpeedStart == null || rawGameplay.fallSpeedEnd == null) {
    const base = Number(rawGameplay.fallSpeed) || defaults.gameplay.fallSpeedStart;
    rawGameplay.fallSpeedStart = base;
    rawGameplay.fallSpeedEnd = Math.round(base * 1.75);
  }
  rawGameplay.spawnIntervalStartMs = Math.max(200, Math.min(2500, Number(rawGameplay.spawnIntervalStartMs) || 950));
  rawGameplay.spawnIntervalEndMs = Math.max(200, Math.min(2500, Number(rawGameplay.spawnIntervalEndMs) || 550));
  rawGameplay.fallSpeedStart = Math.max(80, rawGameplay.fallSpeedStart);
  rawGameplay.fallSpeedEnd = Math.max(rawGameplay.fallSpeedStart, rawGameplay.fallSpeedEnd);
  rawGameplay.positivePercentStart = Math.max(0, Math.min(100, Number(rawGameplay.positivePercentStart ?? 50)));
  rawGameplay.positivePercentEnd = Math.max(0, Math.min(100, Number(rawGameplay.positivePercentEnd ?? 10)));
  rawGameplay.itemSize = Math.max(32, Math.min(160, Number(rawGameplay.itemSize) || defaults.gameplay.itemSize));
  rawGameplay.catcherWidth = Math.max(40, Math.min(420, Number(rawGameplay.catcherWidth) || defaults.gameplay.catcherWidth));
  rawGameplay.catcherHeight = Math.max(40, Math.min(420, Number(rawGameplay.catcherHeight) || defaults.gameplay.catcherHeight));
  rawGameplay.pointsAddTime = rawGameplay.pointsAddTime === true;

  const rawBanner = { ...defaults.banner, ...(doc.banner || {}) };
  const align = String(rawBanner.logoAlign || "center");
  rawBanner.logoAlign = align === "left" || align === "right" ? align : "center";

  const out: CatchRecord = {
    ...defaults,
    ...doc,
    gameType: "catch",
    backgrounds: { ...defaults.backgrounds, ...(doc.backgrounds || {}) },
    banner: rawBanner,
    sprites: normalizeCatchSprites(doc.sprites as CatchItemSprites & { positiveUrl?: string; negativeUrl?: string }),
    sounds: { ...defaults.sounds, ...(doc.sounds || {}) },
    fonts: { ...defaults.fonts, ...(doc.fonts || {}) },
    fontUploads: { ...(doc.fontUploads || {}) },
    hud: { ...defaults.hud, ...(doc.hud || {}) },
    gameplay: rawGameplay,
    intro: { ...defaults.intro, ...(doc.intro || {}) },
    endScreen: {
      ...defaults.endScreen,
      ...(doc.endScreen || {}),
      backgrounds: { ...defaults.endScreen.backgrounds, ...(doc.endScreen?.backgrounds || {}) },
    },
    highScore: { ...defaults.highScore, ...(doc.highScore || {}) },
  };
  out.endScreen.linkEnabled = out.endScreen.linkEnabled === true;
  out.highScore.nameMaxLength = Math.min(32, Math.max(1, Number(out.highScore.nameMaxLength) || 3));
  return out;
}
