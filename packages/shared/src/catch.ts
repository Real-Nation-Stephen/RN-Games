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

export interface CatchItemSprites {
  positiveUrl: string;
  negativeUrl: string;
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
  spawnIntervalMinMs: number;
  spawnIntervalMaxMs: number;
  fallSpeedStart: number;
  fallSpeedEnd: number;
  itemSize: number;
  catcherWidth: number;
  catcherHeight: number;
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
    sprites: { positiveUrl: "", negativeUrl: "" },
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
      spawnIntervalMinMs: 550,
      spawnIntervalMaxMs: 950,
      fallSpeedStart: 220,
      fallSpeedEnd: 420,
      itemSize: 72,
      catcherWidth: 140,
      catcherHeight: 72,
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
    fallSpeed?: number;
  };
  if (rawGameplay.spawnIntervalMinMs == null || rawGameplay.spawnIntervalMaxMs == null) {
    const base = Number(rawGameplay.spawnIntervalMs) || defaults.gameplay.spawnIntervalMaxMs;
    rawGameplay.spawnIntervalMinMs = Math.round(base * 0.6);
    rawGameplay.spawnIntervalMaxMs = base;
  }
  if (rawGameplay.fallSpeedStart == null || rawGameplay.fallSpeedEnd == null) {
    const base = Number(rawGameplay.fallSpeed) || defaults.gameplay.fallSpeedStart;
    rawGameplay.fallSpeedStart = base;
    rawGameplay.fallSpeedEnd = Math.round(base * 1.75);
  }
  rawGameplay.spawnIntervalMinMs = Math.max(200, Math.min(rawGameplay.spawnIntervalMinMs, rawGameplay.spawnIntervalMaxMs));
  rawGameplay.spawnIntervalMaxMs = Math.max(rawGameplay.spawnIntervalMinMs, Math.min(2500, rawGameplay.spawnIntervalMaxMs));
  rawGameplay.fallSpeedStart = Math.max(80, rawGameplay.fallSpeedStart);
  rawGameplay.fallSpeedEnd = Math.max(rawGameplay.fallSpeedStart, rawGameplay.fallSpeedEnd);
  rawGameplay.itemSize = Math.max(32, Math.min(160, Number(rawGameplay.itemSize) || defaults.gameplay.itemSize));

  const rawBanner = { ...defaults.banner, ...(doc.banner || {}) };
  const align = String(rawBanner.logoAlign || "center");
  rawBanner.logoAlign = align === "left" || align === "right" ? align : "center";

  const out: CatchRecord = {
    ...defaults,
    ...doc,
    gameType: "catch",
    backgrounds: { ...defaults.backgrounds, ...(doc.backgrounds || {}) },
    banner: rawBanner,
    sprites: { ...defaults.sprites, ...(doc.sprites || {}) },
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
  return out;
}
