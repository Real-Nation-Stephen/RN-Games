/** Pin board — isolated prototype types (studio/API integration later). */

export type PinboardSubmissionType = "photo" | "note";
export type PinboardSubmissionStatus = "pending" | "approved" | "rejected";

export interface PinboardPlacement {
  /** % of pin zone (0–100) */
  x: number;
  y: number;
  /** degrees */
  rot: number;
  z: number;
  /** rendered width px */
  w: number;
}

export interface PinboardSubmission {
  id: string;
  type: PinboardSubmissionType;
  status: PinboardSubmissionStatus;
  createdAt: string;
  /** data URL for photos or rendered sticky composite */
  imageDataUrl?: string;
  /** Original photo before frames/stickers (for raw / uniform_frame board modes). */
  photoRawDataUrl?: string;
  photoFrameId?: string | null;
  photoStickers?: PinboardPhotoEditorSticker[];
  noteText?: string;
  noteMode?: "draw" | "type";
  stickyId?: string;
  placement?: PinboardPlacement;
}

export interface PinboardStickyAsset {
  id: string;
  label: string;
  imageUrl: string;
}

/** How approved photos appear on the live board (studio / lab setting, not shown to guests). */
export type PinboardPhotoPublishMode = "raw" | "uniform_frame" | "user_choice";

export interface PinboardFrameAsset {
  id: string;
  label: string;
  /** Empty for “no frame”. */
  imageUrl: string;
}

export interface PinboardPhotoStickerAsset {
  id: string;
  label: string;
  imageUrl: string;
}

/** Sticker transform relative to editor stage (0–100 %, degrees, scale multiplier). */
export interface PinboardPhotoEditorSticker {
  id: string;
  assetId: string;
  x: number;
  y: number;
  rot: number;
  scale: number;
}

export interface PinboardFontUpload {
  url: string;
  family: string;
}

export interface PinboardConsentItem {
  id: string;
  label: string;
  required: boolean;
}

export interface PinboardPermissions {
  enabled: boolean;
  headline: string;
  introText: string;
  gdprUrl: string;
  gdprLinkLabel: string;
  items: PinboardConsentItem[];
  acceptButtonLabel: string;
}

export interface PinboardBrandingSurface {
  backgroundHex?: string;
  backgroundImageUrl?: string;
  useBackgroundImage?: boolean;
  textHex?: string;
  buttonHex?: string;
  buttonTextHex?: string;
}

export interface PinboardConfig {
  eventId: string;
  title: string;
  clientName: string;
  slug: string;
  faviconUrl?: string;
  permissions: PinboardPermissions;
  /** Live board */
  board: {
    header: string;
    subhead: string;
    headerHex: string;
    subheadHex: string;
    /** @deprecated use headerHex */
    headerColor?: string;
    /** @deprecated use subheadHex */
    subheadColor?: string;
    useBackgroundImage: boolean;
    backgroundHex: string;
    backgroundColor?: string;
    backgroundImage: string;
    brandLogoUrl: string;
    brandLogoCorner: "bl" | "br" | "tl" | "tr";
    polaroidFrames: boolean;
    fonts: {
      heading?: string;
      subheading?: string;
      body?: string;
    };
    fontUploads?: {
      heading?: PinboardFontUpload;
      subheading?: PinboardFontUpload;
      body?: PinboardFontUpload;
    };
  };
  /** Mobile submit */
  mobile: PinboardBrandingSurface & {
    headline: string;
    subheadline: string;
    submitLabel: string;
    thankYouMessage: string;
    stickyAssets: PinboardStickyAsset[];
    /** Guest photo editor frames (include id `none` for no frame). */
    photoFrames: PinboardFrameAsset[];
    /** Optional stickers guests can place on photos. */
    photoStickers: PinboardPhotoStickerAsset[];
    /**
     * How photos render on the live board after approval:
     * - raw: photo only (no frame)
     * - uniform_frame: same frame for every photo (board polaroid or uniformFrameId)
     * - user_choice: flattened composite from the guest editor
     */
    photoPublishMode: PinboardPhotoPublishMode;
    /** Frame asset id when photoPublishMode is uniform_frame (falls back to polaroid CSS). */
    uniformFrameId?: string | null;
  };
  /** Moderator */
  moderator: PinboardBrandingSurface & {
    headline: string;
    approveLabel: string;
    rejectLabel: string;
  };
  stickies: PinboardStickyAsset[];
}

export interface PinboardState {
  version: number;
  eventId: string;
  submissions: PinboardSubmission[];
  boardClearedAt?: string | null;
}
