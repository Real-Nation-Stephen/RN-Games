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

function mergeBranding(raw) {
  const d = defaultBranding();
  const src = raw && typeof raw === "object" ? raw : {};
  const uploads = src.fontUploads && typeof src.fontUploads === "object" ? src.fontUploads : {};
  return {
    ...d,
    ...src,
    presenterBackgroundImageUrl: String(src.presenterBackgroundImageUrl || d.presenterBackgroundImageUrl),
    buttonFont: String(src.buttonFont || d.buttonFont),
    fontUploads: {
      heading: mergeFontUpload(uploads.heading),
      body: mergeFontUpload(uploads.body),
      button: mergeFontUpload(uploads.button),
    },
  };
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
  return {
    gameType: "mini-quiz",
    id: doc.id,
    title: doc.title,
    slug: doc.slug,
    headline: doc.headline || "",
    logoUrl: doc.logoUrl || "",
    backgroundHex: doc.backgroundHex || "#07131f",
    backgroundImage: doc.backgroundImage || doc.backgrounds?.desktop || "",
    typography: doc.typography || {},
    questions: questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      choices: Array.isArray(q.choices) ? q.choices.map((c) => ({ id: c.id, label: c.label })) : [],
    })),
  };
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
