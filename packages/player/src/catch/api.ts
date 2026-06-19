import type { CatchConfig } from "./types";

export function getSlugFromPath(): string {
  const q = new URLSearchParams(window.location.search).get("slug");
  if (q) return q.trim();
  const seg = window.location.pathname.split("/").filter(Boolean);
  const i = seg.indexOf("catch");
  if (i >= 0 && seg[i + 1]) return seg[i + 1];
  return "";
}

export async function fetchPublicConfig(slug: string): Promise<CatchConfig> {
  const res = await fetch(`/api/public-wheel?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Catch game not found");
  const data = (await res.json()) as CatchConfig;
  if (data.gameType !== "catch") throw new Error("Not a catch game");
  return data;
}

export type CatchBreakpoint = "mobile" | "tablet" | "desktop";

export function pickBreakpoint(): CatchBreakpoint {
  const w = window.innerWidth;
  if (w < 768) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

export function pickBackgroundUrl(cfg: CatchConfig, bp: CatchBreakpoint = pickBreakpoint()): string {
  const bg = cfg.backgrounds?.[bp] || "";
  if (bg) return bg;
  if (bp === "tablet" && cfg.backgrounds?.mobile) return cfg.backgrounds.mobile;
  if (bp === "desktop" && cfg.backgrounds?.tablet) return cfg.backgrounds.tablet;
  return cfg.backgrounds?.desktop || cfg.backgrounds?.mobile || "";
}

export function pickEndBackgroundUrl(cfg: CatchConfig, bp: CatchBreakpoint = pickBreakpoint()): string {
  const end = cfg.endScreen?.backgrounds;
  const bg = end?.[bp] || "";
  if (bg) return bg;
  return end?.desktop || end?.tablet || end?.mobile || "";
}
