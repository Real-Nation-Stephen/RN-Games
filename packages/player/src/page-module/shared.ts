import {
  emitStepComplete,
  emitStepEngaged,
  isFlowMode,
  isCourseMode,
  parseFlowContextFromSearch,
  parseCourseContextFromSearch,
  saveFlowContext,
  saveCourseContext,
  loadCourseContext,
  loadFlowContext,
  FLOW_END_SCREEN_READY,
  FLOW_COURSE_ITEM_COMPLETE,
  FLOW_STEP_CONTENT_READY,
  isLastCourseStepFromSearch,
  isModuleItemCompleteFromSearch,
  type CourseContext,
} from "@rngames/shared";
import type { PageModuleRecord } from "@rngames/shared/page-modules";
import { extractLearnerDisplayName } from "@rngames/shared/page-modules";
import { track } from "@rngames/shared/track";
import { applyPageFonts } from "./blocks";

export type { PageModuleRecord };

export function getSlugFromPath(segment: string): string {
  const q = new URLSearchParams(window.location.search).get("slug");
  if (q?.trim()) return q.trim();
  const seg = window.location.pathname.split("/").filter(Boolean);
  const i = seg.indexOf(segment);
  if (i >= 0 && seg[i + 1]) return seg[i + 1];
  return "";
}

export async function fetchPageModule(slug: string, expectedType: string): Promise<PageModuleRecord> {
  const res = await fetch(`/api/public-wheel?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Page not found");
  const data = (await res.json()) as PageModuleRecord;
  if (data.gameType !== expectedType) throw new Error("Wrong page type");
  return data;
}

export function initFlowContext() {
  const flowCtx = parseFlowContextFromSearch(new URLSearchParams(window.location.search));
  if (flowCtx) saveFlowContext(flowCtx);
  return flowCtx;
}

export function initCourseContext() {
  const courseCtx = parseCourseContextFromSearch(new URLSearchParams(window.location.search));
  if (courseCtx) saveCourseContext(courseCtx);
  return courseCtx;
}

export function initEmbeddedContexts() {
  return { flow: initFlowContext(), course: initCourseContext() };
}

export function embeddedShellActive(): boolean {
  return flowModeActive() || courseModeActive();
}

export function courseModeActive(): boolean {
  return isCourseMode();
}

export function flowNextLabel(): string {
  return new URLSearchParams(window.location.search).get("nextStepLabel")?.trim() || "Continue";
}

export function flowModeActive(): boolean {
  return isFlowMode();
}

export function pickBackground(cfg: PageModuleRecord): string {
  const w = window.innerWidth;
  const bg = cfg.backgrounds || {};
  if (w < 768 && bg.mobile) return bg.mobile;
  if (w < 1024 && bg.tablet) return bg.tablet;
  return bg.desktop || cfg.backgroundImage || "";
}

export function applyPageTheme(cfg: PageModuleRecord, root: HTMLElement) {
  const bgUrl = pickBackground(cfg);
  const doc = root.ownerDocument;
  const html = doc.documentElement;
  const body = doc.body;

  html.style.setProperty("--page-bg", cfg.backgroundHex || "#0a1628");
  html.style.setProperty("--page-bg-image", bgUrl ? `url('${bgUrl}')` : "none");
  html.style.setProperty("--page-headline", cfg.typography?.headlineHex || "#ffffff");
  html.style.setProperty("--page-body", cfg.typography?.bodyHex || "#e8eef5");
  html.style.setProperty("--page-subhead", cfg.typography?.subheadHex || cfg.typography?.bodyHex || "#e8eef5");
  html.style.setProperty("--page-label", cfg.typography?.labelHex || cfg.typography?.bodyHex || "#e8eef5");
  html.style.setProperty("--page-btn-bg", cfg.primaryCta?.backgroundHex || "#2d6cdf");
  html.style.setProperty("--page-btn-text", cfg.primaryCta?.textHex || "#ffffff");

  html.classList.remove("page-bg-fixed", "page-bg-scroll");
  html.classList.add(cfg.backgroundMode === "scroll" ? "page-bg-scroll" : "page-bg-fixed");

  if (cfg.faviconUrl) {
    let link = doc.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = doc.createElement("link");
      link.rel = "icon";
      doc.head.appendChild(link);
    }
    link.href = cfg.faviconUrl;
  }
  if (cfg.title) doc.title = cfg.title;
  applyPageFonts(cfg);
}

export function wirePageLogo(cfg: PageModuleRecord) {
  const el = document.getElementById("page-logo");
  if (!el) return;
  if (cfg.logoUrl) {
    el.replaceChildren();
    const img = document.createElement("img");
    img.src = cfg.logoUrl;
    img.alt = "";
    el.appendChild(img);
    el.className = `page-logo page-logo--${cfg.logoAlign || "center"}`;
    el.hidden = false;
  } else {
    el.hidden = true;
    el.replaceChildren();
  }
}

export function pageThumbnailCanvasOptions(iframe: HTMLIFrameElement) {
  const idoc = iframe.contentDocument;
  const idwin = iframe.contentWindow;
  if (!idoc || !idwin) return { useCORS: true, allowTaint: false, logging: false };
  const html = idoc.documentElement;
  const bgSolid = idwin.getComputedStyle(html).getPropertyValue("--page-bg").trim() || "#0a1628";
  const bgImage = idwin.getComputedStyle(html).getPropertyValue("--page-bg-image").trim();
  return {
    useCORS: true,
    allowTaint: false,
    logging: false,
    backgroundColor: bgSolid,
    onclone: (doc: Document) => {
      const app = doc.getElementById("page-app");
      const cloneHtml = doc.documentElement;
      if (app) {
        (app as HTMLElement).style.backgroundColor = bgSolid;
        if (bgImage && bgImage !== "none") {
          (app as HTMLElement).style.backgroundImage = bgImage;
          (app as HTMLElement).style.backgroundSize = "cover";
          (app as HTMLElement).style.backgroundPosition = "center";
          (app as HTMLElement).style.backgroundRepeat = "no-repeat";
        }
      }
      cloneHtml.style.background = bgSolid;
    },
  };
}

export function wirePoweredBy(cfg: PageModuleRecord) {
  const el = document.getElementById("powered-by-rn");
  if (el) el.hidden = cfg.showPoweredBy === false;
}

export function completeStep(outcomes: Record<string, unknown> = {}) {
  track({
    type: "page.step_complete",
    gameId: String(outcomes.gameId || ""),
    payload: outcomes,
  });
  emitStepComplete({ completed: true, ...outcomes });
}

export function engageStep() {
  emitStepEngaged();
}

export function notifyStepContentReady() {
  if (window.parent === window) return;
  window.parent.postMessage({ type: FLOW_STEP_CONTENT_READY }, "*");
}

export function courseContextFromPage(): CourseContext | null {
  return loadCourseContext() ?? parseCourseContextFromSearch(new URLSearchParams(window.location.search));
}

export function isInCourseEmbed(): boolean {
  return !!courseContextFromPage() && window.parent !== window;
}

function postToCourseShell(data: Record<string, unknown>) {
  const ctx = courseContextFromPage();
  if (!ctx) return;
  const payload = {
    ...data,
    courseSessionId: data.courseSessionId ?? ctx.sessionId,
    courseItemId: data.courseItemId ?? ctx.itemId,
  };
  const targets = new Set<Window>();
  try {
    if (window.parent && window.parent !== window) targets.add(window.parent);
    if (window.top && window.top !== window) targets.add(window.top);
  } catch {
    /* cross-origin */
  }
  for (const target of targets) {
    try {
      target.postMessage(payload, "*");
    } catch {
      /* ignore */
    }
  }
}

export function notifyEndScreenReady() {
  const ctx = courseContextFromPage();
  if (!ctx) return;
  const payload = {
    type: FLOW_END_SCREEN_READY,
    isLastFlowStep: isLastCourseStepFromSearch() || isModuleItemCompleteFromSearch(),
  };
  postToCourseShell(payload);
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(
      {
        ...payload,
        courseSessionId: ctx.sessionId,
        courseItemId: ctx.itemId,
      },
      "*",
    );
  }
}

export function notifyCourseItemComplete(outcomes: Record<string, unknown> = {}) {
  const ctx = courseContextFromPage();
  if (!ctx) return;
  postToCourseShell({
    type: FLOW_COURSE_ITEM_COMPLETE,
    outcomes,
  });
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(
      {
        type: FLOW_COURSE_ITEM_COMPLETE,
        courseSessionId: ctx.sessionId,
        courseItemId: ctx.itemId,
        outcomes,
      },
      "*",
    );
  }
}

export async function patchCourseSessionData(
  sessionId: string,
  itemId: string,
  data: Record<string, unknown>,
  outcomes: Record<string, unknown> = {},
) {
  await fetch("/api/course-session", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, itemId, action: "sync", data, outcomes }),
  });
}

export async function fetchCourseSession(sessionId: string) {
  const res = await fetch(`/api/course-session?id=${encodeURIComponent(sessionId)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.session as {
    outcomes?: Record<string, unknown>;
    data?: Record<string, unknown>;
    itemOutcomes?: Record<string, Record<string, unknown>>;
  };
}
export async function loadModuleSessionRoot(): Promise<{
  data?: Record<string, unknown>;
  outcomes?: Record<string, unknown>;
} | null> {
  const params = new URLSearchParams(window.location.search);
  const flow = loadFlowContext() ?? parseFlowContextFromSearch(params);
  const course = loadCourseContext() ?? parseCourseContextFromSearch(params);

  let flowRoot: { data?: Record<string, unknown>; outcomes?: Record<string, unknown> } | null = null;
  if (flow?.sessionId) {
    flowRoot = (await fetchSession(flow.sessionId)) || null;
  }

  let courseRoot: { data?: Record<string, unknown>; outcomes?: Record<string, unknown> } | null = null;
  if (course?.sessionId) {
    const session = await fetchCourseSession(course.sessionId);
    if (session) {
      const itemOutcomes = session.itemOutcomes?.[course.itemId] || {};
      courseRoot = {
        data: session.data,
        outcomes: { ...session.outcomes, ...itemOutcomes },
      };
    }
  }

  if (flowRoot && courseRoot) {
    return {
      data: { ...(courseRoot.data || {}), ...(flowRoot.data || {}) },
      outcomes: { ...(courseRoot.outcomes || {}), ...(flowRoot.outcomes || {}) },
    };
  }
  return flowRoot || courseRoot || null;
}

export async function syncModuleSession(
  data: Record<string, unknown>,
  outcomes: Record<string, unknown> = {},
) {
  const params = new URLSearchParams(window.location.search);
  const flow = parseFlowContextFromSearch(params);
  const course = loadCourseContext() ?? parseCourseContextFromSearch(params);
  const formFields =
    data.formFields && typeof data.formFields === "object"
      ? (data.formFields as Record<string, unknown>)
      : null;
  const learnerDisplayName = formFields ? extractLearnerDisplayName(formFields) : undefined;
  const courseData =
    learnerDisplayName && course?.sessionId
      ? { ...data, learnerDisplayName }
      : data;
  if (course?.sessionId) {
    await patchCourseSessionData(course.sessionId, course.itemId, courseData, outcomes);
  }
  if (flow?.sessionId) {
    const flowData =
      learnerDisplayName ? { ...data, learnerDisplayName } : data;
    await patchSessionData(flow.sessionId, flowData, outcomes);
  }
}

export async function patchSessionData(
  sessionId: string,
  data: Record<string, unknown>,
  outcomes: Record<string, unknown> = {},
) {
  await fetch("/api/experience-session", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, data, outcomes }),
  });
}

export async function fetchSession(sessionId: string) {
  const res = await fetch(`/api/experience-session?id=${encodeURIComponent(sessionId)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.session as {
    outcomes?: Record<string, unknown>;
    data?: Record<string, unknown>;
  };
}

export function scheduleAutoContinue(cfg: PageModuleRecord, onContinue: () => void) {
  if (!embeddedShellActive() || !cfg.experienceAutoContinue) return;
  const ms = Math.max(500, cfg.experienceAutoContinueDelayMs || 2000);
  window.setTimeout(onContinue, ms);
}

export type WireEmbeddedContinueOptions = {
  button?: HTMLButtonElement | null;
  standaloneLabel?: string;
  onContinue: () => void;
};

/** Show or inject a Continue button when embedded in a flow or course player. */
export function wireEmbeddedFlowContinue(opts: WireEmbeddedContinueOptions): void {
  const embedded = embeddedShellActive();
  const label = embedded ? flowNextLabel() : opts.standaloneLabel || "Continue";

  if (opts.button) {
    opts.button.hidden = false;
    opts.button.textContent = label;
    opts.button.onclick = () => opts.onContinue();
    return;
  }

  if (!embedded) return;

  let footer = document.getElementById("embedded-flow-footer") as HTMLElement | null;
  if (!footer) {
    footer = document.createElement("footer");
    footer.id = "embedded-flow-footer";
    footer.className = "embedded-flow-footer";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "page-btn embedded-flow-continue";
    footer.appendChild(btn);
    document.body.appendChild(footer);
  }

  const btn = footer.querySelector("button")!;
  btn.textContent = label;
  btn.onclick = () => opts.onContinue();
  footer.hidden = false;
}

export function setupPagePreview(gameType: string, onConfig: (cfg: PageModuleRecord) => void) {
  window.addEventListener("message", (e) => {
    if (e.origin !== window.location.origin) return;
    if (e.data?.type !== `rngames-${gameType}-config`) return;
    if (e.data.config) onConfig(e.data.config as PageModuleRecord);
  });
}
