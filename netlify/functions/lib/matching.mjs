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

function clampPairsDealt(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return Math.min(fallback, max);
  return Math.max(1, Math.min(max, Math.round(n)));
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
    layout: { columns: "auto", gapPx: 12, tileMinPx: 96, tileMaxPx: 720, imageFit: "cover" },
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
    sounds: { pairMatch: null, roundComplete: null },
    showFullscreenButton: true,
    highScore: { enabled: true, nameMaxLength: 16 },
    linkedLeaderboardSlug: "",
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
  const legacyShuffle = doc.gameplay?.shuffle;
  const globalShuffle =
    doc.gameplay?.globalShuffle != null ? !!doc.gameplay.globalShuffle : legacyShuffle === true;
  const maxPairs = Math.max(1, pairs.length);

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
    logoAlign: doc.logoAlign === "left" || doc.logoAlign === "right" ? doc.logoAlign : "center",
    showPoweredBy: doc.showPoweredBy !== false,
    fonts: {
      heading: String(doc.fonts?.heading || base.fonts.heading),
      body: String(doc.fonts?.body || base.fonts.body),
      hud: String(doc.fonts?.hud || base.fonts.hud),
    },
    fontUploads: doc.fontUploads && typeof doc.fontUploads === "object" ? { ...doc.fontUploads } : {},
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
      pointsPerMatch: Math.max(
        0,
        Math.min(9999, Number(doc.gameplay?.pointsPerMatch) || base.gameplay.pointsPerMatch),
      ),
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
  });
  return doc;
}

export function toPublicMatching(doc) {
  normalizeMatchingRecord(doc);
  const { reportingSheetTab, reportingLockedAt, projectCode, designCode, ...pub } = doc;
  return pub;
}
