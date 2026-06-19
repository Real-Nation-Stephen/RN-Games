/** Leaderboard ranking — shared between player display and server (keep in sync with lib/leaderboard.mjs). */

export interface LeaderboardEntryInput {
  id: string;
  score?: number;
  rankTieAt?: string;
  createdAt?: string;
}

export interface RankedLeaderboardEntry extends LeaderboardEntryInput {
  rank: number;
  displayName?: string;
  source?: "linked" | "manual";
}

export function rankLeaderboardEntries(entries: LeaderboardEntryInput[]): RankedLeaderboardEntry[] {
  const sorted = [...entries].sort((a, b) => {
    const ds = (Number(b.score) || 0) - (Number(a.score) || 0);
    if (ds !== 0) return ds;
    const ta = new Date(a.rankTieAt || a.createdAt || 0).getTime();
    const tb = new Date(b.rankTieAt || b.createdAt || 0).getTime();
    return ta - tb;
  });
  let lastScore: number | null = null;
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

export function liveLeaderboardWindow<T extends { rank: number }>(ranked: T[], panOffset = 0) {
  const total = ranked.length;
  if (total <= 15) {
    return { rows: ranked, indicator: null as string | null, total, panOffset: 0 };
  }
  const windowSize = 10;
  const maxOffset = Math.max(0, total - windowSize);
  const offset = Math.min(Math.max(0, panOffset), maxOffset);
  const rows = ranked.slice(offset, offset + windowSize);
  const from = offset + 1;
  const to = offset + rows.length;
  const indicator = offset === 0 ? `Top ${windowSize} of ${total}` : `Ranks ${from}–${to} of ${total}`;
  return { rows, indicator, total, panOffset: offset };
}

/** In-game high score — separate from the leaderboard module (Phase D+). */
export interface HighScoreSettings {
  enabled: boolean;
  /** Short player tag length, e.g. 3 for arcade initials */
  nameMaxLength: number;
}
