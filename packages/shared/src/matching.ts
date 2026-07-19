/** Matching game — shared pairing engine for Match (A→B) and Memory modes. */

import type { HighScoreSettings } from "./leaderboard.js";

export type MatchMediaKind = "image" | "text" | "icon" | "audio";
export type MatchingPlayMode = "match" | "memory";
export type MatchLogoAlign = "left" | "center" | "right";

export interface MatchFace {
  kind: MatchMediaKind;
  text?: string;
  imageUrl?: string;
  iconUrl?: string;
  audioUrl?: string;
  alt?: string;
}

export interface MatchPair {
  id: string;
  faceA: MatchFace;
  faceB: MatchFace;
  /** Memory face-down art when sharedBack.enabled is false */
  back?: MatchFace;
}

export interface MatchingBreakpointBg {
  desktop: string;
  tablet: string;
  mobile: string;
}

export interface MatchingSharedBack {
  enabled: boolean;
  face: MatchFace;
}

export interface MatchingLayout {
  /** Desktop max columns when Global Shuffle is on. Mobile/tablet are hard-capped at 2. */
  columns: number | "auto";
  gapPx: number;
  tileMinPx: number;
  /** Soft max; desktop play sizes up to available viewport first. */
  tileMaxPx: number;
  /** How card art fills the tile. */
  imageFit: "contain" | "cover" | "fill";
}

export interface MatchingCardChrome {
  /** ON = optional card styling; OFF = flat elements */
  enabled: boolean;
  backgroundHex: string;
  borderHex: string;
  radiusPx: number;
  shadow: boolean;
  paddingPx: number;
}

export interface MatchingFonts {
  heading: string;
  body: string;
  hud: string;
}

export interface MatchingFontUpload {
  url: string;
  family: string;
}

export interface MatchingHud {
  showMoves: boolean;
  showScore: boolean;
  movesHex: string;
  scoreHex: string;
  timerHex: string;
  labelHex: string;
}

export interface MatchingGameplay {
  /**
   * When false (default): Side A in left column, Side B in right.
   * When true: mix all tiles across the grid.
   */
  globalShuffle: boolean;
  /** Desktop pairs per round (≤ deck). Exhausts deck before repeating. */
  pairsDealt: number;
  /** Tablet pairs per round — default 4 (2×4 tiles). */
  pairsDealtTablet: number;
  /** Mobile pairs per round — default 3 (2×3 tiles). */
  pairsDealtMobile: number;
  timerSec: number | null;
  maxAttempts: number | null;
  mismatchDelayMs: number;
  inputModes: ("tap" | "drag" | "keyboard")[];
  scoreEnabled: boolean;
  pointsPerMatch: number;
  /** Points removed on a mismatch (floored at 0). */
  mismatchPenalty: number;
}

export interface MatchingEndScreen {
  logoUrl: string;
  headline: string;
  subhead: string;
  scorePrefix: string;
  playAgainLabel: string;
  buttonHex: string;
  buttonTextHex: string;
  headlineHex: string;
  subheadHex: string;
  textHex: string;
  /** Scrim behind end card — brandable like runner/catch. */
  overlayHex: string;
}

export interface MatchingSounds {
  pairMatch: string | null;
  roundComplete: string | null;
}

export interface MatchingRecord {
  id: string;
  gameType: "matching";
  title: string;
  clientName: string;
  slug: string;
  projectCode?: string;
  designCode?: string;
  updatedAt: string;
  reportingEnabled: boolean;
  reportingLockedAt?: string | null;
  thumbnailUrl?: string;
  faviconUrl?: string;
  reportingSheetTab?: string;
  showPoweredBy?: boolean;
  archived?: boolean;
  playMode: MatchingPlayMode;
  pairs: MatchPair[];
  sharedBack: MatchingSharedBack;
  layout: MatchingLayout;
  cardChrome: MatchingCardChrome;
  backgroundHex: string;
  backgrounds: MatchingBreakpointBg;
  logoUrl: string;
  logoAlign: MatchLogoAlign;
  fonts: MatchingFonts;
  fontUploads: Record<string, MatchingFontUpload>;
  hud: MatchingHud;
  gameplay: MatchingGameplay;
  introHeadline: string;
  introBody: string;
  startLabel: string;
  introHeadlineHex: string;
  introBodyHex: string;
  introButtonHex: string;
  introButtonTextHex: string;
  endScreen: MatchingEndScreen;
  sounds: MatchingSounds;
  showFullscreenButton?: boolean;
  highScore: HighScoreSettings;
  linkedLeaderboardSlug: string;
}

export const MATCHING_PAIR_SOFT_WARN = 12;

export function newMatchId(prefix = "m"): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyMatchFace(kind: MatchMediaKind = "text"): MatchFace {
  return {
    kind,
    text: kind === "text" ? "Label" : "",
    imageUrl: "",
    iconUrl: "",
    audioUrl: "",
    alt: "",
  };
}

export function emptyMatchPair(): MatchPair {
  return {
    id: newMatchId("p"),
    faceA: emptyMatchFace("image"),
    faceB: emptyMatchFace("text"),
    back: emptyMatchFace("image"),
  };
}

function normalizeFace(raw: Partial<MatchFace> | undefined, fallbackKind: MatchMediaKind = "text"): MatchFace {
  const kind =
    raw?.kind === "image" || raw?.kind === "icon" || raw?.kind === "audio" || raw?.kind === "text"
      ? raw.kind
      : fallbackKind;
  return {
    kind,
    text: String(raw?.text || ""),
    imageUrl: String(raw?.imageUrl || "").trim(),
    iconUrl: String(raw?.iconUrl || "").trim(),
    audioUrl: String(raw?.audioUrl || "").trim(),
    alt: String(raw?.alt || "").trim(),
  };
}

function normalizePair(raw: Partial<MatchPair> | undefined, index: number): MatchPair {
  return {
    id: String(raw?.id || `p${index + 1}`),
    faceA: normalizeFace(raw?.faceA, "image"),
    faceB: normalizeFace(raw?.faceB, "text"),
    back: normalizeFace(raw?.back, "image"),
  };
}

function clampPairsDealt(value: unknown, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return Math.min(fallback, max);
  return Math.max(1, Math.min(max, Math.round(n)));
}

export function emptyMatching(partial: { id: string; slug: string }): MatchingRecord {
  const pair = emptyMatchPair();
  pair.faceA = { ...emptyMatchFace("image"), alt: "Item A" };
  pair.faceB = { ...emptyMatchFace("text"), text: "Match A" };
  return {
    id: partial.id,
    gameType: "matching",
    title: "Untitled matching game",
    clientName: "",
    slug: partial.slug,
    projectCode: "",
    designCode: "",
    updatedAt: new Date().toISOString(),
    reportingEnabled: false,
    reportingLockedAt: null,
    thumbnailUrl: "",
    faviconUrl: "",
    reportingSheetTab: "",
    showPoweredBy: true,
    playMode: "match",
    pairs: [pair],
    sharedBack: {
      enabled: false,
      face: emptyMatchFace("image"),
    },
    layout: {
      columns: "auto",
      gapPx: 12,
      tileMinPx: 96,
      tileMaxPx: 720,
      imageFit: "cover",
    },
    cardChrome: {
      enabled: false,
      backgroundHex: "#ffffff",
      borderHex: "rgba(0,0,0,0.12)",
      radiusPx: 12,
      shadow: true,
      paddingPx: 0,
    },
    backgroundHex: "#0f1a24",
    backgrounds: { desktop: "", tablet: "", mobile: "" },
    logoUrl: "",
    logoAlign: "center",
    fonts: {
      heading: "system-ui, sans-serif",
      body: "system-ui, sans-serif",
      hud: "system-ui, sans-serif",
    },
    fontUploads: {},
    hud: {
      showMoves: true,
      showScore: true,
      movesHex: "#ffffff",
      scoreHex: "#ffffff",
      timerHex: "#ffffff",
      labelHex: "#c8d4e0",
    },
    gameplay: {
      globalShuffle: false,
      pairsDealt: 4,
      pairsDealtTablet: 4,
      pairsDealtMobile: 3,
      timerSec: null,
      maxAttempts: null,
      mismatchDelayMs: 700,
      inputModes: ["tap", "drag", "keyboard"],
      scoreEnabled: true,
      pointsPerMatch: 100,
      mismatchPenalty: 0,
    },
    introHeadline: "Matching game",
    introBody: "Match each pair to continue.",
    startLabel: "Start",
    introHeadlineHex: "#ffffff",
    introBodyHex: "#c8d4e0",
    introButtonHex: "#2d6cdf",
    introButtonTextHex: "#ffffff",
    endScreen: {
      logoUrl: "",
      headline: "Well done!",
      subhead: "You matched all the pairs.",
      scorePrefix: "Score:",
      playAgainLabel: "Play again",
      buttonHex: "#2d6cdf",
      buttonTextHex: "#ffffff",
      headlineHex: "#ffffff",
      subheadHex: "#c8d4e0",
      textHex: "#eef2f7",
      overlayHex: "rgba(8, 14, 22, 0.88)",
    },
    sounds: {
      pairMatch: null,
      roundComplete: null,
    },
    showFullscreenButton: true,
    highScore: { enabled: true, nameMaxLength: 16 },
    linkedLeaderboardSlug: "",
  };
}

export function normalizeMatching(doc: Partial<MatchingRecord> & { id: string; slug: string }): MatchingRecord {
  const base = emptyMatching({ id: doc.id, slug: doc.slug });
  const pairsRaw = Array.isArray(doc.pairs) ? doc.pairs : base.pairs;
  const pairs = pairsRaw.length ? pairsRaw.map((p, i) => normalizePair(p, i)) : base.pairs;
  const playMode = doc.playMode === "memory" ? "memory" : "match";
  const columns =
    doc.layout?.columns === "auto" || doc.layout?.columns == null
      ? "auto"
      : Math.max(2, Math.min(8, Number(doc.layout.columns) || 4));
  const inputModes = Array.isArray(doc.gameplay?.inputModes)
    ? (doc.gameplay!.inputModes.filter((m) => m === "tap" || m === "drag" || m === "keyboard") as MatchingGameplay["inputModes"])
    : base.gameplay.inputModes;

  const legacyShuffle = (doc.gameplay as { shuffle?: boolean } | undefined)?.shuffle;
  const globalShuffle =
    doc.gameplay?.globalShuffle != null
      ? !!doc.gameplay.globalShuffle
      : legacyShuffle === true
        ? true
        : false;

  const maxPairs = Math.max(1, pairs.length);

  return {
    ...base,
    ...doc,
    gameType: "matching",
    title: String(doc.title || base.title),
    clientName: String(doc.clientName || ""),
    slug: String(doc.slug || base.slug),
    projectCode: String(doc.projectCode || ""),
    designCode: String(doc.designCode || ""),
    updatedAt: String(doc.updatedAt || base.updatedAt),
    reportingEnabled: !!doc.reportingEnabled,
    thumbnailUrl: String(doc.thumbnailUrl || ""),
    faviconUrl: String(doc.faviconUrl || ""),
    playMode,
    pairs,
    sharedBack: {
      enabled: !!doc.sharedBack?.enabled,
      face: normalizeFace(doc.sharedBack?.face, "image"),
    },
    layout: {
      columns,
      gapPx: Math.max(4, Math.min(48, Number(doc.layout?.gapPx) || base.layout.gapPx)),
      tileMinPx: Math.max(40, Math.min(240, Number(doc.layout?.tileMinPx) || base.layout.tileMinPx)),
      tileMaxPx: Math.max(80, Math.min(960, Number(doc.layout?.tileMaxPx) || base.layout.tileMaxPx)),
      imageFit:
        doc.layout?.imageFit === "contain" || doc.layout?.imageFit === "fill"
          ? doc.layout.imageFit
          : "cover",
    },
    cardChrome: {
      enabled: doc.cardChrome?.enabled === true,
      backgroundHex: String(doc.cardChrome?.backgroundHex || base.cardChrome.backgroundHex),
      borderHex: String(doc.cardChrome?.borderHex || base.cardChrome.borderHex),
      radiusPx: Math.max(0, Math.min(48, Number(doc.cardChrome?.radiusPx) ?? base.cardChrome.radiusPx)),
      shadow: doc.cardChrome?.shadow !== false,
      paddingPx: Math.max(0, Math.min(40, Number(doc.cardChrome?.paddingPx) ?? base.cardChrome.paddingPx)),
    },
    backgroundHex: String(doc.backgroundHex || base.backgroundHex),
    backgrounds: {
      desktop: String(doc.backgrounds?.desktop || ""),
      tablet: String(doc.backgrounds?.tablet || ""),
      mobile: String(doc.backgrounds?.mobile || ""),
    },
    logoUrl: String(doc.logoUrl || ""),
    logoAlign:
      doc.logoAlign === "left" || doc.logoAlign === "right" ? doc.logoAlign : "center",
    showPoweredBy: doc.showPoweredBy !== false,
    fonts: {
      heading: String(doc.fonts?.heading || base.fonts.heading),
      body: String(doc.fonts?.body || base.fonts.body),
      hud: String(doc.fonts?.hud || base.fonts.hud),
    },
    fontUploads:
      doc.fontUploads && typeof doc.fontUploads === "object" ? { ...doc.fontUploads } : {},
    hud: {
      showMoves: doc.hud?.showMoves !== false,
      showScore: doc.hud?.showScore !== false,
      movesHex: String(doc.hud?.movesHex || base.hud.movesHex),
      scoreHex: String(doc.hud?.scoreHex || base.hud.scoreHex),
      timerHex: String(doc.hud?.timerHex || base.hud.timerHex),
      labelHex: String(doc.hud?.labelHex || base.hud.labelHex),
    },
    gameplay: {
      globalShuffle,
      pairsDealt: clampPairsDealt(doc.gameplay?.pairsDealt, base.gameplay.pairsDealt, maxPairs),
      pairsDealtTablet: clampPairsDealt(
        doc.gameplay?.pairsDealtTablet,
        base.gameplay.pairsDealtTablet,
        maxPairs,
      ),
      pairsDealtMobile: clampPairsDealt(
        doc.gameplay?.pairsDealtMobile,
        base.gameplay.pairsDealtMobile,
        maxPairs,
      ),
      timerSec:
        doc.gameplay?.timerSec == null || Number.isNaN(Number(doc.gameplay.timerSec))
          ? null
          : Math.max(10, Math.min(3600, Number(doc.gameplay.timerSec) || 60)),
      maxAttempts:
        doc.gameplay?.maxAttempts == null || Number.isNaN(Number(doc.gameplay.maxAttempts))
          ? null
          : Math.max(1, Math.min(999, Number(doc.gameplay.maxAttempts) || 20)),
      mismatchDelayMs: Math.max(200, Math.min(3000, Number(doc.gameplay?.mismatchDelayMs) || 700)),
      inputModes: inputModes.length ? inputModes : ["tap", "drag", "keyboard"],
      scoreEnabled: doc.gameplay?.scoreEnabled !== false,
      pointsPerMatch: Math.max(0, Math.min(9999, Number(doc.gameplay?.pointsPerMatch) || base.gameplay.pointsPerMatch)),
      mismatchPenalty: Math.max(0, Math.min(9999, Number(doc.gameplay?.mismatchPenalty) || 0)),
    },
    introHeadline: String(doc.introHeadline || base.introHeadline),
    introBody: String(doc.introBody || base.introBody),
    startLabel: String(doc.startLabel || base.startLabel),
    introHeadlineHex: String(doc.introHeadlineHex || base.introHeadlineHex),
    introBodyHex: String(doc.introBodyHex || base.introBodyHex),
    introButtonHex: String(doc.introButtonHex || base.introButtonHex),
    introButtonTextHex: String(doc.introButtonTextHex || base.introButtonTextHex),
    endScreen: {
      ...base.endScreen,
      ...(doc.endScreen || {}),
      logoUrl: String(doc.endScreen?.logoUrl || ""),
      headline: String(doc.endScreen?.headline || base.endScreen.headline),
      subhead: String(doc.endScreen?.subhead || base.endScreen.subhead),
      scorePrefix: String(doc.endScreen?.scorePrefix || base.endScreen.scorePrefix),
      playAgainLabel: String(doc.endScreen?.playAgainLabel || base.endScreen.playAgainLabel),
      overlayHex: String(doc.endScreen?.overlayHex || base.endScreen.overlayHex),
    },
    sounds: {
      pairMatch: doc.sounds?.pairMatch ? String(doc.sounds.pairMatch) : null,
      roundComplete: doc.sounds?.roundComplete ? String(doc.sounds.roundComplete) : null,
    },
    showFullscreenButton: doc.showFullscreenButton !== false,
    highScore: {
      enabled: doc.highScore?.enabled !== false,
      nameMaxLength: Math.max(2, Math.min(32, Number(doc.highScore?.nameMaxLength) || 16)),
    },
    linkedLeaderboardSlug: String(doc.linkedLeaderboardSlug || "").trim(),
  };
}

/** Resolve memory face-down art for a pair. */
export function resolveMemoryBack(doc: MatchingRecord, pair: MatchPair): MatchFace {
  if (doc.sharedBack.enabled) return doc.sharedBack.face;
  return pair.back || emptyMatchFace("image");
}

export type MatchingBreakpoint = "mobile" | "tablet" | "desktop";

export function matchingBreakpoint(width = typeof window !== "undefined" ? window.innerWidth : 1200): MatchingBreakpoint {
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

export function pairsDealtForBreakpoint(doc: MatchingRecord, bp: MatchingBreakpoint = matchingBreakpoint()): number {
  const max = Math.max(1, doc.pairs.length);
  if (bp === "mobile") return Math.min(doc.gameplay.pairsDealtMobile, max);
  if (bp === "tablet") return Math.min(doc.gameplay.pairsDealtTablet, max);
  return Math.min(doc.gameplay.pairsDealt, max);
}
