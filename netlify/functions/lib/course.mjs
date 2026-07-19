/** Course normalizers — mirrors @rngames/shared/course (JS for Netlify functions). */

import { componentPublicPath } from "./experience.mjs";
import { defaultDeploymentMeasurement, normalizeDeploymentMeasurement } from "./measurement.mjs";

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

export function defaultCoursePresentation() {
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

export function defaultCourseSettings() {
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
    profilePanel: {
      enabled: false,
      accumulateScores: true,
      scoreMode: "bestPerItem",
      showAccumulatedScore: true,
      showItemsCompleted: true,
      showDisplayName: true,
      showCourseStartDate: true,
    },
  };
}

export function emptyCourseRecord(id, slug, previewToken) {
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
    measurement: defaultDeploymentMeasurement(),
    archived: false,
  };
}

function normalizeCourseItem(raw, index) {
  const kind = raw.kind === "experience" || raw.kind === "video" ? raw.kind : "module";
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
    lockAfterComplete: raw.lockAfterComplete === true,
  };
}

function normalizeCourseSection(raw, index) {
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

function normalizePresentation(raw) {
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
    loadingText: String(raw.loadingText || d.loadingText),
    loadingTextHex: String(raw.loadingTextHex || raw.bodyHex || d.loadingTextHex),
  };
}

function normalizeSettings(raw) {
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
      showCourseStartDate: profile.showCourseStartDate !== false,
      showItemsCompleted: profile.showItemsCompleted !== false,
      showAccumulatedScore: profile.showAccumulatedScore !== false,
      accumulateScores: profile.accumulateScores !== false,
      scoreMode: profile.scoreMode === "latest" ? "latest" : "bestPerItem",
      completionBonusEnabled: !!profile.completionBonusEnabled,
      completionBonusPoints: Math.max(0, Math.min(9999, Number(profile.completionBonusPoints) || 0)),
      showCourseDeadline: !!profile.showCourseDeadline,
      showLastQuizScore: !!profile.showLastQuizScore,
      showAvgQuizScore: !!profile.showAvgQuizScore,
      showLatestGameScore: !!profile.showLatestGameScore,
      showLeaderboardRank: !!profile.showLeaderboardRank,
    },
  };
}

export function normalizeCourseRecord(doc) {
  const sections = Array.isArray(doc.sections) ? doc.sections.map((s, i) => normalizeCourseSection(s, i)) : [];
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
    measurement: normalizeDeploymentMeasurement(doc.measurement),
    archived: !!doc.archived,
  };
}

export function flattenCourseItems(sections) {
  return (sections || []).flatMap((s) => s.items || []);
}

/** Draft experiences in a course preview may be loaded via course preview token. */
export async function coursePreviewAuthorizesExperience(courseSlug, coursePreviewToken, experienceId, deps) {
  const slug = String(courseSlug || "")
    .trim()
    .toLowerCase();
  const token = String(coursePreviewToken || "").trim();
  const expId = String(experienceId || "").trim();
  if (!slug || !token || !expId) return false;

  const readCoursesIndex = deps?.readCoursesIndex;
  const getCourseJson = deps?.getCourseJson;
  if (!readCoursesIndex || !getCourseJson) return false;

  const list = await readCoursesIndex();
  const row = list.find((x) => x.slug === slug);
  if (!row) return false;

  const raw = await getCourseJson(row.id);
  if (!raw) return false;

  const course = normalizeCourseRecord(raw);
  if (token !== course.previewToken) return false;

  return flattenCourseItems(course.sections).some(
    (item) => item.kind === "experience" && item.experienceId === expId,
  );
}

export function toCourseIndexEntry(doc) {
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

export function resolvePublicCourseItems(course, moduleById, experienceById, options = {}) {
  const out = [];
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
              ? String(mod?.badgeBackgroundUrl || item.iconUrl || "")
              : undefined,
          missing: !mod,
          archived: !!mod?.archived,
          lockAfterComplete: item.lockAfterComplete === true,
        });
        continue;
      }
      if (item.kind === "experience") {
        const exp = item.experienceId ? experienceById.get(item.experienceId) : undefined;
        const resolvedTitle = item.displayTitle || item.label || exp?.title || "Experience";
        const unpublished = exp && exp.status !== "published";
        const blockedOnLive = unpublished && course.status === "published" && !options.includeContentPreviewTokens;
        const needsPreview = options.includeContentPreviewTokens && exp?.previewToken;
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
          lockAfterComplete: item.lockAfterComplete === true,
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
          lockAfterComplete: item.lockAfterComplete === true,
        });
      }
    }
  }
  return out;
}

export function toPublicCourse(course, items) {
  const sections = (course.sections || []).map((section) => ({
    id: section.id,
    title: section.title,
    description: section.description || "",
    iconUrl: section.iconUrl,
    iconEmoji: section.iconEmoji,
    unlockDate: section.unlockDate ?? null,
    unlockDaysAfterStart: section.unlockDaysAfterStart ?? null,
    items: items.filter((i) => i.sectionId === section.id),
  }));
  const settings = course.settings || {};
  const { classCode: _omit, ...publicSettings } = settings;
  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    description: course.description,
    status: course.status,
    presentation: course.presentation,
    settings: publicSettings,
    sections,
    items,
    itemCount: items.length,
    classEnrollmentEnabled:
      settings.enrollmentMode === "class" && !!String(settings.classCode || "").trim(),
  };
}
