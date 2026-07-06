import {
  emitStepComplete,
  emitStepEngaged,
  isFlowMode,
  parseFlowContextFromSearch,
  saveFlowContext,
} from "@rngames/shared";
import type { PageModuleRecord } from "@rngames/shared/page-modules";
import { track } from "@rngames/shared/track";
import { applyPageFonts } from "./blocks";

export type { PageModuleRecord };

export function getSlugFromPath(segment: string): string {
  const q = new URLSearchParams(window.location.search).get("slug");
  if (q?.trim()) return q.trim();
  const seg = window.location.pathname.split("/").filter(Boolean);
  const i = seg.indexOf(segment);
  if (i >= 0 && seg[i + 1]) return seg[i + 1];
  return "";
}

export async function fetchPageModule(slug: string, expectedType: string): Promise<PageModuleRecord> {
  const res = await fetch(`/api/public-wheel?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Page not found");
  const data = (await res.json()) as PageModuleRecord;
  if (data.gameType !== expectedType) throw new Error("Wrong page type");
  return data;
}

export function initFlowContext() {
  const flowCtx = parseFlowContextFromSearch(new URLSearchParams(window.location.search));
  if (flowCtx) saveFlowContext(flowCtx);
  return flowCtx;
}

export function flowNextLabel(): string {
  return new URLSearchParams(window.location.search).get("nextStepLabel")?.trim() || "Continue";
}

export function flowModeActive(): boolean {
  return isFlowMode();
}

export function pickBackground(cfg: PageModuleRecord): string {
  const w = window.innerWidth;
  const bg = cfg.backgrounds || {};
  if (w < 768 && bg.mobile) return bg.mobile;
  if (w < 1024 && bg.tablet) return bg.tablet;
  return bg.desktop || cfg.backgroundImage || "";
}

export function applyPageTheme(cfg: PageModuleRecord, root: HTMLElement) {
  const bgUrl = pickBackground(cfg);
  root.style.setProperty("--page-bg", cfg.backgroundHex || "#0a1628");
  root.style.setProperty("--page-bg-image", bgUrl ? `url('${bgUrl}')` : "none");
  root.style.setProperty("--page-headline", cfg.typography?.headlineHex || "#ffffff");
  root.style.setProperty("--page-body", cfg.typography?.bodyHex || "#e8eef5");
  root.style.setProperty("--page-btn-bg", cfg.primaryCta?.backgroundHex || "#2d6cdf");
  root.style.setProperty("--page-btn-text", cfg.primaryCta?.textHex || "#ffffff");
  if (cfg.faviconUrl) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = cfg.faviconUrl;
  }
  if (cfg.title) document.title = cfg.title;
  applyPageFonts(cfg);
}

export function wirePoweredBy(cfg: PageModuleRecord) {
  const el = document.getElementById("powered-by-rn");
  if (el) el.hidden = cfg.showPoweredBy === false;
}

export function completeStep(outcomes: Record<string, unknown> = {}) {
  track({
    type: "page.step_complete",
    gameId: String(outcomes.gameId || ""),
    payload: outcomes,
  });
  emitStepComplete({ completed: true, ...outcomes });
}

export function engageStep() {
  emitStepEngaged();
}

export async function patchSessionData(
  sessionId: string,
  data: Record<string, unknown>,
  outcomes: Record<string, unknown> = {},
) {
  await fetch("/api/experience-session", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, data, outcomes }),
  });
}

export async function fetchSession(sessionId: string) {
  const res = await fetch(`/api/experience-session?id=${encodeURIComponent(sessionId)}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.session as {
    outcomes?: Record<string, unknown>;
    data?: Record<string, unknown>;
  };
}

export function scheduleAutoContinue(cfg: PageModuleRecord, onContinue: () => void) {
  if (!flowModeActive() || !cfg.experienceAutoContinue) return;
  const ms = Math.max(500, cfg.experienceAutoContinueDelayMs || 2000);
  window.setTimeout(onContinue, ms);
}

export function setupPagePreview(gameType: string, onConfig: (cfg: PageModuleRecord) => void) {
  window.addEventListener("message", (e) => {
    if (e.origin !== window.location.origin) return;
    if (e.data?.type !== `rngames-${gameType}-config`) return;
    if (e.data.config) onConfig(e.data.config as PageModuleRecord);
  });
}
