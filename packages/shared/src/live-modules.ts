/**
 * Live-capable component records that are not Heineken-specific.
 * Mini Poll and Fill Game are new library kinds; branding is fully configurable.
 */

import {
  mergeLiveFontUploads,
  normalizeLiveSurfaceLayouts,
  type LiveFontUploads,
  type LiveLayoutMode,
  type LiveSurfaceLayouts,
} from "./live.js";

export type { LiveFontUpload, LiveFontUploads } from "./live.js";

export interface LiveSurfaceBranding {
  logoUrl: string;
  backgroundHex: string;
  backgroundImageUrl: string;
  presenterBackgroundImageUrl: string;
  headlineHex: string;
  bodyHex: string;
  accentHex: string;
  buttonHex: string;
  buttonTextHex: string;
  headingFont: string;
  bodyFont: string;
  buttonFont: string;
  fontUploads: LiveFontUploads;
  /**
   * inherit = Flow joinScreen.layout (then responsive defaults).
   * custom = this `layout` overrides the flow on live Presenter, phones, preview, and standalone.
   */
  layoutMode?: LiveLayoutMode;
  layout?: LiveSurfaceLayouts;
}

export function defaultLiveSurfaceBranding(): LiveSurfaceBranding {
  return {
    logoUrl: "",
    backgroundHex: "#07131f",
    backgroundImageUrl: "",
    presenterBackgroundImageUrl: "",
    headlineHex: "#ffffff",
    bodyHex: "#d7e0ea",
    accentHex: "#3ecf8e",
    buttonHex: "#3ecf8e",
    buttonTextHex: "#07131f",
    headingFont: '"Barlow Condensed", Impact, sans-serif',
    bodyFont: "Inter, system-ui, sans-serif",
    buttonFont: '"Barlow Condensed", Impact, sans-serif',
    fontUploads: {},
  };
}

function mergeBranding(raw: unknown): LiveSurfaceBranding {
  const d = defaultLiveSurfaceBranding();
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    logoUrl: typeof src.logoUrl === "string" ? src.logoUrl : d.logoUrl,
    backgroundHex: typeof src.backgroundHex === "string" && src.backgroundHex ? src.backgroundHex : d.backgroundHex,
    backgroundImageUrl: typeof src.backgroundImageUrl === "string" ? src.backgroundImageUrl : d.backgroundImageUrl,
    presenterBackgroundImageUrl:
      typeof src.presenterBackgroundImageUrl === "string" ? src.presenterBackgroundImageUrl : d.presenterBackgroundImageUrl,
    headlineHex: typeof src.headlineHex === "string" && src.headlineHex ? src.headlineHex : d.headlineHex,
    bodyHex: typeof src.bodyHex === "string" && src.bodyHex ? src.bodyHex : d.bodyHex,
    accentHex: typeof src.accentHex === "string" && src.accentHex ? src.accentHex : d.accentHex,
    buttonHex: typeof src.buttonHex === "string" && src.buttonHex ? src.buttonHex : d.buttonHex,
    buttonTextHex: typeof src.buttonTextHex === "string" && src.buttonTextHex ? src.buttonTextHex : d.buttonTextHex,
    headingFont: typeof src.headingFont === "string" && src.headingFont ? src.headingFont : d.headingFont,
    bodyFont: typeof src.bodyFont === "string" && src.bodyFont ? src.bodyFont : d.bodyFont,
    buttonFont: typeof src.buttonFont === "string" && src.buttonFont ? src.buttonFont : d.buttonFont,
    fontUploads: mergeLiveFontUploads(src.fontUploads),
    layoutMode:
      src.layoutMode === "inherit"
        ? "inherit"
        : src.layoutMode === "custom" || src.layout != null
          ? "custom"
          : "inherit",
    ...(src.layout != null ? { layout: normalizeLiveSurfaceLayouts(src.layout) } : {}),
  };
}

function bag(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function pickStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function fontStackFromFamily(family: unknown): string | undefined {
  const name = pickStr(family)?.replace(/['"\\<>]/g, "");
  if (!name) return undefined;
  return `'${name}', system-ui, sans-serif`;
}

function uploadFamily(raw: unknown): string | undefined {
  const rec = bag(raw);
  return pickStr(rec.family);
}

/** Only copy fields the editor actually set so Flow join-screen fonts/colours inherit. */
export function partialLiveBranding(raw: unknown): Partial<LiveSurfaceBranding> {
  const src = bag(raw);
  const out: Partial<LiveSurfaceBranding> = {};
  const strKeys: Array<keyof LiveSurfaceBranding> = [
    "logoUrl",
    "backgroundHex",
    "backgroundImageUrl",
    "presenterBackgroundImageUrl",
    "headlineHex",
    "bodyHex",
    "accentHex",
    "buttonHex",
    "buttonTextHex",
    "headingFont",
    "bodyFont",
    "buttonFont",
  ];
  for (const key of strKeys) {
    const value = pickStr(src[key]);
    if (value) (out as Record<string, string>)[key] = value;
  }
  const uploads = mergeLiveFontUploads(src.fontUploads);
  if (Object.keys(uploads).length) out.fontUploads = uploads;
  if (src.layout != null) {
    out.layout = normalizeLiveSurfaceLayouts(src.layout);
    out.layoutMode =
      src.layoutMode === "inherit" ? "inherit" : src.layoutMode === "custom" || src.layout != null ? "custom" : "inherit";
  } else if (src.layoutMode === "inherit" || src.layoutMode === "custom") {
    out.layoutMode = src.layoutMode;
  }
  return out;
}

function attachComponentLayout(
  branding: Partial<LiveSurfaceBranding>,
  component: unknown,
): Partial<LiveSurfaceBranding> {
  const c = bag(component);
  const fromBranding = bag(c.branding);
  const extra = partialLiveBranding({
    layoutMode: c.layoutMode ?? fromBranding.layoutMode,
    layout: c.layout ?? fromBranding.layout,
  });
  return { ...branding, ...extra };
}

/** Map editor-native fields for all six live kinds onto the shared surface bag. */
export function liveSurfaceBrandingFromComponent(component: unknown): Partial<LiveSurfaceBranding> {
  const c = bag(component);
  const kind = String(c.gameType || "");
  if (kind === "mini-poll" || kind === "fill-game") {
    return attachComponentLayout(partialLiveBranding(c.branding), c);
  }
  if (kind === "mini-quiz") {
    const ty = bag(c.typography);
    const fonts = bag(ty.fonts);
    const bgs = bag(c.backgrounds);
    const cta = bag(c.primaryCta);
    const uploads = mergeLiveFontUploads(ty.fontUploads);
    const headingFamily = pickStr(fonts.heading) || fontStackFromFamily(uploads.heading?.family);
    const bodyFamily = pickStr(fonts.body) || fontStackFromFamily(uploads.body?.family);
    const buttonFamily = pickStr(fonts.button) || fontStackFromFamily(uploads.button?.family);
    return attachComponentLayout(partialLiveBranding({
      logoUrl: c.logoUrl,
      backgroundHex: c.backgroundHex,
      backgroundImageUrl: bgs.mobile || c.backgroundImage,
      presenterBackgroundImageUrl: bgs.desktop || bgs.tablet || c.backgroundImage,
      headlineHex: ty.headlineHex,
      bodyHex: ty.bodyHex || ty.subheadHex,
      buttonHex: cta.backgroundHex,
      buttonTextHex: cta.textHex,
      headingFont: headingFamily,
      bodyFont: bodyFamily,
      buttonFont: buttonFamily,
      fontUploads: uploads,
    }), c);
  }
  if (kind === "pinboard") {
    const board = bag(c.board);
    const mobile = bag(c.mobile);
    const boardFonts = bag(board.fonts);
    const rawUploads = bag(board.fontUploads);
    const headingUp = bag(rawUploads.heading);
    const subUp = bag(rawUploads.subheading);
    const bodyUp = Object.keys(subUp).length ? subUp : bag(rawUploads.body);
    const headingFamily =
      fontStackFromFamily(headingUp.family) || pickStr(boardFonts.heading) || fontStackFromFamily(uploadFamily(rawUploads.heading));
    const bodyFamily =
      fontStackFromFamily(bodyUp.family) || pickStr(boardFonts.subheading) || pickStr(boardFonts.body);
    const presenterBg = board.useBackgroundImage ? board.backgroundImage || "" : "";
    const phoneBg = mobile.useBackgroundImage ? mobile.backgroundImage || mobile.backgroundImageUrl || "" : "";
    return attachComponentLayout(partialLiveBranding({
      logoUrl: board.brandLogoUrl,
      backgroundHex: board.backgroundHex || board.backgroundColor || mobile.backgroundHex,
      backgroundImageUrl: phoneBg,
      presenterBackgroundImageUrl: presenterBg,
      headlineHex: board.headerHex || board.headerColor,
      bodyHex: board.subheadHex || mobile.textHex,
      accentHex: mobile.buttonHex,
      buttonHex: mobile.buttonHex,
      buttonTextHex: mobile.buttonTextHex,
      headingFont: headingFamily,
      bodyFont: bodyFamily,
      fontUploads: {
        heading: rawUploads.heading,
        body: Object.keys(subUp).length ? rawUploads.subheading : rawUploads.body,
        button: rawUploads.button,
      },
    }), c);
  }
  if (kind === "spinning-wheel") {
    const assets = bag(c.assets);
    return attachComponentLayout(
      partialLiveBranding({
        logoUrl: assets.logo,
        backgroundImageUrl: assets.background,
        presenterBackgroundImageUrl: assets.background,
      }),
      c,
    );
  }
  if (kind === "scratcher") {
    const assets = bag(c.assets);
    return attachComponentLayout(
      partialLiveBranding({
        backgroundHex: c.backgroundColor || c.backgroundHex,
        backgroundImageUrl: assets.backgroundImage,
        presenterBackgroundImageUrl: assets.backgroundImage,
      }),
      c,
    );
  }
  return attachComponentLayout(partialLiveBranding(c.branding), c);
}

export function withLiveSurfaceBranding<T extends Record<string, unknown>>(
  pub: T,
): T & { branding: Partial<LiveSurfaceBranding> } {
  return { ...pub, branding: liveSurfaceBrandingFromComponent(pub) };
}

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface MiniPollOption {
  id: string;
  label: string;
  imageUrl: string;
  accessibleLabel: string;
}

export interface MiniPollRecord {
  id: string;
  gameType: "mini-poll";
  title: string;
  clientName: string;
  slug: string;
  projectCode: string;
  designCode: string;
  updatedAt: string;
  reportingEnabled: boolean;
  reportingLockedAt?: string | null;
  thumbnailUrl?: string;
  faviconUrl?: string;
  showPoweredBy?: boolean;
  archived?: boolean;
  question: string;
  options: [MiniPollOption, MiniPollOption];
  revealDurationMs: number;
  branding: LiveSurfaceBranding;
}

export function emptyMiniPoll(partial: { id: string; slug: string }): MiniPollRecord {
  return {
    id: partial.id,
    gameType: "mini-poll",
    title: "Untitled mini poll",
    clientName: "",
    slug: partial.slug,
    projectCode: "",
    designCode: "",
    updatedAt: new Date().toISOString(),
    reportingEnabled: false,
    reportingLockedAt: null,
    thumbnailUrl: "",
    faviconUrl: "",
    showPoweredBy: false,
    archived: false,
    question: "Which option do you prefer?",
    options: [
      { id: newId(), label: "Option A", imageUrl: "", accessibleLabel: "Option A" },
      { id: newId(), label: "Option B", imageUrl: "", accessibleLabel: "Option B" },
    ],
    revealDurationMs: 3000,
    branding: defaultLiveSurfaceBranding(),
  };
}

function normalizeOption(raw: unknown, fallbackLabel: string): MiniPollOption {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const imageUrl = typeof src.imageUrl === "string" ? src.imageUrl : "";
  const rawLabel = typeof src.label === "string" ? src.label : "";
  const hasImage = !!imageUrl.trim();
  const label = !rawLabel.trim() && hasImage ? "" : rawLabel.trim() || fallbackLabel;
  const accessible =
    typeof src.accessibleLabel === "string" && src.accessibleLabel.trim()
      ? src.accessibleLabel.trim()
      : label || fallbackLabel;
  return {
    id: typeof src.id === "string" && src.id ? src.id : newId(),
    label,
    imageUrl,
    accessibleLabel: accessible,
  };
}

export function normalizeMiniPoll(doc: Partial<MiniPollRecord> & { id: string; slug: string }): MiniPollRecord {
  const d = emptyMiniPoll({ id: doc.id, slug: doc.slug });
  const optionsIn = Array.isArray(doc.options) ? doc.options : [];
  return {
    ...d,
    ...doc,
    gameType: "mini-poll",
    title: String(doc.title || d.title),
    clientName: String(doc.clientName || ""),
    slug: String(doc.slug || d.slug).trim().toLowerCase(),
    question: String(doc.question || d.question),
    options: [normalizeOption(optionsIn[0], "Option A"), normalizeOption(optionsIn[1], "Option B")],
    revealDurationMs: Math.min(8000, Math.max(1200, Number(doc.revealDurationMs) || d.revealDurationMs)),
    branding: mergeBranding(doc.branding),
  };
}

export function toPublicMiniPoll(doc: MiniPollRecord): MiniPollRecord {
  return normalizeMiniPoll(doc);
}

export interface FillGameQuestionChoice {
  id: string;
  label: string;
}

export interface FillGameQuestion {
  id: string;
  prompt: string;
  choices: FillGameQuestionChoice[];
  correctChoiceId: string;
}

export interface FillGameTeam {
  id: string;
  name: string;
  colorHex: string;
  fillHex: string;
  target: number;
}

export type FillMetricMode = "count" | "percent";

export interface FillMaskPlacement {
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
}

export interface FillGameRecord {
  id: string;
  gameType: "fill-game";
  title: string;
  clientName: string;
  slug: string;
  projectCode: string;
  designCode: string;
  updatedAt: string;
  reportingEnabled: boolean;
  reportingLockedAt?: string | null;
  thumbnailUrl?: string;
  faviconUrl?: string;
  showPoweredBy?: boolean;
  archived?: boolean;
  teams: [FillGameTeam, FillGameTeam];
  metric: FillMetricMode;
  maskUrl: string;
  maskPlacement: FillMaskPlacement;
  foregroundUrl: string;
  questions: FillGameQuestion[];
  branding: LiveSurfaceBranding;
}

/** Accept a stored 0%; `Number(x) || fallback` would replace it with the default. */
export function clampFillPercent(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function emptyFillGame(partial: { id: string; slug: string }): FillGameRecord {
  const c1 = newId();
  const c2 = newId();
  return {
    id: partial.id,
    gameType: "fill-game",
    title: "Untitled fill game",
    clientName: "",
    slug: partial.slug,
    projectCode: "",
    designCode: "",
    updatedAt: new Date().toISOString(),
    reportingEnabled: false,
    reportingLockedAt: null,
    thumbnailUrl: "",
    faviconUrl: "",
    showPoweredBy: false,
    archived: false,
    teams: [
      { id: "team-a", name: "Team A", colorHex: "#3ecf8e", fillHex: "#3ecf8e", target: 8 },
      { id: "team-b", name: "Team B", colorHex: "#f3c14e", fillHex: "#f3c14e", target: 8 },
    ],
    metric: "count",
    maskUrl: "",
    maskPlacement: { xPercent: 0, yPercent: 0, widthPercent: 100, heightPercent: 100 },
    foregroundUrl: "",
    questions: [
      {
        id: newId(),
        prompt: "Sample question?",
        choices: [
          { id: c1, label: "Correct" },
          { id: c2, label: "Incorrect" },
        ],
        correctChoiceId: c1,
      },
    ],
    branding: defaultLiveSurfaceBranding(),
  };
}

function normalizeTeam(raw: unknown, fallback: FillGameTeam): FillGameTeam {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    id: typeof src.id === "string" && src.id ? src.id : fallback.id,
    name: typeof src.name === "string" && src.name.trim() ? src.name : fallback.name,
    colorHex: typeof src.colorHex === "string" && src.colorHex ? src.colorHex : fallback.colorHex,
    fillHex: typeof src.fillHex === "string" && src.fillHex ? src.fillHex : fallback.fillHex,
    target: Math.max(1, Math.min(999, Number(src.target) || fallback.target)),
  };
}

function normalizeFillQuestion(raw: unknown): FillGameQuestion | null {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const choicesIn = Array.isArray(src.choices) ? src.choices : [];
  const choices = choicesIn
    .map((c) => {
      const x = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
      return {
        id: typeof x.id === "string" && x.id ? x.id : newId(),
        label: typeof x.label === "string" ? x.label : "Option",
      };
    })
    .slice(0, 6);
  while (choices.length < 2) {
    choices.push({ id: newId(), label: `Option ${choices.length + 1}` });
  }
  const correct =
    typeof src.correctChoiceId === "string" && choices.some((c) => c.id === src.correctChoiceId)
      ? src.correctChoiceId
      : choices[0].id;
  return {
    id: typeof src.id === "string" && src.id ? src.id : newId(),
    prompt: typeof src.prompt === "string" ? src.prompt : "Question?",
    choices,
    correctChoiceId: correct,
  };
}

export function normalizeFillGame(doc: Partial<FillGameRecord> & { id: string; slug: string }): FillGameRecord {
  const d = emptyFillGame({ id: doc.id, slug: doc.slug });
  const teamsIn = Array.isArray(doc.teams) ? doc.teams : [];
  const questions = Array.isArray(doc.questions)
    ? doc.questions.map(normalizeFillQuestion).filter((q): q is FillGameQuestion => !!q)
    : d.questions;
  const place = doc.maskPlacement && typeof doc.maskPlacement === "object" ? doc.maskPlacement : d.maskPlacement;
  const overlayRaw = doc as Partial<FillGameRecord> & { overlayUrl?: unknown };
  const foregroundUrl =
    typeof doc.foregroundUrl === "string" && doc.foregroundUrl
      ? doc.foregroundUrl
      : typeof overlayRaw.overlayUrl === "string"
        ? overlayRaw.overlayUrl
        : "";
  return {
    ...d,
    ...doc,
    gameType: "fill-game",
    title: String(doc.title || d.title),
    clientName: String(doc.clientName || ""),
    slug: String(doc.slug || d.slug).trim().toLowerCase(),
    teams: [normalizeTeam(teamsIn[0], d.teams[0]), normalizeTeam(teamsIn[1], d.teams[1])],
    metric: doc.metric === "percent" ? "percent" : "count",
    maskUrl: typeof doc.maskUrl === "string" ? doc.maskUrl : "",
    maskPlacement: {
      xPercent: clampFillPercent(place.xPercent, d.maskPlacement.xPercent, 0, 100),
      yPercent: clampFillPercent(place.yPercent, d.maskPlacement.yPercent, 0, 100),
      widthPercent: clampFillPercent(place.widthPercent, d.maskPlacement.widthPercent, 5, 100),
      heightPercent: clampFillPercent(place.heightPercent, d.maskPlacement.heightPercent, 5, 100),
    },
    foregroundUrl,
    questions: questions.length ? questions : d.questions,
    branding: mergeBranding(doc.branding),
  };
}

/** Public / live-phone payload — never includes correctChoiceId. */
export function toPublicFillGame(doc: FillGameRecord): Omit<FillGameRecord, "questions"> & {
  questions: Array<Omit<FillGameQuestion, "correctChoiceId">>;
} {
  const n = normalizeFillGame(doc);
  return {
    ...n,
    questions: n.questions.map(({ correctChoiceId: _c, ...q }) => q),
  };
}
