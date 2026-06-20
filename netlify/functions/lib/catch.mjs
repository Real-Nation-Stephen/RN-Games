/** Catch arcade game — record helpers and public payload. */

function normalizeItemVariants(raw, legacyUrl) {
  const list = Array.isArray(raw) ? raw : [];
  const normalized = [];
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
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
  if (!normalized.length && legacy) {
    return [{ id: "v1", url: legacy, points: 1 }];
  }
  return normalized;
}

function normalizeSprites(raw = {}) {
  return {
    positive: normalizeItemVariants(raw.positive, raw.positiveUrl),
    negative: normalizeItemVariants(raw.negative, raw.negativeUrl),
  };
}

export function emptyCatchRecord(id, slug) {
  return {
    id,
    gameType: "catch",
    title: "Untitled catch game",
    clientName: "",
    slug,
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

export function normalizeCatchRecord(doc) {
  if (!doc || doc.gameType !== "catch") return doc;
  const defaults = emptyCatchRecord(doc.id || "", doc.slug || "");
  doc.backgrounds = { ...defaults.backgrounds, ...(doc.backgrounds || {}) };
  doc.banner = { ...defaults.banner, ...(doc.banner || {}) };
  doc.sprites = normalizeSprites(doc.sprites || {});
  doc.sounds = { ...defaults.sounds, ...(doc.sounds || {}) };
  doc.fonts = { ...defaults.fonts, ...(doc.fonts || {}) };
  doc.fontUploads = doc.fontUploads || {};
  doc.hud = { ...defaults.hud, ...(doc.hud || {}) };
  doc.gameplay = { ...defaults.gameplay, ...(doc.gameplay || {}) };
  doc.intro = { ...defaults.intro, ...(doc.intro || {}) };
  doc.endScreen = {
    ...defaults.endScreen,
    ...(doc.endScreen || {}),
    backgrounds: { ...defaults.endScreen.backgrounds, ...(doc.endScreen?.backgrounds || {}) },
  };
  doc.highScore = { ...defaults.highScore, ...(doc.highScore || {}) };
  doc.linkedLeaderboardSlug = String(doc.linkedLeaderboardSlug || "");
  doc.gameplay.durationSec = Math.min(300, Math.max(10, Number(doc.gameplay.durationSec) || 60));
  doc.gameplay.positiveOnly = !!doc.gameplay.positiveOnly;
  const g = doc.gameplay;
  if (g.spawnIntervalStartMs == null || g.spawnIntervalEndMs == null) {
    const legacyMin = Number(g.spawnIntervalMinMs);
    const legacyMax = Number(g.spawnIntervalMaxMs);
    const base = Number(g.spawnIntervalMs) || defaults.gameplay.spawnIntervalEndMs;
    if (Number.isFinite(legacyMin) && Number.isFinite(legacyMax)) {
      g.spawnIntervalStartMs = Math.max(legacyMin, legacyMax);
      g.spawnIntervalEndMs = Math.min(legacyMin, legacyMax);
    } else {
      g.spawnIntervalStartMs = Math.round(base * 1.2);
      g.spawnIntervalEndMs = base;
    }
  }
  if (g.fallSpeedStart == null || g.fallSpeedEnd == null) {
    const base = Number(g.fallSpeed) || 220;
    g.fallSpeedStart = base;
    g.fallSpeedEnd = Math.round(base * 1.75);
  }
  g.spawnIntervalStartMs = Math.max(200, Math.min(2500, Number(g.spawnIntervalStartMs) || 950));
  g.spawnIntervalEndMs = Math.max(200, Math.min(2500, Number(g.spawnIntervalEndMs) || 550));
  g.fallSpeedStart = Math.max(80, Number(g.fallSpeedStart) || 220);
  g.fallSpeedEnd = Math.max(g.fallSpeedStart, Number(g.fallSpeedEnd) || 420);
  g.positivePercentStart = Math.max(0, Math.min(100, Number(g.positivePercentStart ?? 50)));
  g.positivePercentEnd = Math.max(0, Math.min(100, Number(g.positivePercentEnd ?? 10)));
  g.itemSize = Math.max(32, Math.min(160, Number(g.itemSize) || 72));
  g.catcherWidth = Math.max(40, Math.min(420, Number(g.catcherWidth) || 140));
  g.catcherHeight = Math.max(40, Math.min(420, Number(g.catcherHeight) || 120));
  g.pointsAddTime = g.pointsAddTime === true;
  const align = String(doc.banner.logoAlign || "center");
  doc.banner.logoAlign = align === "left" || align === "right" ? align : "center";
  doc.endScreen.linkEnabled = doc.endScreen.linkEnabled === true;
  doc.highScore.nameMaxLength = Math.min(32, Math.max(1, Number(doc.highScore.nameMaxLength) || 3));
  return doc;
}

export function toPublicCatch(doc) {
  const g = normalizeCatchRecord({ ...doc });
  return {
    gameType: "catch",
    id: g.id,
    title: g.title,
    slug: g.slug,
    faviconUrl: g.faviconUrl || "",
    showPoweredBy: g.showPoweredBy !== false,
    backgroundHex: g.backgroundHex || "#1a2a3a",
    backgrounds: g.backgrounds,
    banner: g.banner,
    sprites: g.sprites,
    catcherSpriteUrl: g.catcherSpriteUrl || "",
    sounds: {
      positiveCatch: g.sounds.positiveCatch || null,
      negativeCatch: g.sounds.negativeCatch || null,
      gameEnd: g.sounds.gameEnd || null,
      music: g.sounds.music || null,
      musicVolume: typeof g.sounds.musicVolume === "number" ? g.sounds.musicVolume : 0.35,
    },
    fonts: g.fonts,
    fontUploads: g.fontUploads || {},
    hud: g.hud,
    gameplay: g.gameplay,
    intro: g.intro,
    endScreen: g.endScreen,
    highScore: g.highScore,
    linkedLeaderboardSlug: g.linkedLeaderboardSlug || "",
    reportingEnabled: !!g.reportingEnabled,
  };
}
