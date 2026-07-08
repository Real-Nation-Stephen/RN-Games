/** Course normalizers — mirrors @rngames/shared/course (JS for Netlify functions). */

import { componentPublicPath } from "./experience.mjs";

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
    archived: false,
  };
}

function normalizeCourseItem(raw, index) {
  const kind = raw.kind === "experience" || raw.kind === "video" ? raw.kind : "module";
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

function normalizeCourseSection(raw, index) {
  const items = Array.isArray(raw.items) ? raw.items.map((item, i) => normalizeCourseItem(item, i)) : [];
  return {
    id: String(raw.id || `section-${index}`),
    title: String(raw.title || `Section ${index + 1}`),
    items,
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
    archived: !!doc.archived,
  };
}

export function flattenCourseItems(sections) {
  return (sections || []).flatMap((s) => s.items || []);
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

export function resolvePublicCourseItems(course, moduleById, experienceById) {
  const out = [];
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

export function toPublicCourse(course, items) {
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
