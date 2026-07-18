/** Matching game — Netlify function helpers (mirrors packages/shared/src/matching.ts). */

function emptyFace(kind = "text") {
  return { kind, text: kind === "text" ? "Label" : "", imageUrl: "", iconUrl: "", audioUrl: "", alt: "" };
}

function normalizeFace(raw = {}, fallbackKind = "text") {
  const kind =
    raw.kind === "image" || raw.kind === "icon" || raw.kind === "audio" || raw.kind === "text"
      ? raw.kind
      : fallbackKind;
  return {
    kind,
    text: String(raw.text || ""),
    imageUrl: String(raw.imageUrl || "").trim(),
    iconUrl: String(raw.iconUrl || "").trim(),
    audioUrl: String(raw.audioUrl || "").trim(),
    alt: String(raw.alt || "").trim(),
  };
}

function normalizePair(raw = {}, index = 0) {
  return {
    id: String(raw.id || `p${index + 1}`),
    faceA: normalizeFace(raw.faceA, "image"),
    faceB: normalizeFace(raw.faceB, "text"),
    back: normalizeFace(raw.back, "image"),
  };
}

export function emptyMatchingRecord(id, slug) {
  return {
    id,
    gameType: "matching",
    title: "Untitled matching game",
    clientName: "",
    slug,
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
    pairs: [
      {
        id: "p1",
        faceA: { ...emptyFace("image"), alt: "Item A" },
        faceB: { ...emptyFace("text"), text: "Match A" },
        back: emptyFace("image"),
      },
    ],
    sharedBack: { enabled: false, face: emptyFace("image") },
    layout: { columns: "auto", gapPx: 12, tileMinPx: 96, tileMaxPx: 320 },
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

export function normalizeMatchingRecord(doc) {
  const base = emptyMatchingRecord(doc.id, doc.slug);
  const pairsRaw = Array.isArray(doc.pairs) ? doc.pairs : base.pairs;
  const pairs = pairsRaw.length ? pairsRaw.map((p, i) => normalizePair(p, i)) : base.pairs;
  const columns =
    doc.layout?.columns === "auto" || doc.layout?.columns == null
      ? "auto"
      : Math.max(2, Math.min(8, Number(doc.layout.columns) || 4));
  const inputModes = Array.isArray(doc.gameplay?.inputModes)
    ? doc.gameplay.inputModes.filter((m) => m === "tap" || m === "drag" || m === "keyboard")
    : base.gameplay.inputModes;

  Object.assign(doc, base, doc, {
    gameType: "matching",
    title: String(doc.title || base.title),
    clientName: String(doc.clientName || ""),
    playMode: doc.playMode === "memory" ? "memory" : "match",
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
    logoAlign: doc.logoAlign === "left" || doc.logoAlign === "right" ? doc.logoAlign : "center",
    showPoweredBy: doc.showPoweredBy !== false,
    gameplay: {
      shuffle: doc.gameplay?.shuffle !== false,
      pairsDealt: Math.max(
        1,
        Math.min(
          pairs.length,
          Number(doc.gameplay?.pairsDealt) > 0
            ? Number(doc.gameplay.pairsDealt)
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
    endScreen: { ...base.endScreen, ...(doc.endScreen || {}) },
  });
  return doc;
}

export function toPublicMatching(doc) {
  normalizeMatchingRecord(doc);
  const {
    reportingSheetTab,
    reportingLockedAt,
    projectCode,
    designCode,
    ...pub
  } = doc;
  return pub;
}
