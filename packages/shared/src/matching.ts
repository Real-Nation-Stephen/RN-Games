/** Matching game — shared pairing engine for Match (A→B) and Memory modes. */

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
  columns: number | "auto";
  gapPx: number;
  tileMinPx: number;
  tileMaxPx: number;
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

export interface MatchingGameplay {
  shuffle: boolean;
  /** How many pairs to deal each round (≤ deck size). Exhausts the deck before repeating. */
  pairsDealt: number;
  timerSec: number | null;
  maxAttempts: number | null;
  mismatchDelayMs: number;
  inputModes: ("tap" | "drag" | "keyboard")[];
}

export interface MatchingEndScreen {
  headline: string;
  subhead: string;
  playAgainLabel: string;
  buttonHex: string;
  buttonTextHex: string;
  headlineHex: string;
  subheadHex: string;
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
  gameplay: MatchingGameplay;
  introHeadline: string;
  introBody: string;
  startLabel: string;
  endScreen: MatchingEndScreen;
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
      tileMaxPx: 320,
    },
    cardChrome: {
      enabled: true,
      backgroundHex: "#ffffff",
      borderHex: "rgba(0,0,0,0.12)",
      radiusPx: 12,
      shadow: true,
      paddingPx: 10,
    },
    backgroundHex: "#0f1a24",
    backgrounds: { desktop: "", tablet: "", mobile: "" },
    logoUrl: "",
    logoAlign: "center",
    gameplay: {
      shuffle: true,
      pairsDealt: 4,
      timerSec: null,
      maxAttempts: null,
      mismatchDelayMs: 700,
      inputModes: ["tap", "drag", "keyboard"],
    },
    introHeadline: "Matching game",
    introBody: "Match each pair to continue.",
    startLabel: "Start",
    endScreen: {
      headline: "Well done!",
      subhead: "You matched all the pairs.",
      playAgainLabel: "Play again",
      buttonHex: "#2d6cdf",
      buttonTextHex: "#ffffff",
      headlineHex: "#ffffff",
      subheadHex: "#c8d4e0",
    },
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
      tileMaxPx: Math.max(80, Math.min(480, Number(doc.layout?.tileMaxPx) || base.layout.tileMaxPx)),
    },
    cardChrome: {
      enabled: doc.cardChrome?.enabled !== false,
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
    gameplay: {
      shuffle: doc.gameplay?.shuffle !== false,
      pairsDealt: Math.max(
        1,
        Math.min(
          pairs.length,
          Number(doc.gameplay?.pairsDealt) > 0
            ? Number(doc.gameplay?.pairsDealt)
            : Math.min(base.gameplay.pairsDealt, pairs.length),
        ),
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
    },
    introHeadline: String(doc.introHeadline || base.introHeadline),
    introBody: String(doc.introBody || base.introBody),
    startLabel: String(doc.startLabel || base.startLabel),
    endScreen: {
      ...base.endScreen,
      ...(doc.endScreen || {}),
      headline: String(doc.endScreen?.headline || base.endScreen.headline),
      subhead: String(doc.endScreen?.subhead || base.endScreen.subhead),
      playAgainLabel: String(doc.endScreen?.playAgainLabel || base.endScreen.playAgainLabel),
    },
  };
}

/** Resolve memory face-down art for a pair. */
export function resolveMemoryBack(doc: MatchingRecord, pair: MatchPair): MatchFace {
  if (doc.sharedBack.enabled) return doc.sharedBack.face;
  return pair.back || emptyMatchFace("image");
}
