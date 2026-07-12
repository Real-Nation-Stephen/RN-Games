/**
 * Course record — Wave 2.5 structured learning product (separate from modules and experiences).
 */
import { componentPublicPath } from "./experience-utils.js";

export type CourseStatus = "draft" | "published" | "archived";

export type CourseItemKind = "module" | "experience" | "video";

export type CourseLayout = "rows" | "cards" | "bento";

export type CourseNavigationMode = "sequential" | "free";

export interface CourseBreakpointBg {
  desktop?: string;
  tablet?: string;
  mobile?: string;
}

export interface CoursePresentation {
  backgroundHex: string;
  backgrounds: CourseBreakpointBg;
  backgroundMode: "fixed" | "scroll";
  logoUrl: string;
  logoAlign: "left" | "center" | "right";
  headlineHex: string;
  bodyHex: string;
  accentHex: string;
  cardHex: string;
  faviconUrl?: string;
  showPoweredBy?: boolean;
  /** Shown while course/flow content loads in the player iframe area */
  loadingText?: string;
  loadingTextHex?: string;
}

export interface CourseSettings {
  navigationMode: CourseNavigationMode;
  layout: CourseLayout;
  /** Learner-facing label for the email link feature (default: Learning link) */
  learningLinkLabel?: string;
  learningLinkIntro?: string;
  learningLinkRequireAcknowledgement?: boolean;
  learningLinkAcknowledgementText?: string;
  learningLinkPrivacyUrl?: string;
  /** Parked — educator class enrollment */
  enrollmentMode?: "open" | "class";
  /** Join code for class enrollment (not exposed on public course API) */
  classCode?: string;
  /** Parked — learner profile panel toggles */
  profilePanel?: CourseProfilePanelSettings;
}

/** Parked — configurable stats on course home (not yet rendered). */
export interface CourseProfilePanelSettings {
  enabled?: boolean;
  showDisplayName?: boolean;
  showCourseStartDate?: boolean;
  showCourseDeadline?: boolean;
  showLastQuizScore?: boolean;
  showAvgQuizScore?: boolean;
  showLatestGameScore?: boolean;
  showLeaderboardRank?: boolean;
}

export interface CourseItem {
  id: string;
  kind: CourseItemKind;
  /** Custom title shown on the course home (falls back to component title). */
  displayTitle?: string;
  /** Legacy / fallback label from picker */
  label?: string;
  iconUrl?: string;
  iconEmoji?: string;
  moduleInstanceId?: string;
  moduleType?: string;
  experienceId?: string;
  videoUrl?: string;
  videoTitle?: string;
}

export interface CourseSection {
  id: string;
  title: string;
  description?: string;
  iconUrl?: string;
  iconEmoji?: string;
  /** ISO date — section hidden until this calendar date */
  unlockDate?: string | null;
  /** Days after learner starts — section hidden until elapsed */
  unlockDaysAfterStart?: number | null;
  items: CourseItem[];
}

export interface CourseRecord {
  id: string;
  slug: string;
  title: string;
  description: string;
  clientName: string;
  projectCode: string;
  designCode: string;
  status: CourseStatus;
  updatedAt: string;
  publishedAt?: string | null;
  thumbnailUrl?: string;
  previewToken: string;
  sections: CourseSection[];
  presentation: CoursePresentation;
  settings: CourseSettings;
  archived?: boolean;
}

export interface CourseIndexRow {
  id: string;
  slug: string;
  title: string;
  clientName: string;
  projectCode: string;
  designCode: string;
  status: CourseStatus;
  updatedAt: string;
  thumbnailUrl?: string;
  itemCount: number;
  sectionCount: number;
  archived?: boolean;
}

export interface PublicCourseItem {
  id: string;
  sectionId: string;
  sectionTitle: string;
  kind: CourseItemKind;
  displayTitle: string;
  label: string;
  iconUrl?: string;
  iconEmoji?: string;
  launchPath: string;
  moduleType?: string;
  /** Badge artwork URL for course home grid (badge modules only) */
  badgeArtUrl?: string;
  /** Experience preview token — included in course draft preview only */
  previewToken?: string;
  missing?: boolean;
  archived?: boolean;
  locked?: boolean;
  lockReason?: string;
}

export interface PublicCourseSection {
  id: string;
  title: string;
  description?: string;
  iconUrl?: string;
  iconEmoji?: string;
  unlockDate?: string | null;
  unlockDaysAfterStart?: number | null;
  locked?: boolean;
  lockReason?: string;
  items: PublicCourseItem[];
}

export interface PublicCourse {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: CourseStatus;
  presentation: CoursePresentation;
  settings: CourseSettings;
  sections: PublicCourseSection[];
  items: PublicCourseItem[];
  itemCount: number;
  /** True when learners can join with a class code on the start screen */
  classEnrollmentEnabled: boolean;
}

export interface CourseSession {
  sessionId: string;
  courseId: string;
  courseSlug: string;
  participantId: string;
  email?: string;
  resumeToken?: string;
  completedItemIds: string[];
  currentItemId: string | null;
  lastVisitedItemId: string | null;
  earnedCertificates: string[];
  earnedBadges: string[];
  outcomes: Record<string, unknown>;
  itemOutcomes?: Record<string, Record<string, unknown>>;
  data?: Record<string, unknown>;
  startedAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

export function newCourseId(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function defaultCoursePresentation(): CoursePresentation {
  return {
    backgroundHex: "#0a1628",
    backgrounds: {},
    backgroundMode: "fixed",
    logoUrl: "",
    logoAlign: "center",
    headlineHex: "#ffffff",
    bodyHex: "#e8eef5",
    accentHex: "#5ec8ff",
    cardHex: "#122038",
    faviconUrl: "",
    showPoweredBy: true,
    loadingText: "Course content loading",
    loadingTextHex: "#e8eef5",
  };
}

export function defaultCourseSettings(): CourseSettings {
  return {
    navigationMode: "sequential",
    layout: "cards",
    learningLinkLabel: "Learning link",
    learningLinkIntro:
      "Bookmark this page or copy your link below to return and pick up where you left off.",
    learningLinkRequireAcknowledgement: true,
    learningLinkAcknowledgementText:
      "I understand my email will be used only to send my learning link and reconnect my progress — not for marketing unless I opt in elsewhere.",
    learningLinkPrivacyUrl: "",
    enrollmentMode: "open",
    profilePanel: { enabled: false },
  };
}

export function emptyCourse(id: string, slug: string, previewToken: string): CourseRecord {
  return {
    id,
    slug,
    title: "Untitled course",
    description: "",
    clientName: "",
    projectCode: "",
    designCode: "",
    status: "draft",
    updatedAt: new Date().toISOString(),
    publishedAt: null,
    thumbnailUrl: "",
    previewToken,
    sections: [],
    presentation: defaultCoursePresentation(),
    settings: defaultCourseSettings(),
    archived: false,
  };
}

export function flattenCourseItems(sections: CourseSection[]): CourseItem[] {
  return (sections || []).flatMap((s) => s.items || []);
}

/** Draft experiences in a course preview may be loaded via course preview token. */
export function courseCurriculumIncludesExperience(
  course: Pick<CourseRecord, "sections">,
  experienceId: string,
): boolean {
  return flattenCourseItems(course.sections).some(
    (item) => item.kind === "experience" && item.experienceId === experienceId,
  );
}

export function courseCompletionPercent(session: Pick<CourseSession, "completedItemIds">, itemCount: number): number {
  if (!itemCount) return 0;
  const done = new Set(session.completedItemIds || []).size;
  return Math.round((done / itemCount) * 100);
}

export function coursePublicPath(slug: string, resumeToken?: string): string {
  const base = `/course/${encodeURIComponent(slug)}`;
  if (resumeToken) return `${base}?resumeToken=${encodeURIComponent(resumeToken)}`;
  return base;
}

export function normalizeCourseItem(raw: Partial<CourseItem>, index: number): CourseItem {
  const kind: CourseItemKind =
    raw.kind === "experience" || raw.kind === "video" ? raw.kind : "module";
  return {
    id: String(raw.id || `item-${index}`),
    kind,
    displayTitle: raw.displayTitle ? String(raw.displayTitle) : undefined,
    label: raw.label ? String(raw.label) : undefined,
    iconUrl: raw.iconUrl ? String(raw.iconUrl) : undefined,
    iconEmoji: raw.iconEmoji ? String(raw.iconEmoji) : undefined,
    moduleInstanceId: raw.moduleInstanceId ? String(raw.moduleInstanceId) : undefined,
    moduleType: raw.moduleType ? String(raw.moduleType) : undefined,
    experienceId: raw.experienceId ? String(raw.experienceId) : undefined,
    videoUrl: raw.videoUrl ? String(raw.videoUrl) : undefined,
    videoTitle: raw.videoTitle ? String(raw.videoTitle) : undefined,
  };
}

export function normalizeCourseSection(raw: Partial<CourseSection>, index: number): CourseSection {
  const items = Array.isArray(raw.items) ? raw.items.map((item, i) => normalizeCourseItem(item, i)) : [];
  const unlockDays =
    raw.unlockDaysAfterStart === null || raw.unlockDaysAfterStart === undefined
      ? null
      : Math.max(0, Number(raw.unlockDaysAfterStart) || 0);
  return {
    id: String(raw.id || `section-${index}`),
    title: String(raw.title || `Section ${index + 1}`),
    description: raw.description ? String(raw.description) : undefined,
    iconUrl: raw.iconUrl ? String(raw.iconUrl) : undefined,
    iconEmoji: raw.iconEmoji ? String(raw.iconEmoji) : undefined,
    unlockDate: raw.unlockDate ? String(raw.unlockDate) : null,
    unlockDaysAfterStart: unlockDays,
    items,
  };
}

function normalizePresentation(raw: Partial<CoursePresentation> | undefined): CoursePresentation {
  const d = defaultCoursePresentation();
  if (!raw || typeof raw !== "object") return d;
  return {
    backgroundHex: String(raw.backgroundHex || d.backgroundHex),
    backgrounds: {
      desktop: raw.backgrounds?.desktop ? String(raw.backgrounds.desktop) : undefined,
      tablet: raw.backgrounds?.tablet ? String(raw.backgrounds.tablet) : undefined,
      mobile: raw.backgrounds?.mobile ? String(raw.backgrounds.mobile) : undefined,
    },
    backgroundMode: raw.backgroundMode === "scroll" ? "scroll" : "fixed",
    logoUrl: String(raw.logoUrl || ""),
    logoAlign: raw.logoAlign === "left" || raw.logoAlign === "right" ? raw.logoAlign : "center",
    headlineHex: String(raw.headlineHex || d.headlineHex),
    bodyHex: String(raw.bodyHex || d.bodyHex),
    accentHex: String(raw.accentHex || d.accentHex),
    cardHex: String(raw.cardHex || d.cardHex),
    faviconUrl: String(raw.faviconUrl || ""),
    showPoweredBy: raw.showPoweredBy !== false,
    loadingText: String(raw.loadingText || "Course content loading"),
    loadingTextHex: String(raw.loadingTextHex || raw.bodyHex || d.bodyHex),
  };
}

function normalizeSettings(raw: Partial<CourseSettings> | undefined): CourseSettings {
  const d = defaultCourseSettings();
  if (!raw || typeof raw !== "object") return d;
  const profile = raw.profilePanel && typeof raw.profilePanel === "object" ? raw.profilePanel : {};
  return {
    navigationMode: raw.navigationMode === "free" ? "free" : "sequential",
    layout: raw.layout === "rows" || raw.layout === "bento" ? raw.layout : d.layout,
    learningLinkLabel: String(raw.learningLinkLabel || d.learningLinkLabel),
    learningLinkIntro: String(raw.learningLinkIntro ?? d.learningLinkIntro),
    learningLinkRequireAcknowledgement: raw.learningLinkRequireAcknowledgement !== false,
    learningLinkAcknowledgementText: String(
      raw.learningLinkAcknowledgementText ?? d.learningLinkAcknowledgementText,
    ),
    learningLinkPrivacyUrl: String(raw.learningLinkPrivacyUrl || ""),
    enrollmentMode: raw.enrollmentMode === "class" ? "class" : "open",
    classCode: String(raw.classCode || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, ""),
    profilePanel: {
      enabled: !!profile.enabled,
      showDisplayName: profile.showDisplayName !== false,
      showCourseStartDate: !!profile.showCourseStartDate,
      showCourseDeadline: !!profile.showCourseDeadline,
      showLastQuizScore: !!profile.showLastQuizScore,
      showAvgQuizScore: !!profile.showAvgQuizScore,
      showLatestGameScore: !!profile.showLatestGameScore,
      showLeaderboardRank: !!profile.showLeaderboardRank,
    },
  };
}

export function normalizeCourse(doc: Partial<CourseRecord> & { id: string }): CourseRecord {
  const sections = Array.isArray(doc.sections)
    ? doc.sections.map((s, i) => normalizeCourseSection(s, i))
    : [];
  return {
    id: doc.id,
    slug: String(doc.slug || "").trim().toLowerCase(),
    title: String(doc.title || "Untitled course"),
    description: String(doc.description || ""),
    clientName: String(doc.clientName || ""),
    projectCode: String(doc.projectCode || ""),
    designCode: String(doc.designCode || ""),
    status: doc.status === "published" || doc.status === "archived" ? doc.status : "draft",
    updatedAt: doc.updatedAt || new Date().toISOString(),
    publishedAt: doc.publishedAt ?? null,
    thumbnailUrl: String(doc.thumbnailUrl || ""),
    previewToken: String(doc.previewToken || ""),
    sections,
    presentation: normalizePresentation(doc.presentation),
    settings: normalizeSettings(doc.settings),
    archived: !!doc.archived,
  };
}

export function toCourseIndexEntry(doc: CourseRecord): CourseIndexRow {
  const items = flattenCourseItems(doc.sections);
  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    clientName: doc.clientName,
    projectCode: doc.projectCode || "",
    designCode: doc.designCode || "",
    status: doc.status,
    updatedAt: doc.updatedAt,
    thumbnailUrl: doc.thumbnailUrl || "",
    itemCount: items.length,
    sectionCount: doc.sections.length,
    archived: !!doc.archived,
  };
}

const MODULE_TYPES = new Set([
  "spinning-wheel",
  "scratcher",
  "flip-cards",
  "quiz",
  "pinboard",
  "leaderboard",
  "catch",
  "runner",
  "landing",
  "form",
  "certificate",
  "badge",
  "consent",
  "email-signup",
  "redemption",
  "mini-quiz",
]);

export function resolvePublicCourseItems(
  course: CourseRecord,
  moduleById: Map<string, { slug: string; title: string; archived?: boolean; gameType?: string }>,
  experienceById: Map<string, { slug: string; title: string; archived?: boolean; previewToken?: string; status?: string }>,
  options?: { includeContentPreviewTokens?: boolean },
): PublicCourseItem[] {
  const out: PublicCourseItem[] = [];
  for (const section of course.sections || []) {
    for (const item of section.items || []) {
      if (item.kind === "module") {
        const mod = item.moduleInstanceId ? moduleById.get(item.moduleInstanceId) : undefined;
        const moduleType = item.moduleType || mod?.gameType || "spinning-wheel";
        if (!MODULE_TYPES.has(moduleType)) continue;
        const resolvedTitle = item.displayTitle || item.label || mod?.title || moduleType;
        out.push({
          id: item.id,
          sectionId: section.id,
          sectionTitle: section.title,
          kind: "module",
          displayTitle: resolvedTitle,
          label: resolvedTitle,
          iconUrl: item.iconUrl,
          iconEmoji: item.iconEmoji,
          launchPath: mod?.slug ? componentPublicPath(moduleType, mod.slug) : "",
          moduleType,
          badgeArtUrl:
            moduleType === "badge"
              ? String((mod as { badgeBackgroundUrl?: string })?.badgeBackgroundUrl || item.iconUrl || "")
              : undefined,
          missing: !mod,
          archived: !!mod?.archived,
        });
        continue;
      }
      if (item.kind === "experience") {
        const exp = item.experienceId ? experienceById.get(item.experienceId) : undefined;
        const resolvedTitle = item.displayTitle || item.label || exp?.title || "Experience";
        const unpublished = exp && exp.status !== "published";
        const blockedOnLive = unpublished && course.status === "published" && !options?.includeContentPreviewTokens;
        const needsPreview = options?.includeContentPreviewTokens && exp?.previewToken;
        out.push({
          id: item.id,
          sectionId: section.id,
          sectionTitle: section.title,
          kind: "experience",
          displayTitle: resolvedTitle,
          label: resolvedTitle,
          iconUrl: item.iconUrl,
          iconEmoji: item.iconEmoji,
          launchPath: exp?.slug && !blockedOnLive ? `/x/${encodeURIComponent(exp.slug)}` : "",
          previewToken: needsPreview ? exp.previewToken : undefined,
          missing: !exp || blockedOnLive,
          archived: !!exp?.archived,
        });
        continue;
      }
      if (item.kind === "video" && item.videoUrl) {
        const resolvedTitle = item.displayTitle || item.label || item.videoTitle || "Video lesson";
        out.push({
          id: item.id,
          sectionId: section.id,
          sectionTitle: section.title,
          kind: "video",
          displayTitle: resolvedTitle,
          label: resolvedTitle,
          iconUrl: item.iconUrl,
          iconEmoji: item.iconEmoji,
          launchPath: item.videoUrl,
        });
      }
    }
  }
  return out;
}

export function sectionUnlockState(
  section: Pick<CourseSection, "unlockDate" | "unlockDaysAfterStart">,
  startedAt: string,
  now = Date.now(),
): { locked: boolean; reason?: string } {
  if (section.unlockDate) {
    const unlockAt = new Date(section.unlockDate).getTime();
    if (!Number.isNaN(unlockAt) && now < unlockAt) {
      return {
        locked: true,
        reason: `Available from ${new Date(unlockAt).toLocaleDateString("en-GB")}`,
      };
    }
  }
  if (section.unlockDaysAfterStart != null && section.unlockDaysAfterStart > 0) {
    const started = new Date(startedAt).getTime();
    const unlockAt = started + section.unlockDaysAfterStart * 86_400_000;
    if (now < unlockAt) {
      const daysLeft = Math.ceil((unlockAt - now) / 86_400_000);
      return { locked: true, reason: `Unlocks in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` };
    }
  }
  return { locked: false };
}

export function isCourseItemAccessible(
  item: PublicCourseItem,
  items: PublicCourseItem[],
  session: Pick<CourseSession, "completedItemIds" | "startedAt">,
  settings: CourseSettings,
  sectionLocked: boolean,
): { accessible: boolean; reason?: string } {
  if (item.missing || item.archived || !item.launchPath) {
    return { accessible: false, reason: "Unavailable" };
  }
  if (sectionLocked) return { accessible: false, reason: item.lockReason || "Section locked" };
  const completed = new Set(session.completedItemIds || []);
  if (completed.has(item.id)) return { accessible: true };
  if (settings.navigationMode === "free") return { accessible: true };
  const firstOpen = items.find((i) => !completed.has(i.id) && !i.missing && !i.archived && !i.locked);
  if (firstOpen?.id === item.id) return { accessible: true };
  return { accessible: false, reason: "Complete the previous step first" };
}

export function toPublicCourse(
  course: CourseRecord,
  items: PublicCourseItem[],
): PublicCourse {
  const sections = (course.sections || []).map((section) => ({
    id: section.id,
    title: section.title,
    iconUrl: section.iconUrl,
    iconEmoji: section.iconEmoji,
    unlockDate: section.unlockDate ?? null,
    unlockDaysAfterStart: section.unlockDaysAfterStart ?? null,
    items: items.filter((i) => i.sectionId === section.id),
  }));
  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    description: course.description,
    status: course.status,
    presentation: course.presentation,
    settings: publicCourseSettings(course.settings),
    sections,
    items,
    itemCount: items.length,
    classEnrollmentEnabled:
      course.settings?.enrollmentMode === "class" &&
      !!String(course.settings?.classCode || "").trim(),
  };
}

function publicCourseSettings(settings: CourseSettings): CourseSettings {
  const { classCode: _classCode, ...rest } = settings;
  return rest;
}
