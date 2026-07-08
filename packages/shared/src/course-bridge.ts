/**
 * Course shell runtime — parent/iframe coordination (mirrors flow-bridge).
 */

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
