import type { PinboardConfig, PinboardState, PinboardSubmission } from "./types";
import { withPinboardDefaults } from "./config-default";

const API = "/api";

/** Slug from ?slug= / ?event= or clean URLs like /pinboard/:slug(/submit|/moderate). */
export function getGameSlug(): string {
  const params = new URLSearchParams(window.location.search);
  const q = params.get("slug")?.trim();
  if (q) return q;
  const legacy = params.get("event")?.trim();
  if (legacy) return legacy;

  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] === "pinboard" && parts[1]) {
    const slug = decodeURIComponent(parts[1]);
    const surface = parts[2];
    if (!surface || surface === "submit" || surface === "moderate") return slug;
  }
  return "";
}

export function isDemoSlug(slug: string) {
  return !slug || slug === "demo";
}

export async function fetchPublicConfig(slug: string): Promise<PinboardConfig | null> {
  const res = await fetch(`${API}/public-wheel?slug=${encodeURIComponent(slug)}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.gameType !== "pinboard") return null;
  return withPinboardDefaults(publicToConfig(data, slug));
}

export async function fetchState(slug: string): Promise<PinboardState> {
  const res = await fetch(`${API}/pinboard-state?slug=${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error("Could not load pin board state");
  const data = await res.json();
  return {
    version: 1,
    eventId: slug,
    submissions: data.state?.submissions ?? [],
    boardClearedAt: data.state?.boardClearedAt ?? null,
  };
}

export async function postSubmission(
  slug: string,
  submission: Omit<PinboardSubmission, "id" | "status" | "createdAt">,
) {
  const res = await fetch(`${API}/pinboard-state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, submission }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "Submit failed");
  }
  return res.json();
}

export async function patchState(
  slug: string,
  body:
    | { action: "approve"; id: string; placement?: PinboardSubmission["placement"] }
    | { action: "reject"; id: string }
    | { action: "remove"; id: string }
    | { action: "clear_board" }
    | { action: "patch"; id: string; patch: Partial<PinboardSubmission> },
) {
  const res = await fetch(`${API}/pinboard-state`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, ...body }),
  });
  if (!res.ok) throw new Error("Update failed");
  const data = await res.json();
  return data.state as PinboardState;
}

/** Map public-wheel payload → player config shape. */
export function publicToConfig(data: Record<string, unknown>, slug: string): PinboardConfig {
  const board = (data.board as PinboardConfig["board"]) || {};
  const b = board as Record<string, string | boolean | unknown>;
  return {
    eventId: slug,
    title: String(data.title || ""),
    clientName: "",
    slug,
    faviconUrl: String(data.faviconUrl || ""),
    permissions: (data.permissions as PinboardConfig["permissions"]) ?? {
      enabled: false,
      headline: "",
      introText: "",
      gdprUrl: "",
      gdprLinkLabel: "",
      items: [],
      acceptButtonLabel: "Accept and continue",
    },
    board: {
      ...(board as PinboardConfig["board"]),
      headerColor: String(b.headerHex || b.headerColor || "#ffffff"),
      subheadColor: String(b.subheadHex || b.subheadColor || "#dce8e4"),
      backgroundColor: String(b.backgroundHex || b.backgroundColor || "#3d5a4c"),
      headerHex: String(b.headerHex || b.headerColor || "#ffffff"),
      subheadHex: String(b.subheadHex || b.subheadColor || "#dce8e4"),
      backgroundHex: String(b.backgroundHex || b.backgroundColor || "#3d5a4c"),
      fontUploads: (b.fontUploads as PinboardConfig["board"]["fontUploads"]) || undefined,
    },
    mobile: data.mobile as PinboardConfig["mobile"],
    moderator: data.moderator as PinboardConfig["moderator"],
    stickies: (data.stickies as PinboardConfig["stickies"]) || [],
  };
}
