/**
 * Wave 2 page-module shared types — landing, form, certificate, consent, email-signup, redemption.
 */

export interface PageBreakpointBg {
  desktop?: string;
  tablet?: string;
  mobile?: string;
}

export interface PageButtonStyle {
  backgroundHex: string;
  textHex: string;
  label: string;
  url?: string;
}

export interface PageTypography {
  headlineHex: string;
  bodyHex: string;
  fonts?: { heading?: string; body?: string; button?: string };
}

export interface PageModuleBase {
  id: string;
  title: string;
  clientName: string;
  slug: string;
  projectCode: string;
  designCode: string;
  archived?: boolean;
  updatedAt: string;
  reportingEnabled: boolean;
  reportingLockedAt?: string | null;
  thumbnailUrl?: string;
  faviconUrl?: string;
  reportingSheetTab?: string;
  showPoweredBy?: boolean;
  backgroundHex: string;
  backgrounds: PageBreakpointBg;
  backgroundImage: string;
  typography: PageTypography;
  headline: string;
  body: string;
  primaryCta: PageButtonStyle;
  experienceAutoContinue: boolean;
  experienceAutoContinueDelayMs: number;
}

export type LandingRecord = PageModuleBase & { gameType: "landing" };

export type FormFieldType =
  | "text"
  | "email"
  | "phone"
  | "dropdown"
  | "multiple_choice"
  | "checkbox"
  | "date"
  | "postcode";

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  validationHint?: string;
}

export type FormRecord = PageModuleBase & {
  gameType: "form";
  fields: FormField[];
  submitLabel: string;
};

export interface CertificateMergeField {
  id: string;
  label: string;
  sourceKey: string;
  xPercent: number;
  yPercent: number;
  fontSizePx: number;
  colorHex: string;
  fontWeight?: "normal" | "bold";
}

export type CertificateRecord = PageModuleBase & {
  gameType: "certificate";
  canvasWidth: number;
  canvasHeight: number;
  certificateBackgroundUrl: string;
  mergeFields: CertificateMergeField[];
  downloadLabel: string;
};

export interface ConsentItem {
  id: string;
  label: string;
  required?: boolean;
}

export type ConsentRecord = PageModuleBase & {
  gameType: "consent";
  introText: string;
  gdprUrl: string;
  gdprLinkLabel: string;
  items: ConsentItem[];
  acceptLabel: string;
};

export type EmailSignupRecord = PageModuleBase & {
  gameType: "email-signup";
  emailLabel: string;
  nameLabel: string;
  submitLabel: string;
  thankYouMessage: string;
};

export type RedemptionRecord = PageModuleBase & {
  gameType: "redemption";
  instructions: string;
  codeLabel: string;
  redemptionCode: string;
};

export type PageModuleRecord =
  | LandingRecord
  | FormRecord
  | CertificateRecord
  | ConsentRecord
  | EmailSignupRecord
  | RedemptionRecord;

export type PageModuleGameType = PageModuleRecord["gameType"];

const PAGE_MODULE_TYPES = new Set<PageModuleGameType>([
  "landing",
  "form",
  "certificate",
  "consent",
  "email-signup",
  "redemption",
]);

export function isPageModuleGameType(t: string): t is PageModuleGameType {
  return PAGE_MODULE_TYPES.has(t as PageModuleGameType);
}

function defaultTypography(): PageTypography {
  return { headlineHex: "#ffffff", bodyHex: "#e8eef5", fonts: {} };
}

function defaultCta(label = "Continue"): PageButtonStyle {
  return { backgroundHex: "#2d6cdf", textHex: "#ffffff", label };
}

function basePageModule(
  partial: { id: string; slug: string },
  gameType: PageModuleGameType,
  title: string,
): PageModuleBase & { gameType: PageModuleGameType } {
  return {
    id: partial.id,
    gameType,
    title,
    clientName: "",
    slug: partial.slug,
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

export function emptyLanding(partial: { id: string; slug: string }): LandingRecord {
  const b = basePageModule(partial, "landing", "Untitled landing page");
  return {
    ...b,
    gameType: "landing",
    primaryCta: defaultCta("Get started"),
    experienceAutoContinue: true,
    experienceAutoContinueDelayMs: 2500,
  };
}

export function emptyForm(partial: { id: string; slug: string }): FormRecord {
  return {
    ...basePageModule(partial, "form", "Untitled form"),
    gameType: "form",
    submitLabel: "Submit",
    fields: [
      { id: "name", type: "text", label: "Your name", required: true },
      { id: "email", type: "email", label: "Email", required: true },
    ],
  };
}

export function emptyCertificate(partial: { id: string; slug: string }): CertificateRecord {
  return {
    ...basePageModule(partial, "certificate", "Untitled certificate"),
    gameType: "certificate",
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
}

export function emptyConsent(partial: { id: string; slug: string }): ConsentRecord {
  return {
    ...basePageModule(partial, "consent", "Untitled consent"),
    gameType: "consent",
    introText: "Please read and accept to continue.",
    gdprUrl: "",
    gdprLinkLabel: "Privacy policy",
    acceptLabel: "Accept and continue",
    items: [{ id: "consent-main", label: "I agree to the terms above", required: true }],
  };
}

export function emptyEmailSignup(partial: { id: string; slug: string }): EmailSignupRecord {
  return {
    ...basePageModule(partial, "email-signup", "Untitled email signup"),
    gameType: "email-signup",
    nameLabel: "Name",
    emailLabel: "Email",
    submitLabel: "Sign up",
    thankYouMessage: "Thanks — you're on the list.",
  };
}

export function emptyRedemption(partial: { id: string; slug: string }): RedemptionRecord {
  return {
    ...basePageModule(partial, "redemption", "Untitled redemption"),
    gameType: "redemption",
    instructions: "Show this code at the desk to redeem your reward.",
    codeLabel: "Your code",
    redemptionCode: "SAMPLE-CODE",
  };
}

function normalizeBase(doc: Partial<PageModuleBase> & { id: string; slug: string }): PageModuleBase {
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
    typography: {
      ...defaultTypography(),
      ...(doc.typography && typeof doc.typography === "object" ? doc.typography : {}),
      fonts: { ...defaultTypography().fonts, ...(doc.typography?.fonts || {}) },
    },
    headline: String(doc.headline || doc.title || ""),
    body: String(doc.body || ""),
    primaryCta: {
      ...defaultCta(),
      ...(doc.primaryCta && typeof doc.primaryCta === "object" ? doc.primaryCta : {}),
    },
    experienceAutoContinue: !!doc.experienceAutoContinue,
    experienceAutoContinueDelayMs: Math.max(0, Number(doc.experienceAutoContinueDelayMs) || 0),
  };
}

export function normalizeLanding(doc: Partial<LandingRecord> & { id: string; slug: string }): LandingRecord {
  return { ...normalizeBase(doc), gameType: "landing" };
}

export function normalizeForm(doc: Partial<FormRecord> & { id: string; slug: string }): FormRecord {
  const fields = Array.isArray(doc.fields)
    ? doc.fields.map((f, i) => ({
        id: String(f.id || `field-${i}`),
        type: (f.type || "text") as FormFieldType,
        label: String(f.label || `Field ${i + 1}`),
        placeholder: f.placeholder ? String(f.placeholder) : "",
        required: !!f.required,
        options: Array.isArray(f.options) ? f.options.map(String) : [],
        validationHint: f.validationHint ? String(f.validationHint) : "",
      }))
    : emptyForm({ id: doc.id, slug: doc.slug }).fields;
  return {
    ...normalizeBase(doc),
    gameType: "form",
    submitLabel: String(doc.submitLabel || "Submit"),
    fields,
  };
}

export function normalizeCertificate(
  doc: Partial<CertificateRecord> & { id: string; slug: string },
): CertificateRecord {
  const mergeFields = Array.isArray(doc.mergeFields)
    ? doc.mergeFields.map((m, i) => ({
        id: String(m.id || `mf-${i}`),
        label: String(m.label || ""),
        sourceKey: String(m.sourceKey || ""),
        xPercent: Math.max(0, Math.min(100, Number(m.xPercent) || 50)),
        yPercent: Math.max(0, Math.min(100, Number(m.yPercent) || 50)),
        fontSizePx: Math.max(8, Number(m.fontSizePx) || 24),
        colorHex: String(m.colorHex || "#111111"),
        fontWeight: m.fontWeight === "bold" ? ("bold" as const) : ("normal" as const),
      }))
    : [];
  return {
    ...normalizeBase(doc),
    gameType: "certificate",
    canvasWidth: Math.max(320, Number(doc.canvasWidth) || 1200),
    canvasHeight: Math.max(240, Number(doc.canvasHeight) || 848),
    certificateBackgroundUrl: String(doc.certificateBackgroundUrl || ""),
    downloadLabel: String(doc.downloadLabel || "Download"),
    mergeFields,
  };
}

export function normalizeConsent(doc: Partial<ConsentRecord> & { id: string; slug: string }): ConsentRecord {
  const items = Array.isArray(doc.items)
    ? doc.items.map((it, i) => ({
        id: String(it.id || `item-${i}`),
        label: String(it.label || ""),
        required: !!it.required,
      }))
    : [];
  return {
    ...normalizeBase(doc),
    gameType: "consent",
    introText: String(doc.introText || ""),
    gdprUrl: String(doc.gdprUrl || ""),
    gdprLinkLabel: String(doc.gdprLinkLabel || "Privacy policy"),
    acceptLabel: String(doc.acceptLabel || "Accept and continue"),
    items,
  };
}

export function normalizeEmailSignup(
  doc: Partial<EmailSignupRecord> & { id: string; slug: string },
): EmailSignupRecord {
  return {
    ...normalizeBase(doc),
    gameType: "email-signup",
    nameLabel: String(doc.nameLabel || "Name"),
    emailLabel: String(doc.emailLabel || "Email"),
    submitLabel: String(doc.submitLabel || "Sign up"),
    thankYouMessage: String(doc.thankYouMessage || "Thanks!"),
  };
}

export function normalizeRedemption(
  doc: Partial<RedemptionRecord> & { id: string; slug: string },
): RedemptionRecord {
  return {
    ...normalizeBase(doc),
    gameType: "redemption",
    instructions: String(doc.instructions || ""),
    codeLabel: String(doc.codeLabel || "Your code"),
    redemptionCode: String(doc.redemptionCode || ""),
  };
}

export function normalizePageModule(
  doc: Partial<PageModuleRecord> & { id: string; slug: string; gameType?: string },
): PageModuleRecord {
  switch (doc.gameType) {
    case "form":
      return normalizeForm(doc as Partial<FormRecord> & { id: string; slug: string });
    case "certificate":
      return normalizeCertificate(doc as Partial<CertificateRecord> & { id: string; slug: string });
    case "consent":
      return normalizeConsent(doc as Partial<ConsentRecord> & { id: string; slug: string });
    case "email-signup":
      return normalizeEmailSignup(doc as Partial<EmailSignupRecord> & { id: string; slug: string });
    case "redemption":
      return normalizeRedemption(doc as Partial<RedemptionRecord> & { id: string; slug: string });
    case "landing":
    default:
      return normalizeLanding(doc as Partial<LandingRecord> & { id: string; slug: string });
  }
}

export function toPublicPageModule(doc: PageModuleRecord): PageModuleRecord {
  return doc;
}

export function resolveSessionPath(root: Record<string, unknown>, path: string): string {
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = root;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return "";
    cur = (cur as Record<string, unknown>)[p];
  }
  if (cur === null || cur === undefined) return "";
  return String(cur);
}
