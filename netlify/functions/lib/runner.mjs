/** Runner arcade game — record helpers and public payload. */

export const RUNNER_MAX_PARALLAX_LAYERS = 5;
export const RUNNER_MAX_SPRITE_CELL = 512;

function emptyItemEffects(negative = false) {
  return negative
    ? {
        addHealth: false,
        addPoints: false,
        addTime: false,
        removeHealth: true,
        removePoints: false,
        removeTime: false,
        healthAmount: 1,
        pointsAmount: 1,
        timeAmount: 1,
      }
    : {
        addHealth: false,
        addPoints: true,
        addTime: false,
        removeHealth: false,
        removePoints: false,
        removeTime: false,
        healthAmount: 1,
        pointsAmount: 1,
        timeAmount: 1,
      };
}

function normalizeItemVariants(raw, negative = false) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    if (!v || typeof v !== "object") continue;
    const url = String(v.url || "").trim();
    if (!url) continue;
    const fx = { ...emptyItemEffects(negative), ...(v.effects || {}) };
    fx.healthAmount = Math.max(1, Math.min(10, Number(fx.healthAmount) || 1));
    fx.pointsAmount = Math.max(1, Math.min(99, Number(fx.pointsAmount) || 1));
    fx.timeAmount = Math.max(1, Math.min(60, Number(fx.timeAmount) || 1));
    out.push({
      id: String(v.id || `v${i + 1}`),
      url,
      width: Math.max(24, Math.min(320, Number(v.width) || 72)),
      height: Math.max(24, Math.min(320, Number(v.height) || 72)),
      y: Math.max(0, Math.min(2000, Number(v.y) || 0)),
      effects: fx,
    });
  }
  return out;
}

function normalizeItems(raw = {}) {
  return {
    positive: normalizeItemVariants(raw.positive, false),
    negative: normalizeItemVariants(raw.negative, true),
  };
}

function emptySheet() {
  return { url: "", cellWidth: 64, cellHeight: 64 };
}

export function emptyRunnerRecord(id, slug) {
  return {
    id,
    gameType: "runner",
    title: "Untitled runner game",
    clientName: "",
    slug,
    updatedAt: new Date().toISOString(),
    reportingEnabled: false,
    reportingLockedAt: null,
    thumbnailUrl: "",
    faviconUrl: "",
    reportingSheetTab: "",
    showPoweredBy: true,
    backgroundHex: "#87c38f",
    backgrounds: { desktop: "", tablet: "", mobile: "" },
    banner: { backgroundHex: "#5a8f62", logoUrl: "", logoAlign: "center" },
    character: {
      run: emptySheet(),
      jump: emptySheet(),
      death: emptySheet(),
      width: 96,
      height: 96,
      groundY: 1600,
      jumpHeight: 280,
    },
    items: { positive: [], negative: [] },
    parallax: [],
    ground: { enabled: false, url: "", y: 1650, height: 48 },
    sounds: {
      positiveItem: null,
      negativeItem: null,
      gameEnd: null,
      music: null,
      musicVolume: 0.35,
    },
    fonts: { heading: "", body: "", score: "" },
    fontUploads: {},
    hud: {
      slots: { left: "score", center: "none", right: "health" },
      scoreHex: "#ffffff",
      timerHex: "#ffffff",
      healthHex: "#ff6b6b",
      healthEmptyHex: "#4a4a4a",
      labelHex: "#e8f5e9",
      healthDisplay: "hearts",
    },
    feedback: { damageFlashHex: "#ff4444", pickupGlowHex: "#ffe066" },
    gameplay: {
      timerEnabled: false,
      durationSec: 60,
      maxHealth: 3,
      scrollSpeedStart: 320,
      scrollSpeedEnd: 520,
      spawnIntervalStartMs: 1800,
      spawnIntervalEndMs: 900,
      positivePercentStart: 40,
      positivePercentEnd: 20,
      respawnMode: "respawn",
      maxRespawns: 2,
      leaderboardMetric: "points",
      jumpHintText: "Tap or press A to jump",
    },
    intro: {
      positiveLine: "Collect these for bonuses",
      negativeLine: "Avoid these obstacles",
      nextLabel: "Next",
    },
    endScreen: {
      logoUrl: "",
      headline: "Run complete!",
      subhead: "Nice run.",
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

export function normalizeRunnerRecord(doc) {
  if (!doc || doc.gameType !== "runner") return doc;
  const defaults = emptyRunnerRecord(doc.id || "", doc.slug || "");
  doc.backgrounds = { ...defaults.backgrounds, ...(doc.backgrounds || {}) };
  doc.banner = { ...defaults.banner, ...(doc.banner || {}) };
  doc.character = { ...defaults.character, ...(doc.character || {}) };
  doc.character.run = { ...defaults.character.run, ...(doc.character.run || {}) };
  doc.character.jump = { ...defaults.character.jump, ...(doc.character.jump || {}) };
  doc.character.death = { ...defaults.character.death, ...(doc.character.death || {}) };
  doc.items = normalizeItems(doc.items || {});
  doc.parallax = (Array.isArray(doc.parallax) ? doc.parallax : [])
    .slice(0, RUNNER_MAX_PARALLAX_LAYERS)
    .filter((l) => l && l.url);
  doc.ground = { ...defaults.ground, ...(doc.ground || {}) };
  doc.sounds = { ...defaults.sounds, ...(doc.sounds || {}) };
  doc.fonts = { ...defaults.fonts, ...(doc.fonts || {}) };
  doc.fontUploads = doc.fontUploads || {};
  doc.hud = { ...defaults.hud, ...(doc.hud || {}), slots: { ...defaults.hud.slots, ...(doc.hud?.slots || {}) } };
  doc.feedback = { ...defaults.feedback, ...(doc.feedback || {}) };
  doc.gameplay = { ...defaults.gameplay, ...(doc.gameplay || {}) };
  doc.intro = { ...defaults.intro, ...(doc.intro || {}) };
  doc.endScreen = {
    ...defaults.endScreen,
    ...(doc.endScreen || {}),
    backgrounds: { ...defaults.endScreen.backgrounds, ...(doc.endScreen?.backgrounds || {}) },
  };
  doc.highScore = { ...defaults.highScore, ...(doc.highScore || {}) };
  doc.linkedLeaderboardSlug = String(doc.linkedLeaderboardSlug || "");

  const g = doc.gameplay;
  g.timerEnabled = g.timerEnabled === true;
  g.durationSec = Math.min(300, Math.max(10, Number(g.durationSec) || 60));
  g.maxHealth = Math.min(10, Math.max(1, Number(g.maxHealth) || 3));
  g.scrollSpeedStart = Math.max(80, Number(g.scrollSpeedStart) || 320);
  g.scrollSpeedEnd = Math.max(g.scrollSpeedStart, Number(g.scrollSpeedEnd) || 520);
  g.spawnIntervalStartMs = Math.max(400, Math.min(4000, Number(g.spawnIntervalStartMs) || 1800));
  g.spawnIntervalEndMs = Math.max(400, Math.min(4000, Number(g.spawnIntervalEndMs) || 900));
  g.positivePercentStart = Math.max(0, Math.min(100, Number(g.positivePercentStart ?? 40)));
  g.positivePercentEnd = Math.max(0, Math.min(100, Number(g.positivePercentEnd ?? 20)));
  g.respawnMode = g.respawnMode === "endOnZero" ? "endOnZero" : "respawn";
  g.maxRespawns = Math.min(10, Math.max(0, Number(g.maxRespawns) || 0));
  g.leaderboardMetric =
    g.leaderboardMetric === "time" || g.leaderboardMetric === "distance" ? g.leaderboardMetric : "points";

  doc.hud.healthDisplay = doc.hud.healthDisplay === "bar" ? "bar" : "hearts";
  const align = String(doc.banner.logoAlign || "center");
  doc.banner.logoAlign = align === "left" || align === "right" ? align : "center";
  doc.endScreen.linkEnabled = doc.endScreen.linkEnabled === true;
  doc.highScore.nameMaxLength = Math.min(32, Math.max(1, Number(doc.highScore.nameMaxLength) || 3));
  return doc;
}

export function toPublicRunner(doc) {
  const g = normalizeRunnerRecord({ ...doc });
  return {
    gameType: "runner",
    id: g.id,
    title: g.title,
    slug: g.slug,
    faviconUrl: g.faviconUrl || "",
    showPoweredBy: g.showPoweredBy !== false,
    backgroundHex: g.backgroundHex || "#87c38f",
    backgrounds: g.backgrounds,
    banner: g.banner,
    character: g.character,
    items: g.items,
    parallax: g.parallax,
    ground: g.ground,
    sounds: {
      positiveItem: g.sounds.positiveItem || null,
      negativeItem: g.sounds.negativeItem || null,
      gameEnd: g.sounds.gameEnd || null,
      music: g.sounds.music || null,
      musicVolume: typeof g.sounds.musicVolume === "number" ? g.sounds.musicVolume : 0.35,
    },
    fonts: g.fonts,
    fontUploads: g.fontUploads || {},
    hud: g.hud,
    feedback: g.feedback,
    gameplay: g.gameplay,
    intro: g.intro,
    endScreen: g.endScreen,
    highScore: g.highScore,
    linkedLeaderboardSlug: g.linkedLeaderboardSlug || "",
    reportingEnabled: !!g.reportingEnabled,
  };
}
