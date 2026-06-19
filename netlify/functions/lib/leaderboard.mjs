/** Leaderboard module — record helpers, ranking, public payload. */

/** gameType values allowed to POST scores into a linked leaderboard (see shared leaderboard-linkable.ts). */
export const LEADERBOARD_LINKABLE_GAME_TYPES = new Set([
  // Phase D: "catch"
  // Phase E: "dino-runner"
]);

export function isLeaderboardLinkableGameType(gameType) {
  const t = String(gameType || "spinning-wheel").trim() || "spinning-wheel";
  return LEADERBOARD_LINKABLE_GAME_TYPES.has(t);
}

export function emptyLeaderboardRecord(id, slug) {
  return {
    id,
    gameType: "leaderboard",
    title: "Untitled leaderboard",
    clientName: "",
    slug,
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

export function normalizeLeaderboardRecord(doc) {
  if (!doc || doc.gameType !== "leaderboard") return doc;
  const defaults = emptyLeaderboardRecord(doc.id || "", doc.slug || "");
  doc.mode = doc.mode === "linked" ? "linked" : "manual";
  doc.linkedGameId = String(doc.linkedGameId || "");
  doc.linkedGameSlug = String(doc.linkedGameSlug || "");
  doc.linkedGameTitle = String(doc.linkedGameTitle || "");
  doc.moderatorPin = String(doc.moderatorPin || "1234").slice(0, 12);
  doc.board = { ...defaults.board, ...(doc.board || {}) };
  doc.moderator = { ...defaults.moderator, ...(doc.moderator || {}) };
  return doc;
}

export function emptyLeaderboardState(wheelId) {
  return {
    version: 1,
    wheelId,
    revision: 0,
    panOffset: 0,
    entries: [],
    clearedAt: null,
  };
}

/** @param {Array<{ id: string; score?: number; rankTieAt?: string; createdAt?: string }>} entries */
export function rankLeaderboardEntries(entries) {
  const sorted = [...(entries || [])].sort((a, b) => {
    const ds = (Number(b.score) || 0) - (Number(a.score) || 0);
    if (ds !== 0) return ds;
    const ta = new Date(a.rankTieAt || a.createdAt || 0).getTime();
    const tb = new Date(b.rankTieAt || b.createdAt || 0).getTime();
    return ta - tb;
  });
  let lastScore = null;
  let lastRank = 0;
  let count = 0;
  return sorted.map((entry) => {
    count += 1;
    const score = Number(entry.score) || 0;
    if (score !== lastScore) {
      lastRank = count;
      lastScore = score;
    }
    return { ...entry, rank: lastRank };
  });
}

/** Live board window: ≤15 all rows; 16+ top 10 (or panned slice). */
export function liveLeaderboardWindow(ranked, panOffset = 0) {
  const total = ranked.length;
  if (total <= 15) {
    return { rows: ranked, indicator: total > 0 ? null : null, total, panOffset: 0 };
  }
  const windowSize = 10;
  const maxOffset = Math.max(0, total - windowSize);
  const offset = Math.min(Math.max(0, Number(panOffset) || 0), maxOffset);
  const rows = ranked.slice(offset, offset + windowSize);
  const from = offset + 1;
  const to = offset + rows.length;
  const indicator =
    offset === 0 ? `Top ${windowSize} of ${total}` : `Ranks ${from}–${to} of ${total}`;
  return { rows, indicator, total, panOffset: offset };
}

export function toPublicLeaderboard(doc) {
  const mod = doc.moderator || {};
  return {
    gameType: "leaderboard",
    id: doc.id,
    title: doc.title,
    slug: doc.slug,
    faviconUrl: doc.faviconUrl || "",
    showPoweredBy: doc.showPoweredBy !== false,
    mode: doc.mode === "linked" ? "linked" : "manual",
    linkedGameId: doc.linkedGameId || "",
    linkedGameSlug: doc.linkedGameSlug || "",
    board: doc.board || {},
    moderator: {
      headline: mod.headline || "Leaderboard moderation",
      backgroundHex: mod.backgroundHex || "#121820",
      textHex: mod.textHex || "#eef2f7",
      buttonHex: mod.buttonHex || "#2d6a4f",
      buttonTextHex: mod.buttonTextHex || "#ffffff",
      buttonDangerHex: mod.buttonDangerHex || "#8b2e2e",
      buttonDangerTextHex: mod.buttonDangerTextHex || "#ffffff",
    },
    reportingEnabled: !!doc.reportingEnabled,
  };
}

export function toPublicLeaderboardState(state) {
  const ranked = rankLeaderboardEntries(state.entries || []);
  const view = liveLeaderboardWindow(ranked, state.panOffset);
  const mapRow = (r) => ({
    id: r.id,
    rank: r.rank,
    displayName: r.displayName,
    score: r.score,
    source: r.source,
  });
  return {
    revision: state.revision || 0,
    panOffset: view.panOffset,
    total: view.total,
    indicator: view.indicator,
    rows: view.rows.map(mapRow),
    entries: ranked.map(mapRow),
  };
}
