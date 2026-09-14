/** Backend mirrors of shared live-modules (Netlify functions cannot import the TS package). */

function defaultBranding() {
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

function mergeFontUpload(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  const url = typeof raw.url === "string" ? raw.url : "";
  const family = typeof raw.family === "string" ? raw.family : "";
  if (!url || !family) return undefined;
  return { url, family };
}

function defaultPane(surface) {
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

function clampLayoutInt(value, min, max, fallback) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function normalizeLivePaneLayout(raw, surface) {
  const d = defaultPane(surface);
  const src = raw && typeof raw === "object" ? raw : {};
  const alignX = src.alignX === "left" || src.alignX === "right" || src.alignX === "center" ? src.alignX : d.alignX;
  const alignY = src.alignY === "top" || src.alignY === "bottom" || src.alignY === "middle" ? src.alignY : d.alignY;
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

export function normalizeLiveSurfaceLayouts(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    presenter: normalizeLivePaneLayout(src.presenter, "presenter"),
    phone: normalizeLivePaneLayout(src.phone, "phone"),
  };
}

function mergeBranding(raw) {
  const d = defaultBranding();
  const src = raw && typeof raw === "object" ? raw : {};
  const uploads = src.fontUploads && typeof src.fontUploads === "object" ? src.fontUploads : {};
  const out = {
    ...d,
    logoUrl: typeof src.logoUrl === "string" ? src.logoUrl : d.logoUrl,
    backgroundHex: src.backgroundHex || d.backgroundHex,
    backgroundImageUrl: typeof src.backgroundImageUrl === "string" ? src.backgroundImageUrl : d.backgroundImageUrl,
    presenterBackgroundImageUrl: String(src.presenterBackgroundImageUrl || d.presenterBackgroundImageUrl),
    headlineHex: src.headlineHex || d.headlineHex,
    bodyHex: src.bodyHex || d.bodyHex,
    accentHex: src.accentHex || d.accentHex,
    buttonHex: src.buttonHex || d.buttonHex,
    buttonTextHex: src.buttonTextHex || d.buttonTextHex,
    headingFont: src.headingFont || d.headingFont,
    bodyFont: src.bodyFont || d.bodyFont,
    buttonFont: String(src.buttonFont || d.buttonFont),
    fontUploads: {
      heading: mergeFontUpload(uploads.heading),
      body: mergeFontUpload(uploads.body),
      button: mergeFontUpload(uploads.button),
    },
  };
  if (src.layout != null) out.layout = normalizeLiveSurfaceLayouts(src.layout);
  out.layoutMode =
    src.layoutMode === "inherit"
      ? "inherit"
      : src.layoutMode === "custom" || src.layout != null
        ? "custom"
        : "inherit";
  return out;
}

export function componentLayoutMode(branding) {
  const extra = rec(branding);
  if (extra.layoutMode === "inherit") return "inherit";
  if (extra.layoutMode === "custom") return "custom";
  return extra.layout != null ? "custom" : "inherit";
}

export function resolveLiveSurfaceLayouts(flowLayout, componentBranding) {
  const flow = normalizeLiveSurfaceLayouts(flowLayout);
  if (componentLayoutMode(componentBranding) !== "custom") return flow;
  const extra = rec(componentBranding);
  if (extra.layout == null) return flow;
  return normalizeLiveSurfaceLayouts(extra.layout);
}

function rec(v) {
  return v && typeof v === "object" ? v : {};
}

function pickStr(v) {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function fontStackFromFamily(family) {
  const name = pickStr(family)?.replace(/['"\\<>]/g, "");
  if (!name) return undefined;
  return `'${name}', system-ui, sans-serif`;
}

export function partialLiveBranding(raw) {
  const src = rec(raw);
  const out = {};
  const strKeys = [
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
    if (value) out[key] = value;
  }
  const uploads = src.fontUploads && typeof src.fontUploads === "object" ? src.fontUploads : {};
  const fontUploads = {
    heading: mergeFontUpload(uploads.heading),
    body: mergeFontUpload(uploads.body),
    button: mergeFontUpload(uploads.button),
  };
  if (fontUploads.heading || fontUploads.body || fontUploads.button) out.fontUploads = fontUploads;
  if (src.layout != null) {
    out.layout = normalizeLiveSurfaceLayouts(src.layout);
    out.layoutMode =
      src.layoutMode === "inherit" ? "inherit" : src.layoutMode === "custom" || src.layout != null ? "custom" : "inherit";
  } else if (src.layoutMode === "inherit" || src.layoutMode === "custom") {
    out.layoutMode = src.layoutMode;
  }
  return out;
}

function attachComponentLayout(branding, component) {
  const c = rec(component);
  const fromBranding = rec(c.branding);
  return {
    ...branding,
    ...partialLiveBranding({
      layoutMode: c.layoutMode ?? fromBranding.layoutMode,
      layout: c.layout ?? fromBranding.layout,
    }),
  };
}

/**
 * Map editor-native poll/fill branding plus quiz/pinboard/wheel/scratcher fields
 * onto the shared live surface bag. Adapted kinds are partial so Flow fonts inherit.
 */
export function liveSurfaceBrandingFromComponent(component) {
  const c = rec(component);
  const kind = String(c.gameType || "");
  if (kind === "mini-poll" || kind === "fill-game") {
    return attachComponentLayout(partialLiveBranding(c.branding), c);
  }
  if (kind === "mini-quiz") {
    const ty = rec(c.typography);
    const fonts = rec(ty.fonts);
    const bgs = rec(c.backgrounds);
    const cta = rec(c.primaryCta);
    const uploads = rec(ty.fontUploads);
    return attachComponentLayout(partialLiveBranding({
      logoUrl: c.logoUrl,
      backgroundHex: c.backgroundHex,
      backgroundImageUrl: bgs.mobile || c.backgroundImage,
      presenterBackgroundImageUrl: bgs.desktop || bgs.tablet || c.backgroundImage,
      headlineHex: ty.headlineHex,
      bodyHex: ty.bodyHex || ty.subheadHex,
      buttonHex: cta.backgroundHex,
      buttonTextHex: cta.textHex,
      headingFont: fonts.heading || fontStackFromFamily(rec(uploads.heading).family),
      bodyFont: fonts.body || fontStackFromFamily(rec(uploads.body).family),
      buttonFont: fonts.button || fontStackFromFamily(rec(uploads.button).family),
      fontUploads: uploads,
    }), c);
  }
  if (kind === "pinboard") {
    const board = rec(c.board);
    const mobile = rec(c.mobile);
    const boardFonts = rec(board.fonts);
    const rawUploads = rec(board.fontUploads);
    const headingUp = rec(rawUploads.heading);
    const subUp = rec(rawUploads.subheading);
    const bodyUp = Object.keys(subUp).length ? subUp : rec(rawUploads.body);
    const headingFamily = fontStackFromFamily(headingUp.family) || pickStr(boardFonts.heading);
    const bodyFamily = fontStackFromFamily(bodyUp.family) || pickStr(boardFonts.subheading) || pickStr(boardFonts.body);
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
    const assets = rec(c.assets);
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
    const assets = rec(c.assets);
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

export function withLiveSurfaceBranding(pub) {
  const next = pub && typeof pub === "object" ? { ...pub } : {};
  next.branding = liveSurfaceBrandingFromComponent(next);
  return next;
}

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Accept a stored 0%; `Number(x) || fallback` would replace it with the default. */
export function clampFillPercent(value, fallback, min, max) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function emptyOption(label) {
  return { id: newId(), label, imageUrl: "", accessibleLabel: label };
}

export function emptyMiniPollRecord(id, slug) {
  return {
    id,
    gameType: "mini-poll",
    title: "Untitled mini poll",
    clientName: "",
    slug,
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
    options: [emptyOption("Option A"), emptyOption("Option B")],
    revealDurationMs: 3000,
    branding: defaultBranding(),
  };
}

function normOption(raw, fallback) {
  const src = raw && typeof raw === "object" ? raw : {};
  const imageUrl = String(src.imageUrl || "");
  const rawLabel = typeof src.label === "string" ? src.label : "";
  const hasImage = !!imageUrl.trim();
  const label = !rawLabel.trim() && hasImage ? "" : rawLabel.trim() || fallback;
  const accessible =
    typeof src.accessibleLabel === "string" && src.accessibleLabel.trim()
      ? src.accessibleLabel.trim()
      : label || fallback;
  return {
    id: String(src.id || newId()),
    label,
    imageUrl,
    accessibleLabel: accessible,
  };
}

export function normalizeMiniPollRecord(doc) {
  const d = emptyMiniPollRecord(doc.id, doc.slug);
  const options = Array.isArray(doc.options) ? doc.options : [];
  return {
    ...d,
    ...doc,
    gameType: "mini-poll",
    title: String(doc.title || d.title),
    clientName: String(doc.clientName || ""),
    slug: String(doc.slug || d.slug).trim().toLowerCase(),
    question: String(doc.question || d.question),
    options: [normOption(options[0], "Option A"), normOption(options[1], "Option B")],
    revealDurationMs: Math.min(8000, Math.max(1200, Number(doc.revealDurationMs) || 3000)),
    branding: mergeBranding(doc.branding),
  };
}

export function toPublicMiniPoll(doc) {
  return normalizeMiniPollRecord(doc);
}

export function emptyFillGameRecord(id, slug) {
  const c1 = newId();
  const c2 = newId();
  return {
    id,
    gameType: "fill-game",
    title: "Untitled fill game",
    clientName: "",
    slug,
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
    branding: defaultBranding(),
  };
}

function normTeam(raw, fallback) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    id: String(src.id || fallback.id),
    name: String(src.name || fallback.name),
    colorHex: String(src.colorHex || fallback.colorHex),
    fillHex: String(src.fillHex || fallback.fillHex),
    target: Math.max(1, Math.min(999, Number(src.target) || fallback.target)),
  };
}

function normFillQuestion(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const choicesIn = Array.isArray(src.choices) ? src.choices : [];
  const choices = choicesIn.slice(0, 6).map((c, i) => ({
    id: String(c?.id || newId()),
    label: String(c?.label || `Option ${i + 1}`),
  }));
  while (choices.length < 2) choices.push({ id: newId(), label: `Option ${choices.length + 1}` });
  const correct = choices.some((c) => c.id === src.correctChoiceId) ? src.correctChoiceId : choices[0].id;
  return {
    id: String(src.id || newId()),
    prompt: String(src.prompt || "Question?"),
    choices,
    correctChoiceId: correct,
  };
}

export function normalizeFillGameRecord(doc) {
  const d = emptyFillGameRecord(doc.id, doc.slug);
  const teams = Array.isArray(doc.teams) ? doc.teams : [];
  const questions = Array.isArray(doc.questions) ? doc.questions.map(normFillQuestion) : d.questions;
  const place = doc.maskPlacement && typeof doc.maskPlacement === "object" ? doc.maskPlacement : d.maskPlacement;
  const foregroundUrl = String(doc.foregroundUrl || doc.overlayUrl || "");
  return {
    ...d,
    ...doc,
    gameType: "fill-game",
    title: String(doc.title || d.title),
    clientName: String(doc.clientName || ""),
    slug: String(doc.slug || d.slug).trim().toLowerCase(),
    teams: [normTeam(teams[0], d.teams[0]), normTeam(teams[1], d.teams[1])],
    metric: doc.metric === "percent" ? "percent" : "count",
    maskUrl: String(doc.maskUrl || ""),
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

export function toPublicFillGame(doc) {
  const n = normalizeFillGameRecord(doc);
  return {
    ...n,
    questions: n.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      choices: q.choices,
    })),
  };
}

export function toPublicMiniQuizLive(doc) {
  const questions = Array.isArray(doc.questions) ? doc.questions : [];
  const bgs = rec(doc.backgrounds);
  const pub = {
    gameType: "mini-quiz",
    id: doc.id,
    title: doc.title,
    slug: doc.slug,
    headline: doc.headline || "",
    logoUrl: doc.logoUrl || "",
    logoAlign: doc.logoAlign || "center",
    backgroundHex: doc.backgroundHex || "#07131f",
    backgroundImage: doc.backgroundImage || bgs.desktop || "",
    backgrounds: {
      desktop: bgs.desktop || "",
      tablet: bgs.tablet || "",
      mobile: bgs.mobile || "",
    },
    typography: rec(doc.typography),
    primaryCta: rec(doc.primaryCta),
    layoutMode: doc.layoutMode,
    layout: doc.layout,
    questions: questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      choices: Array.isArray(q.choices) ? q.choices.map((c) => ({ id: c.id, label: c.label })) : [],
    })),
  };
  return withLiveSurfaceBranding(pub);
}

export const LIVE_MODULE_TYPES = new Set(["mini-poll", "fill-game"]);

export function isLiveModuleType(t) {
  return LIVE_MODULE_TYPES.has(t);
}

export function emptyLiveModuleRecord(id, slug, gameType) {
  if (gameType === "fill-game") return emptyFillGameRecord(id, slug);
  return emptyMiniPollRecord(id, slug);
}

export function normalizeLiveModuleRecord(doc) {
  if (doc?.gameType === "fill-game") return normalizeFillGameRecord(doc);
  if (doc?.gameType === "mini-poll") return normalizeMiniPollRecord(doc);
  return doc;
}
