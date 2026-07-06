/** Wave 2 page modules — record helpers (mirrors shared/page-modules.ts). */

const PAGE_TYPES = new Set(["landing", "form", "certificate", "consent", "email-signup", "redemption"]);

export function isPageModuleType(t) {
  return PAGE_TYPES.has(t);
}

function defaultTypography() {
  return { headlineHex: "#ffffff", bodyHex: "#e8eef5", fonts: {} };
}

function defaultCta(label = "Continue") {
  return { backgroundHex: "#2d6cdf", textHex: "#ffffff", label };
}

function basePage(id, slug, gameType, title) {
  return {
    id,
    gameType,
    title,
    clientName: "",
    slug,
    projectCode: "",
    designCode: "",
    updatedAt: new Date().toISOString(),
    reportingEnabled: false,
    reportingLockedAt: null,
    thumbnailUrl: "",
    faviconUrl: "",
    reportingSheetTab: "",
    showPoweredBy: true,
    backgroundHex: "#0a1628",
    backgrounds: { desktop: "", tablet: "", mobile: "" },
    backgroundImage: "",
    typography: defaultTypography(),
    headline: title,
    body: "",
    primaryCta: defaultCta(),
    experienceAutoContinue: false,
    experienceAutoContinueDelayMs: 0,
  };
}

export function emptyPageModuleRecord(id, slug, gameType) {
  switch (gameType) {
    case "form":
      return {
        ...basePage(id, slug, "form", "Untitled form"),
        submitLabel: "Submit",
        fields: [
          { id: "name", type: "text", label: "Your name", required: true },
          { id: "email", type: "email", label: "Email", required: true },
        ],
      };
    case "certificate":
      return {
        ...basePage(id, slug, "certificate", "Untitled certificate"),
        canvasWidth: 1200,
        canvasHeight: 848,
        certificateBackgroundUrl: "",
        downloadLabel: "Download",
        mergeFields: [
          {
            id: "name",
            label: "Name",
            sourceKey: "form.fieldValues.name",
            xPercent: 50,
            yPercent: 45,
            fontSizePx: 42,
            colorHex: "#1a1a1a",
            fontWeight: "bold",
          },
        ],
      };
    case "consent":
      return {
        ...basePage(id, slug, "consent", "Untitled consent"),
        introText: "Please read and accept to continue.",
        gdprUrl: "",
        gdprLinkLabel: "Privacy policy",
        acceptLabel: "Accept and continue",
        items: [{ id: "consent-main", label: "I agree to the terms above", required: true }],
      };
    case "email-signup":
      return {
        ...basePage(id, slug, "email-signup", "Untitled email signup"),
        nameLabel: "Name",
        emailLabel: "Email",
        submitLabel: "Sign up",
        thankYouMessage: "Thanks — you're on the list.",
      };
    case "redemption":
      return {
        ...basePage(id, slug, "redemption", "Untitled redemption"),
        instructions: "Show this code at the desk to redeem your reward.",
        codeLabel: "Your code",
        redemptionCode: "SAMPLE-CODE",
      };
    case "landing":
    default:
      return {
        ...basePage(id, slug, "landing", "Untitled landing page"),
        primaryCta: defaultCta("Get started"),
        experienceAutoContinue: true,
        experienceAutoContinueDelayMs: 2500,
      };
  }
}

function normalizeBase(doc) {
  return {
    id: doc.id,
    title: String(doc.title || "Untitled"),
    clientName: String(doc.clientName || ""),
    slug: String(doc.slug || "").trim().toLowerCase(),
    projectCode: String(doc.projectCode || ""),
    designCode: String(doc.designCode || ""),
    archived: !!doc.archived,
    updatedAt: doc.updatedAt || new Date().toISOString(),
    reportingEnabled: !!doc.reportingEnabled,
    reportingLockedAt: doc.reportingLockedAt ?? null,
    thumbnailUrl: String(doc.thumbnailUrl || ""),
    faviconUrl: String(doc.faviconUrl || ""),
    reportingSheetTab: String(doc.reportingSheetTab || ""),
    showPoweredBy: doc.showPoweredBy !== false,
    backgroundHex: String(doc.backgroundHex || "#0a1628"),
    backgrounds: {
      desktop: String(doc.backgrounds?.desktop || ""),
      tablet: String(doc.backgrounds?.tablet || ""),
      mobile: String(doc.backgrounds?.mobile || ""),
    },
    backgroundImage: String(doc.backgroundImage || ""),
    typography: { ...defaultTypography(), ...(doc.typography || {}), fonts: { ...(doc.typography?.fonts || {}) } },
    headline: String(doc.headline || doc.title || ""),
    body: String(doc.body || ""),
    primaryCta: { ...defaultCta(), ...(doc.primaryCta || {}) },
    experienceAutoContinue: !!doc.experienceAutoContinue,
    experienceAutoContinueDelayMs: Math.max(0, Number(doc.experienceAutoContinueDelayMs) || 0),
  };
}

export function normalizePageModule(doc) {
  const base = normalizeBase(doc);
  const gt = doc.gameType || "landing";
  if (gt === "form") {
    const fields = Array.isArray(doc.fields)
      ? doc.fields.map((f, i) => ({
          id: String(f.id || `field-${i}`),
          type: String(f.type || "text"),
          label: String(f.label || `Field ${i + 1}`),
          placeholder: String(f.placeholder || ""),
          required: !!f.required,
          options: Array.isArray(f.options) ? f.options.map(String) : [],
          validationHint: String(f.validationHint || ""),
        }))
      : emptyPageModuleRecord(doc.id, doc.slug, "form").fields;
    return { ...base, gameType: "form", submitLabel: String(doc.submitLabel || "Submit"), fields };
  }
  if (gt === "certificate") {
    const mergeFields = Array.isArray(doc.mergeFields)
      ? doc.mergeFields.map((m, i) => ({
          id: String(m.id || `mf-${i}`),
          label: String(m.label || ""),
          sourceKey: String(m.sourceKey || ""),
          xPercent: Math.max(0, Math.min(100, Number(m.xPercent) || 50)),
          yPercent: Math.max(0, Math.min(100, Number(m.yPercent) || 50)),
          fontSizePx: Math.max(8, Number(m.fontSizePx) || 24),
          colorHex: String(m.colorHex || "#111111"),
          fontWeight: m.fontWeight === "bold" ? "bold" : "normal",
        }))
      : [];
    return {
      ...base,
      gameType: "certificate",
      canvasWidth: Math.max(320, Number(doc.canvasWidth) || 1200),
      canvasHeight: Math.max(240, Number(doc.canvasHeight) || 848),
      certificateBackgroundUrl: String(doc.certificateBackgroundUrl || ""),
      downloadLabel: String(doc.downloadLabel || "Download"),
      mergeFields,
    };
  }
  if (gt === "consent") {
    const items = Array.isArray(doc.items)
      ? doc.items.map((it, i) => ({
          id: String(it.id || `item-${i}`),
          label: String(it.label || ""),
          required: !!it.required,
        }))
      : [];
    return {
      ...base,
      gameType: "consent",
      introText: String(doc.introText || ""),
      gdprUrl: String(doc.gdprUrl || ""),
      gdprLinkLabel: String(doc.gdprLinkLabel || "Privacy policy"),
      acceptLabel: String(doc.acceptLabel || "Accept and continue"),
      items,
    };
  }
  if (gt === "email-signup") {
    return {
      ...base,
      gameType: "email-signup",
      nameLabel: String(doc.nameLabel || "Name"),
      emailLabel: String(doc.emailLabel || "Email"),
      submitLabel: String(doc.submitLabel || "Sign up"),
      thankYouMessage: String(doc.thankYouMessage || "Thanks!"),
    };
  }
  if (gt === "redemption") {
    return {
      ...base,
      gameType: "redemption",
      instructions: String(doc.instructions || ""),
      codeLabel: String(doc.codeLabel || "Your code"),
      redemptionCode: String(doc.redemptionCode || ""),
    };
  }
  return { ...base, gameType: "landing" };
}

export function toPublicPageModule(doc) {
  return normalizePageModule(doc);
}
