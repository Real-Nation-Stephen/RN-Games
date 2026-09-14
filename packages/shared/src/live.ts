/**
 * Live interactive flow contracts — shared run identity, join branding, and adapter kinds.
 * Heineken (or any client) is configuration, not engine behaviour.
 */

export const LIVE_CAPABLE_TYPES = [
  "mini-poll",
  "fill-game",
  "mini-quiz",
  "pinboard",
  "spinning-wheel",
  "scratcher",
] as const;

export type LiveCapableType = (typeof LIVE_CAPABLE_TYPES)[number];

export const LIVE_PRESENCE_WINDOW_MS = 60_000;

export function isLiveCapableType(moduleType: string): moduleType is LiveCapableType {
  return (LIVE_CAPABLE_TYPES as readonly string[]).includes(moduleType);
}

export interface LiveFontUpload {
  url: string;
  family: string;
}

export type LiveFontUploads = {
  heading?: LiveFontUpload;
  body?: LiveFontUpload;
  button?: LiveFontUpload;
};

export function mergeLiveFontUploads(raw: unknown): LiveFontUploads {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const one = (v: unknown): LiveFontUpload | undefined => {
    if (!v || typeof v !== "object") return undefined;
    const rec = v as Record<string, unknown>;
    const url = typeof rec.url === "string" ? rec.url : "";
    const family = typeof rec.family === "string" ? rec.family : "";
    if (!url || !family) return undefined;
    return { url, family };
  };
  const out: LiveFontUploads = {};
  const heading = one(src.heading);
  const body = one(src.body);
  const button = one(src.button);
  if (heading) out.heading = heading;
  if (body) out.body = body;
  if (button) out.button = button;
  return out;
}

export type LiveAlignX = "left" | "center" | "right";
export type LiveAlignY = "top" | "middle" | "bottom";

/** Per-surface layout for Presenter and phone. 0 size = responsive auto. */
export interface LivePaneLayout {
  alignX: LiveAlignX;
  alignY: LiveAlignY;
  paddingPx: number;
  contentMaxWidthPx: number;
  gapPx: number;
  headingSizePx: number;
  bodySizePx: number;
}

export interface LiveSurfaceLayouts {
  presenter: LivePaneLayout;
  phone: LivePaneLayout;
}

export function defaultLivePaneLayout(surface: "presenter" | "phone"): LivePaneLayout {
  if (surface === "presenter") {
    return {
      alignX: "center",
      alignY: "middle",
      paddingPx: 32,
      contentMaxWidthPx: 1100,
      gapPx: 20,
      headingSizePx: 0,
      bodySizePx: 0,
    };
  }
  return {
    alignX: "center",
    alignY: "top",
    paddingPx: 20,
    contentMaxWidthPx: 420,
    gapPx: 14,
    headingSizePx: 0,
    bodySizePx: 0,
  };
}

export function defaultLiveSurfaceLayouts(): LiveSurfaceLayouts {
  return {
    presenter: defaultLivePaneLayout("presenter"),
    phone: defaultLivePaneLayout("phone"),
  };
}

function clampLayoutInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function normalizeLivePaneLayout(raw: unknown, surface: "presenter" | "phone"): LivePaneLayout {
  const d = defaultLivePaneLayout(surface);
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const alignX: LiveAlignX =
    src.alignX === "left" || src.alignX === "right" || src.alignX === "center" ? src.alignX : d.alignX;
  const alignY: LiveAlignY =
    src.alignY === "top" || src.alignY === "bottom" || src.alignY === "middle" ? src.alignY : d.alignY;
  return {
    alignX,
    alignY,
    paddingPx: clampLayoutInt(src.paddingPx, 0, 160, d.paddingPx),
    contentMaxWidthPx: clampLayoutInt(src.contentMaxWidthPx, 240, 1920, d.contentMaxWidthPx),
    gapPx: clampLayoutInt(src.gapPx, 0, 80, d.gapPx),
    headingSizePx: clampLayoutInt(src.headingSizePx, 0, 120, d.headingSizePx),
    bodySizePx: clampLayoutInt(src.bodySizePx, 0, 64, d.bodySizePx),
  };
}

export function normalizeLiveSurfaceLayouts(raw: unknown): LiveSurfaceLayouts {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    presenter: normalizeLivePaneLayout(src.presenter, "presenter"),
    phone: normalizeLivePaneLayout(src.phone, "phone"),
  };
}

export type LiveLayoutMode = "inherit" | "custom";

/**
 * Live layout: component custom override > Flow joinScreen.layout > responsive defaults.
 * `inherit` (default) uses the flow. Saved `layout` without a mode counts as custom
 * so poll/fill editor controls affect the real live game.
 */
export function componentLayoutMode(branding: unknown): LiveLayoutMode {
  const extra = branding && typeof branding === "object" ? (branding as Record<string, unknown>) : {};
  if (extra.layoutMode === "inherit") return "inherit";
  if (extra.layoutMode === "custom") return "custom";
  return extra.layout != null ? "custom" : "inherit";
}

export function resolveLiveSurfaceLayouts(flowLayout: unknown, componentBranding?: unknown): LiveSurfaceLayouts {
  const flow = normalizeLiveSurfaceLayouts(flowLayout);
  if (componentLayoutMode(componentBranding) !== "custom") return flow;
  const extra = (componentBranding && typeof componentBranding === "object"
    ? (componentBranding as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  if (extra.layout == null) return flow;
  return normalizeLiveSurfaceLayouts(extra.layout);
}

/** Opening / join / closing screen branding on the Flow (not a component). */
export interface LiveJoinScreen {
  logoUrl: string;
  backgroundImageUrl: string;
  presenterBackgroundImageUrl: string;
  backgroundHex: string;
  headline: string;
  instructions: string;
  headlineHex: string;
  bodyHex: string;
  accentHex: string;
  buttonHex: string;
  buttonTextHex: string;
  headingFont: string;
  bodyFont: string;
  buttonFont: string;
  headingFontUrl: string;
  bodyFontUrl: string;
  fontUploads: LiveFontUploads;
  closingHeadline: string;
  closingBody: string;
  layout: LiveSurfaceLayouts;
}

export function defaultLiveJoinScreen(): LiveJoinScreen {
  return {
    logoUrl: "",
    backgroundImageUrl: "",
    presenterBackgroundImageUrl: "",
    backgroundHex: "#07131f",
    headline: "Join the live experience",
    instructions: "Scan the QR code or enter the room code on your phone.",
    headlineHex: "#ffffff",
    bodyHex: "#d7e0ea",
    accentHex: "#3ecf8e",
    buttonHex: "#3ecf8e",
    buttonTextHex: "#07131f",
    headingFont: '"Barlow Condensed", Impact, sans-serif',
    bodyFont: "Inter, system-ui, sans-serif",
    buttonFont: '"Barlow Condensed", Impact, sans-serif',
    headingFontUrl: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;600&display=swap",
    bodyFontUrl: "",
    fontUploads: {},
    closingHeadline: "Thanks for playing",
    closingBody: "That's the end of this live run.",
    layout: defaultLiveSurfaceLayouts(),
  };
}

export function normalizeLiveJoinScreen(raw: unknown): LiveJoinScreen {
  const d = defaultLiveJoinScreen();
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  type JoinStringKey = {
    [K in keyof LiveJoinScreen]: LiveJoinScreen[K] extends string ? K : never;
  }[keyof LiveJoinScreen];
  const str = (key: JoinStringKey) => (typeof src[key] === "string" ? String(src[key]) : d[key]);
  return {
    logoUrl: str("logoUrl"),
    backgroundImageUrl: str("backgroundImageUrl"),
    presenterBackgroundImageUrl: str("presenterBackgroundImageUrl"),
    backgroundHex: str("backgroundHex") || d.backgroundHex,
    headline: str("headline") || d.headline,
    instructions: str("instructions") || d.instructions,
    headlineHex: str("headlineHex") || d.headlineHex,
    bodyHex: str("bodyHex") || d.bodyHex,
    accentHex: str("accentHex") || d.accentHex,
    buttonHex: str("buttonHex") || d.buttonHex,
    buttonTextHex: str("buttonTextHex") || d.buttonTextHex,
    headingFont: str("headingFont") || d.headingFont,
    bodyFont: str("bodyFont") || d.bodyFont,
    buttonFont: str("buttonFont") || d.buttonFont,
    headingFontUrl: str("headingFontUrl"),
    bodyFontUrl: str("bodyFontUrl"),
    fontUploads: mergeLiveFontUploads(src.fontUploads),
    closingHeadline: str("closingHeadline") || d.closingHeadline,
    closingBody: str("closingBody") || d.closingBody,
    layout: normalizeLiveSurfaceLayouts(src.layout),
  };
}

export type LiveRunStatus = "lobby" | "running" | "ended" | "superseded";
export type LiveSurfaceRole = "public" | "participant" | "moderator";

export type LiveNodeKind =
  | "lobby"
  | "closing"
  | "unsupported"
  | LiveCapableType;

export type LivePrizeSource = "wheel" | "scratcher";

export interface LivePrizeAward {
  participantId: string;
  participantNumber: number;
  source: LivePrizeSource;
  nodeId: string;
  roundAttemptId: string;
  reservedAt: string;
  revealedAt?: string | null;
  claimedAt?: string | null;
  ticketId?: string | null;
}

export interface LiveCue {
  kind: "anticipation" | "tally" | "spin" | "scratch-release" | "fill-delta";
  startedAt: number;
  durationMs: number;
}

export interface LiveStepSnapshot {
  id: string;
  moduleInstanceId: string;
  moduleType: string;
  label: string;
  moduleSlug: string;
  liveCapable: boolean;
}
