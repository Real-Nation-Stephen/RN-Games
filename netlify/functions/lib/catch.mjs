/** Catch arcade game — record helpers and public payload. */

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
  doc.sprites = { ...defaults.sprites, ...(doc.sprites || {}) };
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
  if (g.spawnIntervalMinMs == null || g.spawnIntervalMaxMs == null) {
    const base = Number(g.spawnIntervalMs) || 900;
    g.spawnIntervalMinMs = Math.round(base * 0.6);
    g.spawnIntervalMaxMs = base;
  }
  if (g.fallSpeedStart == null || g.fallSpeedEnd == null) {
    const base = Number(g.fallSpeed) || 220;
    g.fallSpeedStart = base;
    g.fallSpeedEnd = Math.round(base * 1.75);
  }
  g.spawnIntervalMinMs = Math.max(200, Math.min(g.spawnIntervalMinMs, g.spawnIntervalMaxMs));
  g.spawnIntervalMaxMs = Math.max(g.spawnIntervalMinMs, Math.min(2500, g.spawnIntervalMaxMs));
  g.fallSpeedStart = Math.max(80, Number(g.fallSpeedStart) || 220);
  g.fallSpeedEnd = Math.max(g.fallSpeedStart, Number(g.fallSpeedEnd) || 420);
  g.itemSize = Math.max(32, Math.min(160, Number(g.itemSize) || 72));
  const align = String(doc.banner.logoAlign || "center");
  doc.banner.logoAlign = align === "left" || align === "right" ? align : "center";
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
