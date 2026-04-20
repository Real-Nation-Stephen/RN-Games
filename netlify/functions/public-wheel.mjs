import { connectLambda } from "@netlify/blobs";
import { readIndex, getWheelJson } from "./lib/blobs.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

/** Strip fields not needed client-side */
function toPublicWheel(w) {
  return {
    gameType: "spinning-wheel",
    id: w.id,
    title: w.title,
    slug: w.slug,
    faviconUrl: w.faviconUrl || "",
    segmentCount: w.segmentCount,
    prizes: w.prizes,
    segmentOutcome: w.segmentOutcome,
    weights: w.weights,
    useWeightedSpin: w.useWeightedSpin,
    wheelRotationOffsetDeg: w.wheelRotationOffsetDeg,
    assets: w.assets,
    sounds: w.sounds,
    spin: w.spin,
    landscape: w.landscape,
    reportingEnabled: w.reportingEnabled,
    prizeSchemaVersion: w.prizeSchemaVersion,
    showPoweredBy: w.showPoweredBy !== false,
  };
}

function toPublicFlipCard(f) {
  const n = Math.min(15, Math.max(1, Number(f.deckSize) || 7));
  const dealt = Math.min(Math.max(1, Number(f.cardsDealt) || 1), n);
  const maxCol = Math.min(6, Math.max(1, Number(f.maxColumns) || 4));
  const src = Array.isArray(f.cards) ? f.cards : [];
  const cards = Array.from({ length: n }, (_, i) => {
    const c = src[i] || {};
    return {
      frontImage: c.frontImage || "",
      backImage: c.backImage || "",
      header: c.header || `Card ${i + 1}`,
      body: c.body || "",
      overlayButtonText: c.overlayButtonText || "Back",
      soundUrl: c.soundUrl || "",
    };
  });
  return {
    gameType: "flip-cards",
    id: f.id,
    title: f.title,
    slug: f.slug,
    faviconUrl: f.faviconUrl || "",
    showPoweredBy: f.showPoweredBy !== false,
    selectionHeading: f.selectionHeading || "",
    deckSize: n,
    cardsDealt: dealt,
    maxColumns: maxCol,
    brandLogoCorner: f.brandLogoCorner || "bl",
    sharedFrontImage: (f.sharedFrontImage || "").trim(),
    backgroundImage: f.backgroundImage || "",
    backgroundColor: f.backgroundColor || "#9f2527",
    brandLogoUrl: f.brandLogoUrl || "",
    sounds: {
      music: f.sounds?.music || null,
      musicVolume: typeof f.sounds?.musicVolume === "number" ? f.sounds.musicVolume : 0.35,
    },
    fonts: {
      heading: f.fonts?.heading || "",
      body: f.fonts?.body || "",
      button: f.fonts?.button || "",
    },
    shuffle: {
      enabled: f.shuffle?.enabled !== false,
      showMuteButton: f.shuffle?.showMuteButton !== false,
      showFullscreenButton: f.shuffle?.showFullscreenButton !== false,
      label: f.shuffle?.label || "Shuffle",
      buttonBg: f.shuffle?.buttonBg || "rgba(255,255,255,0.15)",
      textColor: f.shuffle?.textColor || "#ffffff",
      textSizePx: Number(f.shuffle?.textSizePx) || 16,
      buttonFontSizePx: Number(f.shuffle?.buttonFontSizePx) || 15,
    },
    cards,
    reportingEnabled: f.reportingEnabled,
  };
}

function toPublicScratcher(s) {
  const winChance = Math.min(100, Math.max(0, Number(s.winChancePercent) || 50));
  const loseUrl = (s.assets?.bottomLose || "").trim();
  const winOnly = winChance >= 100 || !loseUrl;
  return {
    gameType: "scratcher",
    id: s.id,
    title: s.title,
    slug: s.slug,
    faviconUrl: s.faviconUrl || "",
    showPoweredBy: s.showPoweredBy !== false,
    scratcherFormat: s.scratcherFormat || "16x9",
    assets: {
      top: s.assets?.top || "",
      bottomWin: s.assets?.bottomWin || "",
      bottomLose: winOnly ? "" : loseUrl,
      button: s.assets?.button || "",
      backgroundImage: s.assets?.backgroundImage || "",
    },
    backgroundColor: s.backgroundColor || "#0a1628",
    sounds: {
      win: s.sounds?.win || null,
      lose: s.sounds?.lose || null,
    },
    winButtonUrl: s.winButtonUrl || "",
    clearThreshold: typeof s.clearThreshold === "number" ? s.clearThreshold : 0.97,
    winChancePercent: winOnly ? 100 : winChance,
    reportingEnabled: s.reportingEnabled,
  };
}

function toPublicQuiz(q) {
  return {
    gameType: "quiz",
    id: q.id,
    title: q.title,
    slug: q.slug,
    faviconUrl: q.faviconUrl || "",
    showPoweredBy: q.showPoweredBy !== false,
    mode: q.mode || { presentation: "frame16x9", motion: "static" },
    branding: q.branding || {},
    playAlong: q.playAlong || { enabled: false },
    tracks: Array.isArray(q.tracks) ? q.tracks : [],
    reportingEnabled: q.reportingEnabled,
  };
}

export const handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...headers, "Access-Control-Allow-Methods": "GET, OPTIONS" } };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }), headers };
  }
  const slug = event.queryStringParameters?.slug;
  if (!slug) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing slug" }), headers };
  }
  const list = await readIndex();
  const item = list.find((x) => x.slug === slug);
  if (!item) {
    return { statusCode: 404, body: JSON.stringify({ error: "Game not found" }), headers };
  }
  const doc = await getWheelJson(item.id);
  if (!doc) {
    return { statusCode: 404, body: JSON.stringify({ error: "Game not found" }), headers };
  }
  const payload =
    doc.gameType === "quiz"
      ? toPublicQuiz(doc)
      : doc.gameType === "scratcher"
      ? toPublicScratcher(doc)
      : doc.gameType === "flip-cards"
        ? toPublicFlipCard(doc)
        : toPublicWheel(doc);
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(payload),
  };
};
