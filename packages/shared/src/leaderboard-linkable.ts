/**
 * Which game types may submit scores to a linked leaderboard module.
 * All other types are excluded from the Studio linker dropdown and rejected by the API.
 *
 * Quiz uses its own session leaderboard — not this module.
 * Wheels, scratchers, flip-cards, and pin boards are not score-competition games.
 */
export const LEADERBOARD_LINKABLE_GAME_TYPES = new Set<string>(["catch"]);

export function isLeaderboardLinkableGameType(gameType?: string | null): boolean {
  const t = (gameType || "spinning-wheel").trim() || "spinning-wheel";
  return LEADERBOARD_LINKABLE_GAME_TYPES.has(t);
}
