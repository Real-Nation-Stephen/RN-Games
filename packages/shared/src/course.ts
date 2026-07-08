/**
 * Course record — Wave 2.5 structured learning product (separate from modules and experiences).
 */
import { componentPublicPath } from "./experience-utils.js";

export type CourseStatus = "draft" | "published" | "archived";

export type CourseItemKind = "module" | "experience" | "video";

export interface CourseItem {
  id: string;
  kind: CourseItemKind;
  label?: string;
  /** Module reference */
  moduleInstanceId?: string;
  moduleType?: string;
  /** Nested experience */
  experienceId?: string;
  /** External video / lesson URL */
  videoUrl?: string;
  videoTitle?: string;
}

export interface CourseSection {
  id: string;
  title: string;
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
  label: string;
  launchPath: string;
  moduleType?: string;
  missing?: boolean;
  archived?: boolean;
}

export interface PublicCourse {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: CourseStatus;
  sections: { id: string; title: string; items: PublicCourseItem[] }[];
  items: PublicCourseItem[];
  itemCount: number;
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
    archived: false,
  };
}

export function flattenCourseItems(sections: CourseSection[]): CourseItem[] {
  return (sections || []).flatMap((s) => s.items || []);
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
    label: raw.label ? String(raw.label) : undefined,
    moduleInstanceId: raw.moduleInstanceId ? String(raw.moduleInstanceId) : undefined,
    moduleType: raw.moduleType ? String(raw.moduleType) : undefined,
    experienceId: raw.experienceId ? String(raw.experienceId) : undefined,
    videoUrl: raw.videoUrl ? String(raw.videoUrl) : undefined,
    videoTitle: raw.videoTitle ? String(raw.videoTitle) : undefined,
  };
}

export function normalizeCourseSection(raw: Partial<CourseSection>, index: number): CourseSection {
  const items = Array.isArray(raw.items) ? raw.items.map((item, i) => normalizeCourseItem(item, i)) : [];
  return {
    id: String(raw.id || `section-${index}`),
    title: String(raw.title || `Section ${index + 1}`),
    items,
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
  "consent",
  "email-signup",
  "redemption",
]);

export function resolvePublicCourseItems(
  course: CourseRecord,
  moduleById: Map<string, { slug: string; title: string; archived?: boolean; gameType?: string }>,
  experienceById: Map<string, { slug: string; title: string; archived?: boolean }>,
): PublicCourseItem[] {
  const out: PublicCourseItem[] = [];
  for (const section of course.sections || []) {
    for (const item of section.items || []) {
      if (item.kind === "module") {
        const mod = item.moduleInstanceId ? moduleById.get(item.moduleInstanceId) : undefined;
        const moduleType = item.moduleType || mod?.gameType || "spinning-wheel";
        if (!MODULE_TYPES.has(moduleType)) continue;
        out.push({
          id: item.id,
          sectionId: section.id,
          sectionTitle: section.title,
          kind: "module",
          label: item.label || mod?.title || moduleType,
          launchPath: mod?.slug ? componentPublicPath(moduleType, mod.slug) : "",
          moduleType,
          missing: !mod,
          archived: !!mod?.archived,
        });
        continue;
      }
      if (item.kind === "experience") {
        const exp = item.experienceId ? experienceById.get(item.experienceId) : undefined;
        out.push({
          id: item.id,
          sectionId: section.id,
          sectionTitle: section.title,
          kind: "experience",
          label: item.label || exp?.title || "Experience",
          launchPath: exp?.slug ? `/x/${encodeURIComponent(exp.slug)}` : "",
          missing: !exp,
          archived: !!exp?.archived,
        });
        continue;
      }
      if (item.kind === "video" && item.videoUrl) {
        out.push({
          id: item.id,
          sectionId: section.id,
          sectionTitle: section.title,
          kind: "video",
          label: item.label || item.videoTitle || "Video lesson",
          launchPath: item.videoUrl,
        });
      }
    }
  }
  return out;
}

export function toPublicCourse(
  course: CourseRecord,
  items: PublicCourseItem[],
): PublicCourse {
  const sections = (course.sections || []).map((section) => ({
    id: section.id,
    title: section.title,
    items: items.filter((i) => i.sectionId === section.id),
  }));
  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    description: course.description,
    status: course.status,
    sections,
    items,
    itemCount: items.length,
  };
}
