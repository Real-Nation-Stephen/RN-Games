import type { LeaderboardConfig, LeaderboardPublicState } from "./types";

const API = "/api/leaderboard-state";

export function getSlugFromPath(): string {
  const q = new URLSearchParams(window.location.search).get("slug");
  if (q) return q.trim();
  const seg = window.location.pathname.split("/").filter(Boolean);
  const i = seg.indexOf("leaderboard");
  if (i >= 0 && seg[i + 1]) return seg[i + 1];
  return "";
}

export async function fetchPublicConfig(slug: string): Promise<LeaderboardConfig> {
  const res = await fetch(`/api/public-wheel?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Leaderboard not found");
  const data = (await res.json()) as LeaderboardConfig;
  if (data.gameType !== "leaderboard") throw new Error("Not a leaderboard");
  return data;
}

export async function pollState(slug: string, rev: number) {
  const url = `${API}?slug=${encodeURIComponent(slug)}&rev=${rev}&cb=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { changed: boolean; revision: number; state: LeaderboardPublicState | null };
}

export async function moderateAction(
  slug: string,
  pin: string,
  body: Record<string, unknown>,
): Promise<LeaderboardPublicState> {
  const res = await fetch(API, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, pin, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return (data as { state: LeaderboardPublicState }).state;
}

/** Linked games call this after a scored round (catch/runner/quiz handoff). */
export async function submitLinkedScore(opts: {
  leaderboardSlug: string;
  sourceGameId: string;
  displayName: string;
  score: number;
  externalId?: string;
  avatarUrl?: string;
  avatarCellWidth?: number;
  avatarCellHeight?: number;
}) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: opts.leaderboardSlug,
      sourceGameId: opts.sourceGameId,
      displayName: opts.displayName,
      score: opts.score,
      externalId: opts.externalId,
      avatarUrl: opts.avatarUrl,
      avatarCellWidth: opts.avatarCellWidth,
      avatarCellHeight: opts.avatarCellHeight,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return data;
}

export const PIN_STORAGE_KEY = "rngames-lb-mod-pin";

export function pinStorageKey(slug: string) {
  return `${PIN_STORAGE_KEY}:${slug}`;
}
