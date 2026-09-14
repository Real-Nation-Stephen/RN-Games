import {
  liveSurfaceBrandingFromComponent,
  resolveLiveSurfaceLayouts,
  type LivePaneLayout,
} from "@rngames/shared";

type ThemeBag = Record<string, unknown>;

type FontUpload = { url?: string; family?: string };

const LAYOUT_VARS = [
  "--live-align-x",
  "--live-align-y",
  "--live-text-align",
  "--live-pad",
  "--live-pad-bottom",
  "--live-gap",
  "--live-max",
  "--live-heading-size",
  "--live-body-size",
  "--live-option-size",
];

function asStr(v: unknown, fallback = ""): string {
  return typeof v === "string" && v ? v : fallback;
}

function cssSafeFamily(family: string): string {
  return family.replace(/['"\\<>]/g, "").slice(0, 80);
}

export function applyUploadedFonts(uploads?: Record<string, FontUpload | undefined> | unknown) {
  if (!uploads || typeof uploads !== "object") return;
  for (const [role, raw] of Object.entries(uploads as Record<string, FontUpload | undefined>)) {
    const url = asStr(raw?.url);
    const family = cssSafeFamily(asStr(raw?.family));
    if (!url || !family) continue;
    const id = `live-font-face-${role}`;
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = `@font-face{font-family:'${family}';src:url('${url}');font-display:swap;}`;
  }
}

function applyLiveLayout(pane: LivePaneLayout, surface: "phone" | "presenter") {
  const root = document.documentElement.style;
  for (const name of LAYOUT_VARS) root.removeProperty(name);
  const alignX = pane.alignX === "left" ? "flex-start" : pane.alignX === "right" ? "flex-end" : "center";
  const alignY = pane.alignY === "top" ? "flex-start" : pane.alignY === "bottom" ? "flex-end" : "center";
  const dockReserve = surface === "presenter" ? Math.max(96, pane.paddingPx + 72) : pane.paddingPx;
  root.setProperty("--live-align-x", alignX);
  root.setProperty("--live-align-y", alignY);
  root.setProperty("--live-text-align", pane.alignX);
  root.setProperty("--live-pad", `${pane.paddingPx}px`);
  root.setProperty("--live-pad-bottom", `${dockReserve}px`);
  root.setProperty("--live-gap", `${pane.gapPx}px`);
  root.setProperty("--live-max", `${pane.contentMaxWidthPx}px`);
  if (pane.headingSizePx > 0) root.setProperty("--live-heading-size", `${pane.headingSizePx}px`);
  if (pane.bodySizePx > 0) root.setProperty("--live-body-size", `${pane.bodySizePx}px`);
  document.body.dataset.liveSurface = surface;
  document.querySelectorAll(".live-stage").forEach((el) => {
    (el as HTMLElement).dataset.surface = surface;
  });
}

export function applyJoinTheme(
  joinScreen: ThemeBag | undefined,
  extra?: ThemeBag,
  opts?: { surface?: "phone" | "presenter"; component?: ThemeBag },
) {
  const js = joinScreen || {};
  const mapped = opts?.component ? liveSurfaceBrandingFromComponent(opts.component) : undefined;
  const extraBag = { ...(mapped || {}), ...(extra || {}) } as ThemeBag;
  const surface = opts?.surface === "phone" ? "phone" : "presenter";
  const root = document.documentElement.style;
  const bg = asStr(extraBag.backgroundHex, asStr(js.backgroundHex, "#07131f"));
  const joinImage =
    surface === "presenter"
      ? asStr(js.presenterBackgroundImageUrl, asStr(js.backgroundImageUrl))
      : asStr(js.backgroundImageUrl);
  const extraPhone = asStr(extraBag.backgroundImageUrl);
  const extraPresenter = asStr(extraBag.presenterBackgroundImageUrl);
  const image = surface === "presenter" ? extraPresenter || extraPhone || joinImage : extraPhone || joinImage;
  root.setProperty("--live-bg", bg);
  root.setProperty("--live-bg-image", image ? `url("${image}")` : "none");
  root.setProperty("--live-headline", asStr(extraBag.headlineHex, asStr(js.headlineHex, "#fff")));
  root.setProperty("--live-muted", asStr(extraBag.bodyHex, asStr(js.bodyHex, "#d7e0ea")));
  root.setProperty("--live-text", asStr(extraBag.bodyHex, asStr(js.bodyHex, "#f4f7fb")));
  root.setProperty("--live-accent", asStr(extraBag.accentHex, asStr(js.accentHex, "#3ecf8e")));
  root.setProperty("--live-button", asStr(extraBag.buttonHex, asStr(js.buttonHex, "#3ecf8e")));
  root.setProperty("--live-button-text", asStr(extraBag.buttonTextHex, asStr(js.buttonTextHex, "#07131f")));
  root.setProperty(
    "--live-heading-font",
    asStr(extraBag.headingFont, asStr(js.headingFont, '"Barlow Condensed", Impact, sans-serif')),
  );
  root.setProperty("--live-body-font", asStr(extraBag.bodyFont, asStr(js.bodyFont, "Inter, system-ui, sans-serif")));
  root.setProperty(
    "--live-button-font",
    asStr(extraBag.buttonFont, asStr(js.buttonFont, asStr(extraBag.headingFont, asStr(js.headingFont)))),
  );
  const layouts = resolveLiveSurfaceLayouts(js.layout, extraBag);
  applyLiveLayout(layouts[surface], surface);
  applyUploadedFonts(js.fontUploads);
  applyUploadedFonts(extraBag.fontUploads);
  const fontHref = asStr(extraBag.headingFontUrl, asStr(js.headingFontUrl));
  if (fontHref) ensureFontLink(fontHref);
  else removeFontLink();
}

function ensureFontLink(href?: string) {
  if (!href) return;
  const id = "live-font-link";
  let el = document.getElementById(id) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.id = id;
    el.rel = "stylesheet";
    document.head.appendChild(el);
  }
  if (el.href !== href) el.href = href;
}

function removeFontLink() {
  document.getElementById("live-font-link")?.remove();
}

export function cueProgress(cue: { startedAt: number; durationMs: number } | null, now = Date.now()): number {
  if (!cue) return 1;
  if (prefersReducedMotion()) return 1;
  const t = (now - cue.startedAt) / Math.max(1, cue.durationMs);
  return Math.max(0, Math.min(1, t));
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
