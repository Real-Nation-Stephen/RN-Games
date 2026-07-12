/**
 * Course shell runtime — parent/iframe coordination (mirrors flow-bridge).
 */

import type { ExperienceNodeOverrides } from "./experience.js";

export interface CourseContext {
  sessionId: string;
  courseId: string;
  courseSlug: string;
  itemId: string;
}

export const COURSE_CTX_STORAGE_KEY = "rngames:course";

export function parseCourseContextFromSearch(params: URLSearchParams): CourseContext | null {
  if (params.get("course") !== "1") return null;
  const sessionId = params.get("courseSessionId")?.trim();
  const courseId = params.get("courseId")?.trim();
  const itemId = params.get("courseItemId")?.trim();
  if (!sessionId || !courseId || !itemId) return null;
  return {
    sessionId,
    courseId,
    itemId,
    courseSlug: params.get("courseSlug")?.trim() || "",
  };
}

export function saveCourseContext(ctx: CourseContext): void {
  try {
    sessionStorage.setItem(COURSE_CTX_STORAGE_KEY, JSON.stringify(ctx));
  } catch {
    /* ignore */
  }
}

export function loadCourseContext(): CourseContext | null {
  try {
    const raw = sessionStorage.getItem(COURSE_CTX_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CourseContext;
  } catch {
    return null;
  }
}

/** Prefer URL params (authoritative for the current iframe) over sessionStorage. */
export function resolveCourseContext(params?: URLSearchParams): CourseContext | null {
  const p =
    params ?? (typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null);
  if (!p) return loadCourseContext();
  return parseCourseContextFromSearch(p) ?? loadCourseContext();
}

export function clearCourseContext(): void {
  try {
    sessionStorage.removeItem(COURSE_CTX_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function isCourseMode(params?: URLSearchParams): boolean {
  const p = params ?? (typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null);
  return p?.get("course") === "1";
}

export function appendCourseQuery(
  path: string,
  params: {
    sessionId: string;
    courseId: string;
    courseSlug: string;
    itemId: string;
  },
): string {
  const sep = path.includes("?") ? "&" : "?";
  const q = new URLSearchParams({
    course: "1",
    courseSessionId: params.sessionId,
    courseId: params.courseId,
    courseItemId: params.itemId,
    courseSlug: params.courseSlug,
  });
  return `${path}${sep}${q.toString()}`;
}

/** True when the course shell marked this embed as the last step in a flow. */
export function isLastCourseStepFromSearch(params?: URLSearchParams): boolean {
  const p =
    params ?? (typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null);
  return p?.get("courseLastStep") === "1";
}

export function appendCourseLastStepQuery(path: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}courseLastStep=1`;
}

/** True when the flow editor marked this step to surface the course "Mark complete" bar. */
export function isModuleItemCompleteFromSearch(params?: URLSearchParams): boolean {
  const p =
    params ?? (typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null);
  return p?.get("moduleItemComplete") === "1";
}

export function appendModuleItemCompleteQuery(path: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}moduleItemComplete=1`;
}

/** Whether this step override should show the course completion footer when embedded in a course. */
export function isModuleItemCompleteOverride(
  overrides?: ExperienceNodeOverrides | null,
): boolean {
  return overrides?.completionBehaviour === "module_item_complete";
}
