/** Shared wheel types and validation for Real Nation Digital — Game Studio */

export { track, type TrackEvent, type TrackEventInput } from "./track.js";
export {
  rankLeaderboardEntries,
  liveLeaderboardWindow,
  type HighScoreSettings,
  type RankedLeaderboardEntry,
} from "./leaderboard.js";
export {
  LEADERBOARD_LINKABLE_GAME_TYPES,
  isLeaderboardLinkableGameType,
} from "./leaderboard-linkable.js";
export {
  RUNNER_LANDSCAPE_H,
  RUNNER_LANDSCAPE_W,
  RUNNER_MAX_CHARACTERS,
  RUNNER_MAX_PARALLAX_LAYERS,
  RUNNER_MAX_SHEET_FRAMES,
  RUNNER_MAX_SPRITE_CELL,
  RUNNER_MAX_SPRITE_CELL_H,
  RUNNER_MAX_SPRITE_CELL_W,
  RUNNER_PORTRAIT_H,
  RUNNER_PORTRAIT_W,
  RUNNER_BG_SIZE_HINTS,
  emptyRunner,
  emptyRunnerCharacter,
  emptyRunnerItemEffects,
  pickRunnerItemVariant,
  normalizeRunner,
  runnerCharacterList,
  runnerCharacterAuthorSize,
  runnerScaleMultiplier,
  runnerSheetFrameCount,
  runnerSheetFrameRect,
  inferRunnerSpriteSheetCells,
  type RunnerRecord,
  type RunnerBanner,
  type RunnerBreakpointBg,
  type RunnerCharacter,
  type RunnerEndScreen,
  type RunnerFeedback,
  type RunnerGameplay,
  type RunnerGround,
  type RunnerHud,
  type RunnerHudSlotKind,
  type RunnerItemEffects,
  type RunnerItemVariant,
  type RunnerItems,
  type RunnerLeaderboardMetric,
  type RunnerParallaxDepth,
  type RunnerParallaxLayer,
  RUNNER_PARALLAX_DEPTH_LABELS,
  type RunnerRespawnMode,
  type RunnerSounds,
  type RunnerSpriteSheet,
} from "./runner.js";
export {
  CATCH_DESIGN_W,
  CATCH_DESIGN_H,
  CATCH_BG_SIZE_HINTS,
  emptyCatch,
  normalizeCatch,
  type CatchRecord,
  type CatchBanner,
  type CatchBreakpointBg,
  type CatchEndScreen,
  type CatchGameplay,
  type CatchHud,
  type CatchItemSprites,
  type CatchItemVariant,
  type CatchSounds,
} from "./catch.js";

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
  /** Live event pin board */
  "pinboard",
  /** Leaderboard module (Phase C) */
  "leaderboard",
  /** Catch arcade game (Phase D) */
  "catch",
  /** Runner arcade game (Phase E) */
  "runner",
]);

/** Game kinds supported by the studio (wheels today; more lists use the same pattern). */
export type GameType = "spinning-wheel" | "quiz" | "scratcher" | "flip-cards" | "pinboard" | "leaderboard" | "catch" | "runner";

export type QuizPresentation = "frame16x9" | "responsive";
export type QuizMotion = "static" | "videoSequences";
export type QuizInputMode = "none" | "local" | "playAlong";

export type QuizSequenceType = "intro" | "holding" | "question" | "reveal" | "leaderboard" | "outro" | "breaker";

export interface QuizMode {
  presentation: QuizPresentation;
  motion: QuizMotion;
}

export interface QuizBranding {
  logoUrl?: string;
  backgroundColor?: string;
  backgroundImage?: string;
  /** Used for static mode background only (not per-sequence animated mode). */
  backgroundVideo?: string;
  fonts?: { heading?: string; body?: string; button?: string };
  layout?: { buttonBottomPadPx?: number };
}

export interface QuizChoice {
  id: string;
  label: string;
  imageUrl?: string;
  audioUrl?: string;
}

export interface QuizPrompt {
  text?: string;
  body?: string;
  imageUrl?: string;
  audioUrl?: string;
}

export type QuizInput =
  | { mode: QuizInputMode; type: "buttons"; choices: QuizChoice[]; multi?: boolean }
  | {
      mode: QuizInputMode;
      type: "textExact";
      accepted: string[];
      normalize?: { caseFold?: boolean; trim?: boolean; collapseWhitespace?: boolean; stripDiacritics?: boolean };
    }
  | {
      mode: QuizInputMode;
      type: "slider";
      kind: "continuous" | "discrete";
      continuous?: { min: number; max: number; correctValue: number; tolerance?: number; scoring?: "exact" | "distance" };
      discrete?: { stops: { id: string; label: string; value: number }[]; correctStopId: string; snap?: boolean };
    };

export interface QuizSequenceBase {
  id: string;
  type: QuizSequenceType;
  advance?: { kind: "host" | "timer" | "waitAll" | "autoAfterMedia" };
  timing?: { durationMs?: number; opensAtMs?: number; closesAtMs?: number };
  media?: { videoUrl?: string; bgVideoUrl?: string; bgImageUrl?: string; bgColor?: string };
}

export interface QuizQuestionSequence extends QuizSequenceBase {
  type: "question";
  prompt: QuizPrompt;
  input: QuizInput;
  timerSeconds?: number;
  correct?: { choiceId?: string; text?: string; value?: number; stopId?: string };
  scoring?: { pointsCorrect?: number; pointsWrong?: number };
  lives?: { enabled?: boolean; maxLives?: number; iconUrl?: string };
}

export type QuizSequence =
  | (QuizSequenceBase & { type: Exclude<QuizSequenceType, "question">; title?: string; body?: string })
  | QuizQuestionSequence;

export interface QuizTrack {
  id: string;
  name: string;
  sequences: QuizSequence[];
}

export interface QuizPlayAlongSettings {
  enabled: boolean;
  maxParticipants: number;
  retentionHours?: number;
  profanityBlock?: boolean;
  bonus?: { fastestCorrectSteal?: boolean; stealPoints?: number };
}

export interface QuizRecord {
  id: string;
  gameType: "quiz";
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
  mode: QuizMode;
  branding: QuizBranding;
  playAlong: QuizPlayAlongSettings;
  tracks: QuizTrack[];
}

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
  /** Fullscreen toggle (icon only); uses same styling as mute */
  showFullscreenButton: boolean;
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

export interface PinboardConsentItem {
  id: string;
  label: string;
  required: boolean;
}

export interface PinboardPermissions {
  enabled: boolean;
  headline: string;
  introText: string;
  gdprUrl: string;
  gdprLinkLabel: string;
  items: PinboardConsentItem[];
  acceptButtonLabel: string;
}

export interface PinboardStickyAsset {
  id: string;
  label: string;
  imageUrl: string;
}

export interface PinboardFrameAsset {
  id: string;
  label: string;
  imageUrl: string;
}

export interface PinboardPhotoStickerAsset {
  id: string;
  label: string;
  imageUrl: string;
}

export type PinboardPhotoPublishMode = "raw" | "uniform_frame" | "user_choice";

export interface PinboardBrandingSurface {
  backgroundHex?: string;
  backgroundImageUrl?: string;
  useBackgroundImage?: boolean;
  textHex?: string;
  buttonHex?: string;
  buttonTextHex?: string;
}

export interface PinboardRecord {
  id: string;
  gameType: "pinboard";
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
  permissions: PinboardPermissions;
  board: {
    header: string;
    subhead: string;
    headerHex: string;
    subheadHex: string;
    useBackgroundImage: boolean;
    backgroundHex: string;
    backgroundImage: string;
    brandLogoUrl: string;
    brandLogoCorner: "bl" | "br" | "tl" | "tr";
    polaroidFrames: boolean;
    fonts: { heading?: string; subheading?: string; body?: string };
    fontUploads?: Record<string, { url: string; family: string }>;
  };
  mobile: PinboardBrandingSurface & {
    headline: string;
    subheadline: string;
    submitLabel: string;
    thankYouMessage: string;
    guestSubmit?: {
      allowPhotos: boolean;
      allowTypedNotes: boolean;
      allowDrawnNotes: boolean;
    };
    stickyAssets: PinboardStickyAsset[];
    photoFrames: PinboardFrameAsset[];
    photoStickers: PinboardPhotoStickerAsset[];
    photoPublishMode: PinboardPhotoPublishMode;
    uniformFrameId?: string | null;
  };
  moderator: PinboardBrandingSurface & {
    headline: string;
    approveLabel: string;
    rejectLabel: string;
  };
  stickies: PinboardStickyAsset[];
}

export type LeaderboardMode = "linked" | "manual";

export interface LeaderboardBoardBranding {
  header: string;
  subhead: string;
  headerHex: string;
  subheadHex: string;
  useBackgroundImage: boolean;
  backgroundHex: string;
  backgroundImage: string;
  brandLogoUrl: string;
  brandLogoCorner: "bl" | "br" | "tl" | "tr";
  fonts: { heading?: string; subheading?: string; body?: string };
}

export interface LeaderboardRecord {
  id: string;
  gameType: "leaderboard";
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
  mode: LeaderboardMode;
  linkedGameId: string;
  linkedGameSlug: string;
  linkedGameTitle: string;
  moderatorPin: string;
  board: LeaderboardBoardBranding;
  moderator: {
    headline: string;
    backgroundHex: string;
    textHex: string;
    buttonHex: string;
    buttonTextHex: string;
    buttonDangerHex: string;
    buttonDangerTextHex: string;
  };
}

export function normalizeLeaderboard(
  doc: Partial<LeaderboardRecord> & { id: string; slug: string },
): LeaderboardRecord {
  const defaults = emptyLeaderboard({ id: doc.id, slug: doc.slug });
  return {
    ...defaults,
    ...doc,
    gameType: "leaderboard",
    board: { ...defaults.board, ...(doc.board || {}) },
    moderator: { ...defaults.moderator, ...(doc.moderator || {}) },
  };
}

export function emptyLeaderboard(partial: { id: string; slug: string }): LeaderboardRecord {
  return {
    id: partial.id,
    gameType: "leaderboard",
    title: "Untitled leaderboard",
    clientName: "",
    slug: partial.slug,
    updatedAt: new Date().toISOString(),
    reportingEnabled: false,
    reportingLockedAt: null,
    thumbnailUrl: "",
    faviconUrl: "",
    reportingSheetTab: "",
    showPoweredBy: true,
    mode: "manual",
    linkedGameId: "",
    linkedGameSlug: "",
    linkedGameTitle: "",
    moderatorPin: "1234",
    board: {
      header: "Leaderboard",
      subhead: "Live rankings",
      headerHex: "#ffffff",
      subheadHex: "#c8d4e0",
      useBackgroundImage: false,
      backgroundHex: "#0f1a24",
      backgroundImage: "",
      brandLogoUrl: "",
      brandLogoCorner: "bl",
      fonts: {},
    },
    moderator: {
      headline: "Leaderboard moderation",
      backgroundHex: "#121820",
      textHex: "#eef2f7",
      buttonHex: "#2d6a4f",
      buttonTextHex: "#ffffff",
      buttonDangerHex: "#8b2e2e",
      buttonDangerTextHex: "#ffffff",
    },
  };
}

import {
  PINBOARD_DEFAULT_STICKIES,
  PINBOARD_DEFAULT_FRAMES,
  PINBOARD_DEFAULT_PHOTO_STICKERS,
} from "./pinboard-defaults";

export { PINBOARD_DEFAULT_STICKIES, PINBOARD_DEFAULT_FRAMES, PINBOARD_DEFAULT_PHOTO_STICKERS };

export function emptyPinboard(partial: { id: string; slug: string }): PinboardRecord {
  const defaultStickies = PINBOARD_DEFAULT_STICKIES;
  return {
    id: partial.id,
    gameType: "pinboard",
    title: "Untitled pin board",
    clientName: "",
    slug: partial.slug,
    updatedAt: new Date().toISOString(),
    reportingEnabled: false,
    reportingLockedAt: null,
    thumbnailUrl: "",
    faviconUrl: "",
    reportingSheetTab: "",
    showPoweredBy: false,
    permissions: {
      enabled: false,
      headline: "Before you continue",
      introText: "Please read and accept the following to take part.",
      gdprUrl: "",
      gdprLinkLabel: "Privacy policy (GDPR)",
      items: [
        {
          id: "consent-photo",
          label: "I consent to my photo being displayed on the event pin board after moderation",
          required: true,
        },
      ],
      acceptButtonLabel: "Accept and continue",
    },
    board: {
      header: "Share your moment",
      subhead: "Scan the QR code to add a photo or note to the wall",
      headerHex: "#ffffff",
      subheadHex: "#dce8e4",
      useBackgroundImage: false,
      backgroundHex: "#3d5a4c",
      backgroundImage: "",
      brandLogoUrl: "",
      brandLogoCorner: "bl",
      polaroidFrames: true,
      fonts: {},
      fontUploads: {},
    },
    stickies: [...defaultStickies],
    mobile: {
      headline: "Add to the wall",
      subheadline: "Take a selfie or leave a note for the host to approve",
      submitLabel: "Submit",
      thankYouMessage: "Thanks! Your submission is with the event team.",
      guestSubmit: { allowPhotos: true, allowTypedNotes: true, allowDrawnNotes: true },
      backgroundHex: "#1a2332",
      useBackgroundImage: false,
      textHex: "#f5f5f5",
      buttonHex: "#d93ddb",
      buttonTextHex: "#ffffff",
      stickyAssets: [...defaultStickies],
      photoPublishMode: "user_choice",
      uniformFrameId: "polaroid",
      photoFrames: [...PINBOARD_DEFAULT_FRAMES],
      photoStickers: [...PINBOARD_DEFAULT_PHOTO_STICKERS],
    },
    moderator: {
      headline: "Event moderation",
      approveLabel: "Approve",
      rejectLabel: "Reject",
      backgroundHex: "#121820",
      useBackgroundImage: false,
      textHex: "#eef2f7",
      buttonHex: "#2d6a4f",
      buttonTextHex: "#ffffff",
    },
  };
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
      showFullscreenButton: true,
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
