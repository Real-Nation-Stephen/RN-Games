import type { RunnerConfig } from "./types";

export function getSlugFromPath(): string {
  const q = new URLSearchParams(window.location.search).get("slug");
  if (q) return q.trim();
  const seg = window.location.pathname.split("/").filter(Boolean);
  const i = seg.indexOf("runner");
  if (i >= 0 && seg[i + 1]) return seg[i + 1];
  return "";
}

export async function fetchPublicConfig(slug: string): Promise<RunnerConfig> {
  const res = await fetch(`/api/public-wheel?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Runner game not found");
  const data = (await res.json()) as RunnerConfig;
  if (data.gameType !== "runner") throw new Error("Not a runner game");
  return data;
}

export type RunnerBreakpoint = "mobile" | "tablet" | "desktop";

export function pickBreakpoint(): RunnerBreakpoint {
  const w = window.innerWidth;
  if (w < 768) return "mobile";
  if (w < 1200) return "tablet";
  return "desktop";
}

export function pickBackgroundUrl(cfg: RunnerConfig, bp: RunnerBreakpoint = pickBreakpoint()): string {
  const bg = cfg.backgrounds?.[bp] || "";
  if (bg) return bg;
  if (bp === "tablet" && cfg.backgrounds?.mobile) return cfg.backgrounds.mobile;
  if (bp === "desktop" && cfg.backgrounds?.tablet) return cfg.backgrounds.tablet;
  return cfg.backgrounds?.desktop || cfg.backgrounds?.mobile || "";
}

export function pickEndBackgroundUrl(cfg: RunnerConfig, bp: RunnerBreakpoint = pickBreakpoint()): string {
  const end = cfg.endScreen?.backgrounds;
  const bg = end?.[bp] || "";
  if (bg) return bg;
  return end?.desktop || end?.tablet || end?.mobile || "";
}
