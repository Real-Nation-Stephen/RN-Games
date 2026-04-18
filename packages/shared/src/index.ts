/** Shared wheel types and validation for Real Nation Digital — Game Studio */

export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "assets",
  "play",
  "report",
  "static",
  "favicon.ico",
  "robots.txt",
  "_next",
  ".netlify",
  /** Reserved for the Quiz game type public routes */
  "quiz",
  /** Scratch ticket experience (prototype route) */
  "scratcher",
  /** Flip card game public bundle */
  "flip-cards",
]);

/** Game kinds supported by the studio (wheels today; more lists use the same pattern). */
export type GameType = "spinning-wheel" | "quiz" | "scratcher" | "flip-cards";

/** Scratch card layout presets (one format per scratcher game in v1). */
export type ScratcherFormatId = "16x9" | "1x1" | "9x16" | "4x3";

export interface ScratcherAssets {
  top: string;
  bottomWin: string;
  bottomLose: string;
  button: string;
  /** Full-bleed page background behind the stage (optional) */
  backgroundImage: string;
}

export interface ScratcherSounds {
  win?: string | null;
  lose?: string | null;
}

export interface ScratcherRecord {
  id: string;
  gameType: "scratcher";
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
  scratcherFormat: ScratcherFormatId;
  assets: ScratcherAssets;
  /** Hex fill when no background image, e.g. #0a1628 */
  backgroundColor: string;
  sounds: ScratcherSounds;
  /** CTA opens this URL (optional) */
  winButtonUrl: string;
  /** 0–1, fraction of scratch layer cleared before reveal */
  clearThreshold: number;
  /** 0–100; 100 or missing lose image ⇒ always win bottom */
  winChancePercent: number;
}

export interface WheelAssets {
  logo: string;
  headline: string;
  button: string;
  restart: string;
  background: string;
  wheel: string;
  frame: string;
  winPanel: string;
  losePanel: string;
  /** Optional per-segment image for the headline/copy area when that segment wins (result layer) */
  segmentPanels?: (string | null)[] | null;
}

export interface WheelSounds {
  spin?: string | null;
  /** One optional URL per segment — played when that segment is selected */
  segmentReveal?: (string | null)[];
  music?: string | null;
  musicVolume?: number;
}

export interface WheelSpinSettings {
  minFullRotations: number;
  maxFullRotations: number;
  durationMs: number;
  easing: string;
}

export interface WheelLandscape {
  minAspectRatio: number;
}

export interface WheelRecord {
  id: string;
  /** Always `spinning-wheel` for wheel documents */
  gameType?: GameType;
  title: string;
  clientName: string;
  slug: string;
  updatedAt: string;
  reportingEnabled: boolean;
  reportingLockedAt?: string | null;
  prizeSchemaVersion: number;
  segmentCount: number;
  prizes: string[];
  /** Per segment: true = win fanfare (confetti), false = lose styling */
  segmentOutcome: boolean[];
  weights: number[] | null;
  useWeightedSpin: boolean;
  wheelRotationOffsetDeg: number;
  assets: WheelAssets;
  sounds: WheelSounds;
  spin: WheelSpinSettings;
  landscape: WheelLandscape;
  thumbnailUrl?: string;
  /** Optional tab icon for this wheel’s public URL */
  faviconUrl?: string;
  /** Google Sheet tab name for this wheel’s spin log (set when reporting is enabled) */
  reportingSheetTab?: string;
  /** Show “Powered by Real Nation” on the public game page (default true) */
  showPoweredBy?: boolean;
}

export type WheelListItem = Pick<
  WheelRecord,
  "id" | "gameType" | "title" | "clientName" | "slug" | "updatedAt" | "reportingEnabled" | "thumbnailUrl"
>;

export function emptyScratcher(partial: { id: string; slug: string }): ScratcherRecord {
  return {
    id: partial.id,
    gameType: "scratcher",
    title: "Untitled scratcher",
    clientName: "",
    slug: partial.slug,
    updatedAt: new Date().toISOString(),
    reportingEnabled: false,
    reportingLockedAt: null,
    thumbnailUrl: "",
    faviconUrl: "",
    reportingSheetTab: "",
    showPoweredBy: true,
    scratcherFormat: "16x9",
    assets: {
      top: "",
      bottomWin: "",
      bottomLose: "",
      button: "",
      backgroundImage: "",
    },
    backgroundColor: "#0a1628",
    sounds: { win: null, lose: null },
    winButtonUrl: "",
    clearThreshold: 0.97,
    winChancePercent: 50,
  };
}

export function validateSlug(raw: string): { ok: true; slug: string } | { ok: false; error: string } {
  const slug = raw.trim().toLowerCase();
  if (slug.length < 2 || slug.length > 64) {
    return { ok: false, error: "Slug must be 2–64 characters." };
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { ok: false, error: "Use lowercase letters, numbers, and hyphens only." };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: "This slug is reserved." };
  }
  return { ok: true, slug };
}

/** One card in the deck (front/back copy, optional per-card sound). */
export interface FlipCardFace {
  frontImage: string;
  backImage: string;
  header: string;
  body: string;
  /** Label for the overlay “back” control on the card detail view */
  overlayButtonText: string;
  soundUrl?: string;
}

export interface FlipCardShuffle {
  enabled: boolean;
  /** Small mute control beside shuffle; uses same colours / button font as shuffle */
  showMuteButton: boolean;
  label: string;
  buttonBg: string;
  textColor: string;
  textSizePx: number;
  buttonFontSizePx: number;
}

export interface FlipCardFonts {
  heading?: string;
  body?: string;
  button?: string;
}

export interface FlipCardRecord {
  id: string;
  gameType: "flip-cards";
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
  /** Main heading above the card grid */
  selectionHeading: string;
  /** Cards in the full deck (1–15) */
  deckSize: number;
  /** How many cards to deal at random per session (≤ deckSize) */
  cardsDealt: number;
  /** Max columns at full width (responsive caps apply) */
  maxColumns: number;
  /** Client logo corner: tl | tr | bl | br */
  brandLogoCorner: "tl" | "tr" | "bl" | "br";
  /** If set, used when a card’s frontImage is empty */
  sharedFrontImage: string;
  backgroundImage: string;
  backgroundColor: string;
  brandLogoUrl: string;
  sounds: {
    music?: string | null;
    musicVolume?: number;
  };
  fonts: FlipCardFonts;
  shuffle: FlipCardShuffle;
  cards: FlipCardFace[];
}

export function emptyFlipCard(partial: { id: string; slug: string }): FlipCardRecord {
  const n = 7;
  return {
    id: partial.id,
    gameType: "flip-cards",
    title: "Untitled flip cards",
    clientName: "",
    slug: partial.slug,
    updatedAt: new Date().toISOString(),
    reportingEnabled: false,
    reportingLockedAt: null,
    thumbnailUrl: "",
    faviconUrl: "",
    reportingSheetTab: "",
    showPoweredBy: true,
    selectionHeading: "Tap a card to learn more",
    deckSize: n,
    cardsDealt: 2,
    maxColumns: 4,
    brandLogoCorner: "bl",
    sharedFrontImage: "",
    backgroundImage: "",
    backgroundColor: "#9f2527",
    brandLogoUrl: "",
    sounds: { music: null, musicVolume: 0.35 },
    fonts: { heading: "", body: "", button: "" },
    shuffle: {
      enabled: true,
      showMuteButton: true,
      label: "Shuffle",
      buttonBg: "rgba(255,255,255,0.15)",
      textColor: "#ffffff",
      textSizePx: 16,
      buttonFontSizePx: 15,
    },
    cards: Array.from({ length: n }, (_, i) => ({
      frontImage: "",
      backImage: "",
      header: `Card ${i + 1}`,
      body: "Placeholder copy for this card.",
      overlayButtonText: "Back",
      soundUrl: "",
    })),
  };
}

export function emptyWheel(partial: { id: string; slug: string }): WheelRecord {
  const n = 12;
  return {
    id: partial.id,
    gameType: "spinning-wheel",
    title: "Untitled wheel",
    clientName: "",
    slug: partial.slug,
    updatedAt: new Date().toISOString(),
    reportingEnabled: false,
    reportingLockedAt: null,
    prizeSchemaVersion: 1,
    segmentCount: n,
    prizes: Array.from({ length: n }, (_, i) => `Prize ${i + 1}`),
    segmentOutcome: Array.from({ length: n }, (_, i) => i % 2 === 1),
    weights: null,
    useWeightedSpin: false,
    wheelRotationOffsetDeg: 0,
    assets: {
      logo: "",
      headline: "",
      button: "",
      restart: "",
      background: "",
      wheel: "",
      frame: "",
      winPanel: "",
      losePanel: "",
      segmentPanels: null,
    },
    faviconUrl: "",
    showPoweredBy: true,
    sounds: {
      spin: null,
      segmentReveal: Array.from({ length: n }, () => null),
      music: null,
      musicVolume: 0.35,
    },
    spin: {
      minFullRotations: 5,
      maxFullRotations: 8,
      durationMs: 4500,
      easing: "cubic-bezier(0.15, 0.85, 0.2, 1)",
    },
    landscape: { minAspectRatio: 1.25 },
  };
}

export function segmentIsWinFromConfig(wheel: WheelRecord, segmentIndex: number): boolean {
  const o = wheel.segmentOutcome[segmentIndex];
  return o === true;
}
