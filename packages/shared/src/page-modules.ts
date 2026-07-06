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

export interface PageFontUpload {
  url: string;
  family: string;
}

export interface PageTypography {
  headlineHex: string;
  bodyHex: string;
  fonts?: { heading?: string; body?: string; button?: string };
  fontUploads?: { heading?: PageFontUpload; body?: PageFontUpload; button?: PageFontUpload };
}

export type LandingTextAlign = "left" | "center" | "right";
export type LandingImageFit = "cover" | "contain" | "fill" | "inset";
export type LandingTextVariant = "headline" | "subheadline" | "body" | "caption";
export type LandingBlockType =
  | "text"
  | "image"
  | "image_text"
  | "gallery"
  | "video"
  | "spacer"
  | "divider"
  | "button";

export interface LandingBlockBase {
  id: string;
  type: LandingBlockType;
}

export interface LandingTextBlock extends LandingBlockBase {
  type: "text";
  content: string;
  variant: LandingTextVariant;
  align: LandingTextAlign;
  colorHex?: string;
}

export interface LandingImageBlock extends LandingBlockBase {
  type: "image";
  url: string;
  alt: string;
  fit: LandingImageFit;
  maxHeightPx: number;
  borderRadiusPx: number;
  align: LandingTextAlign;
  fullWidth: boolean;
}

export interface LandingImageTextBlock extends LandingBlockBase {
  type: "image_text";
  imageUrl: string;
  imageAlt: string;
  imageFit: LandingImageFit;
  layout: "image_left" | "image_right";
  headline: string;
  body: string;
  gapPx: number;
}

export interface LandingGalleryImage {
  id: string;
  url: string;
  alt: string;
  caption?: string;
}

export interface LandingGalleryBlock extends LandingBlockBase {
  type: "gallery";
  images: LandingGalleryImage[];
  columns: 2 | 3 | 4;
  gapPx: number;
}

export interface LandingVideoBlock extends LandingBlockBase {
  type: "video";
  url: string;
  aspectRatio: "16:9" | "4:3" | "1:1";
  autoplay: boolean;
  muted: boolean;
}

export interface LandingSpacerBlock extends LandingBlockBase {
  type: "spacer";
  heightPx: number;
}

export interface LandingDividerBlock extends LandingBlockBase {
  type: "divider";
  colorHex: string;
  thicknessPx: number;
  widthPercent: number;
}

export interface LandingButtonBlock extends LandingBlockBase {
  type: "button";
  label: string;
  url: string;
  backgroundHex: string;
  textHex: string;
  align: LandingTextAlign;
  fullWidth: boolean;
  isPrimary: boolean;
}

export type LandingBlock =
  | LandingTextBlock
  | LandingImageBlock
  | LandingImageTextBlock
  | LandingGalleryBlock
  | LandingVideoBlock
  | LandingSpacerBlock
  | LandingDividerBlock
  | LandingButtonBlock;

export interface LandingPageSettings {
  maxWidthPx: number;
  contentAlign: LandingTextAlign;
  verticalAlign: "top" | "center";
  paddingPx: number;
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

export type LandingRecord = PageModuleBase & {
  gameType: "landing";
  blocks: LandingBlock[];
  pageSettings: LandingPageSettings;
};

export const LANDING_BLOCK_LABELS: Record<LandingBlockType, string> = {
  text: "Text",
  image: "Image",
  image_text: "Image + text",
  gallery: "Gallery",
  video: "Video",
  spacer: "Spacer",
  divider: "Divider",
  button: "Button",
};

export function newLandingBlockId(): string {
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultLandingPageSettings(): LandingPageSettings {
  return { maxWidthPx: 720, contentAlign: "center", verticalAlign: "center", paddingPx: 24 };
}

export function createDefaultLandingBlock(type: LandingBlockType): LandingBlock {
  const id = newLandingBlockId();
  switch (type) {
    case "text":
      return { id, type, content: "New text block", variant: "body", align: "center" };
    case "image":
      return {
        id,
        type,
        url: "",
        alt: "",
        fit: "contain",
        maxHeightPx: 320,
        borderRadiusPx: 8,
        align: "center",
        fullWidth: false,
      };
    case "image_text":
      return {
        id,
        type,
        imageUrl: "",
        imageAlt: "",
        imageFit: "cover",
        layout: "image_left",
        headline: "Headline",
        body: "Supporting copy goes here.",
        gapPx: 20,
      };
    case "gallery":
      return { id, type, images: [], columns: 3, gapPx: 12 };
    case "video":
      return { id, type, url: "", aspectRatio: "16:9", autoplay: false, muted: true };
    case "spacer":
      return { id, type, heightPx: 32 };
    case "divider":
      return { id, type, colorHex: "rgba(255,255,255,0.2)", thicknessPx: 1, widthPercent: 60 };
    case "button":
      return {
        id,
        type,
        label: "Continue",
        url: "",
        backgroundHex: "#2d6cdf",
        textHex: "#ffffff",
        align: "center",
        fullWidth: false,
        isPrimary: false,
      };
  }
}

export function defaultLandingBlocks(): LandingBlock[] {
  return [
    {
      id: newLandingBlockId(),
      type: "text",
      content: "Welcome",
      variant: "headline",
      align: "center",
    },
    {
      id: newLandingBlockId(),
      type: "text",
      content: "Tell your story here.",
      variant: "body",
      align: "center",
    },
    {
      id: newLandingBlockId(),
      type: "button",
      label: "Get started",
      url: "",
      backgroundHex: "#2d6cdf",
      textHex: "#ffffff",
      align: "center",
      fullWidth: false,
      isPrimary: true,
    },
  ];
}

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
  return { headlineHex: "#ffffff", bodyHex: "#e8eef5", fonts: {}, fontUploads: {} };
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
    blocks: defaultLandingBlocks(),
    pageSettings: defaultLandingPageSettings(),
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
      fontUploads: { ...defaultTypography().fontUploads, ...(doc.typography?.fontUploads || {}) },
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

function normalizeLandingBlock(raw: Partial<LandingBlock> & { type?: string }, index: number): LandingBlock {
  const type = (raw.type || "text") as LandingBlockType;
  const id = String(raw.id || `block-${index}`);
  switch (type) {
    case "image":
      return {
        id,
        type,
        url: String((raw as LandingImageBlock).url || ""),
        alt: String((raw as LandingImageBlock).alt || ""),
        fit: ((raw as LandingImageBlock).fit || "contain") as LandingImageFit,
        maxHeightPx: Math.max(40, Number((raw as LandingImageBlock).maxHeightPx) || 320),
        borderRadiusPx: Math.max(0, Number((raw as LandingImageBlock).borderRadiusPx) || 8),
        align: ((raw as LandingImageBlock).align || "center") as LandingTextAlign,
        fullWidth: !!(raw as LandingImageBlock).fullWidth,
      };
    case "image_text":
      return {
        id,
        type,
        imageUrl: String((raw as LandingImageTextBlock).imageUrl || ""),
        imageAlt: String((raw as LandingImageTextBlock).imageAlt || ""),
        imageFit: ((raw as LandingImageTextBlock).imageFit || "cover") as LandingImageFit,
        layout: (raw as LandingImageTextBlock).layout === "image_right" ? "image_right" : "image_left",
        headline: String((raw as LandingImageTextBlock).headline || ""),
        body: String((raw as LandingImageTextBlock).body || ""),
        gapPx: Math.max(0, Number((raw as LandingImageTextBlock).gapPx) || 20),
      };
    case "gallery": {
      const images = Array.isArray((raw as LandingGalleryBlock).images)
        ? (raw as LandingGalleryBlock).images.map((img, i) => ({
            id: String(img.id || `img-${i}`),
            url: String(img.url || ""),
            alt: String(img.alt || ""),
            caption: img.caption ? String(img.caption) : "",
          }))
        : [];
      const cols = Number((raw as LandingGalleryBlock).columns) || 3;
      return {
        id,
        type,
        images,
        columns: (cols === 2 || cols === 4 ? cols : 3) as 2 | 3 | 4,
        gapPx: Math.max(0, Number((raw as LandingGalleryBlock).gapPx) || 12),
      };
    }
    case "video":
      return {
        id,
        type,
        url: String((raw as LandingVideoBlock).url || ""),
        aspectRatio: ((raw as LandingVideoBlock).aspectRatio || "16:9") as "16:9" | "4:3" | "1:1",
        autoplay: !!(raw as LandingVideoBlock).autoplay,
        muted: (raw as LandingVideoBlock).muted !== false,
      };
    case "spacer":
      return { id, type, heightPx: Math.max(4, Number((raw as LandingSpacerBlock).heightPx) || 32) };
    case "divider":
      return {
        id,
        type,
        colorHex: String((raw as LandingDividerBlock).colorHex || "rgba(255,255,255,0.2)"),
        thicknessPx: Math.max(1, Number((raw as LandingDividerBlock).thicknessPx) || 1),
        widthPercent: Math.max(10, Math.min(100, Number((raw as LandingDividerBlock).widthPercent) || 60)),
      };
    case "button":
      return {
        id,
        type,
        label: String((raw as LandingButtonBlock).label || "Continue"),
        url: String((raw as LandingButtonBlock).url || ""),
        backgroundHex: String((raw as LandingButtonBlock).backgroundHex || "#2d6cdf"),
        textHex: String((raw as LandingButtonBlock).textHex || "#ffffff"),
        align: ((raw as LandingButtonBlock).align || "center") as LandingTextAlign,
        fullWidth: !!(raw as LandingButtonBlock).fullWidth,
        isPrimary: !!(raw as LandingButtonBlock).isPrimary,
      };
    case "text":
    default:
      return {
        id,
        type: "text",
        content: String((raw as LandingTextBlock).content || ""),
        variant: ((raw as LandingTextBlock).variant || "body") as LandingTextVariant,
        align: ((raw as LandingTextBlock).align || "center") as LandingTextAlign,
        colorHex: (raw as LandingTextBlock).colorHex ? String((raw as LandingTextBlock).colorHex) : "",
      };
  }
}

function legacyLandingBlocks(doc: Partial<LandingRecord>): LandingBlock[] {
  const blocks: LandingBlock[] = [];
  if (doc.headline) {
    blocks.push({
      id: newLandingBlockId(),
      type: "text",
      content: doc.headline,
      variant: "headline",
      align: "center",
    });
  }
  if (doc.body) {
    blocks.push({
      id: newLandingBlockId(),
      type: "text",
      content: doc.body,
      variant: "body",
      align: "center",
    });
  }
  if (doc.primaryCta?.label) {
    blocks.push({
      id: newLandingBlockId(),
      type: "button",
      label: doc.primaryCta.label,
      url: doc.primaryCta.url || "",
      backgroundHex: doc.primaryCta.backgroundHex || "#2d6cdf",
      textHex: doc.primaryCta.textHex || "#ffffff",
      align: "center",
      fullWidth: false,
      isPrimary: true,
    });
  }
  return blocks.length ? blocks : defaultLandingBlocks();
}

function normalizeLandingPageSettings(raw?: Partial<LandingPageSettings>): LandingPageSettings {
  const d = defaultLandingPageSettings();
  if (!raw) return d;
  const align = raw.contentAlign;
  return {
    maxWidthPx: Math.max(320, Number(raw.maxWidthPx) || d.maxWidthPx),
    contentAlign: align === "left" || align === "right" ? align : "center",
    verticalAlign: raw.verticalAlign === "top" ? "top" : "center",
    paddingPx: Math.max(0, Number(raw.paddingPx) || d.paddingPx),
  };
}

export function normalizeLanding(doc: Partial<LandingRecord> & { id: string; slug: string }): LandingRecord {
  const base = normalizeBase(doc);
  const blocks = Array.isArray(doc.blocks) && doc.blocks.length
    ? doc.blocks.map((b, i) => normalizeLandingBlock(b, i))
    : legacyLandingBlocks(doc);
  return {
    ...base,
    gameType: "landing",
    blocks,
    pageSettings: normalizeLandingPageSettings(doc.pageSettings),
  };
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
