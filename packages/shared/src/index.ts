/** Shared wheel types and validation for RNGames platform */

export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "assets",
  "play",
  "report",
  "static",
  "favicon.ico",
  "robots.txt",
  "_next",
  ".netlify",
]);

export interface WheelAssets {
  logo: string;
  headline: string;
  button: string;
  restart: string;
  background: string;
  wheel: string;
  frame: string;
  winPanel: string;
  losePanel: string;
  /** Optional per-segment image for the headline/copy area when that segment wins (result layer) */
  segmentPanels?: (string | null)[] | null;
}

export interface WheelSounds {
  spin?: string | null;
  /** One optional URL per segment — played when that segment is selected */
  segmentReveal?: (string | null)[];
  music?: string | null;
  musicVolume?: number;
}

export interface WheelSpinSettings {
  minFullRotations: number;
  maxFullRotations: number;
  durationMs: number;
  easing: string;
}

export interface WheelLandscape {
  minAspectRatio: number;
}

export interface WheelRecord {
  id: string;
  title: string;
  clientName: string;
  slug: string;
  updatedAt: string;
  reportingEnabled: boolean;
  reportingLockedAt?: string | null;
  prizeSchemaVersion: number;
  segmentCount: number;
  prizes: string[];
  /** Per segment: true = win fanfare (confetti), false = lose styling */
  segmentOutcome: boolean[];
  weights: number[] | null;
  useWeightedSpin: boolean;
  wheelRotationOffsetDeg: number;
  assets: WheelAssets;
  sounds: WheelSounds;
  spin: WheelSpinSettings;
  landscape: WheelLandscape;
  thumbnailUrl?: string;
  /** Optional tab icon for this wheel’s public URL */
  faviconUrl?: string;
  /** Google Sheet tab name for this wheel’s spin log (set when reporting is enabled) */
  reportingSheetTab?: string;
}

export type WheelListItem = Pick<
  WheelRecord,
  "id" | "title" | "clientName" | "slug" | "updatedAt" | "reportingEnabled" | "thumbnailUrl"
>;

export function validateSlug(raw: string): { ok: true; slug: string } | { ok: false; error: string } {
  const slug = raw.trim().toLowerCase();
  if (slug.length < 2 || slug.length > 64) {
    return { ok: false, error: "Slug must be 2–64 characters." };
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { ok: false, error: "Use lowercase letters, numbers, and hyphens only." };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: "This slug is reserved." };
  }
  return { ok: true, slug };
}

export function emptyWheel(partial: { id: string; slug: string }): WheelRecord {
  const n = 12;
  return {
    id: partial.id,
    title: "Untitled wheel",
    clientName: "",
    slug: partial.slug,
    updatedAt: new Date().toISOString(),
    reportingEnabled: false,
    reportingLockedAt: null,
    prizeSchemaVersion: 1,
    segmentCount: n,
    prizes: Array.from({ length: n }, (_, i) => `Prize ${i + 1}`),
    segmentOutcome: Array.from({ length: n }, (_, i) => i % 2 === 1),
    weights: null,
    useWeightedSpin: false,
    wheelRotationOffsetDeg: 0,
    assets: {
      logo: "",
      headline: "",
      button: "",
      restart: "",
      background: "",
      wheel: "",
      frame: "",
      winPanel: "",
      losePanel: "",
      segmentPanels: null,
    },
    faviconUrl: "",
    sounds: {
      spin: null,
      segmentReveal: Array.from({ length: n }, () => null),
      music: null,
      musicVolume: 0.35,
    },
    spin: {
      minFullRotations: 5,
      maxFullRotations: 8,
      durationMs: 4500,
      easing: "cubic-bezier(0.15, 0.85, 0.2, 1)",
    },
    landscape: { minAspectRatio: 1.25 },
  };
}

export function segmentIsWinFromConfig(wheel: WheelRecord, segmentIndex: number): boolean {
  const o = wheel.segmentOutcome[segmentIndex];
  return o === true;
}
