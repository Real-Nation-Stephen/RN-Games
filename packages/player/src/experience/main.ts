import {
  appendCourseQuery,
  appendCourseLastStepQuery,
  appendModuleItemCompleteQuery,
  appendFlowQuery,
  componentPublicPath,
  loadCourseContext,
  parseCourseContextFromSearch,
  saveCourseContext,
  track,
  isModuleItemCompleteOverride,
} from "@rngames/shared";
import {
  FLOW_EXPERIENCE_COMPLETE,
  FLOW_EXPERIENCE_CONTENT_READY,
  FLOW_CONTENT_REVEAL,
  FLOW_STEP_COMPLETE,
  isStepCompleteMessage,
  isStepEngagedMessage,
  isEndScreenReadyMessage,
  isStepContentReadyMessage,
  isCourseItemCompleteMessage,
  isExperienceStepChangedMessage,
  FLOW_EXPERIENCE_STEP_CHANGED,
  FLOW_END_SCREEN_READY,
} from "@rngames/shared";

type PublicStep = {
  id: string;
  moduleInstanceId: string;
  moduleType: string;
  label: string;
  moduleSlug: string;
  moduleTitle: string;
  missing?: boolean;
  archived?: boolean;
  overrides?: {
    completionBehaviour?: "auto_continue" | "show_continue" | "replay" | "custom" | "module_item_complete";
    endScreen?: {
      headline?: string;
      body?: string;
      primaryCtaLabel?: string;
    };
  };
};

type PublicExperience = {
  id: string;
  slug: string;
  title: string;
  steps: PublicStep[];
  stepCount: number;
  foundation?: {
    navigation?: {
      nextStepButtonLabel?: string;
    };
  };
};

type Session = {
  sessionId: string;
  experienceId: string;
  experienceSlug: string;
  participantId: string;
  currentStepIndex: number;
  currentNodeId: string | null;
  completedAt?: string | null;
  outcomes?: Record<string, unknown>;
};

/** Clean URL `/x/:slug` or direct `/play/experience.html?slug=` */
function getExperienceSlug(): string {
  const q = new URLSearchParams(window.location.search).get("slug");
  if (q?.trim()) return q.trim();
  const seg = window.location.pathname.split("/").filter(Boolean);
  const i = seg.indexOf("x");
  if (i >= 0 && seg[i + 1]) return seg[i + 1];
  return "";
}

function getPreviewToken(): string {
  return new URLSearchParams(window.location.search).get("previewToken")?.trim() || "";
}

function getCoursePreviewAuth(): { courseSlug: string; coursePreviewToken: string } | null {
  const params = new URLSearchParams(window.location.search);
  const coursePreviewToken = params.get("coursePreviewToken")?.trim() || "";
  const courseSlug = params.get("courseSlug")?.trim() || "";
  if (coursePreviewToken && courseSlug) return { courseSlug, coursePreviewToken };
  return null;
}

function courseContext() {
  return (
    loadCourseContext() ?? parseCourseContextFromSearch(new URLSearchParams(window.location.search))
  );
}

function embeddedInCourse(): boolean {
  return !!courseContext() && window.parent !== window;
}

const els = {
  loading: document.getElementById("exp-loading")!,
  error: document.getElementById("exp-error")!,
  complete: document.getElementById("exp-complete")!,
  completeActions: document.getElementById("exp-complete-actions")!,
  courseReturnWrap: document.getElementById("exp-course-return-wrap")!,
  courseReturn: document.getElementById("exp-course-return")!,
  restart: document.getElementById("exp-restart")!,
  stage: document.getElementById("exp-stage")!,
  title: document.getElementById("exp-title")!,
  progress: document.getElementById("exp-progress")!,
  frame: document.getElementById("exp-frame") as HTMLIFrameElement,
  preload: document.getElementById("exp-preload") as HTMLIFrameElement,
  stepFooter: document.getElementById("exp-step-footer")!,
  stepContinue: document.getElementById("exp-step-continue") as HTMLButtonElement,
  fallback: document.getElementById("exp-fallback")!,
  fallbackMsg: document.getElementById("exp-fallback-msg")!,
  retry: document.getElementById("exp-retry")!,
  continue: document.getElementById("exp-continue")!,
  stepLoading: document.getElementById("exp-step-loading")!,
  stepLoadingLogo: document.getElementById("exp-step-loading-logo") as HTMLImageElement | null,
  stepLoadingText: document.getElementById("exp-step-loading-text")!,
};

/** End-of-game Continue is wired inside the iframe. */
const AUTO_ADVANCE_TYPES = new Set(["catch", "runner"]);
/** In-game next-step button; no experience shell banner. */
const NATIVE_FLOW_TYPES = new Set([
  "flip-cards",
  "spinning-wheel",
  "landing",
  "form",
  "certificate",
  "badge",
  "consent",
  "email-signup",
  "redemption",
  "mini-quiz",
  ...AUTO_ADVANCE_TYPES,
]);

let experience: PublicExperience | null = null;
let session: Session | null = null;
let loadAttempts = 0;
let slug = "";
let previewToken = "";
let advancing = false;
let stepEngaged = false;

function showStepLoading() {
  if (!embeddedInCourse()) return;
  els.stepLoading.hidden = false;
}

function hideStepLoading() {
  els.stepLoading.hidden = true;
}

function revealStepFrame() {
  try {
    els.frame.contentWindow?.postMessage({ type: FLOW_CONTENT_REVEAL }, "*");
  } catch {
    /* cross-origin */
  }
}

function notifyExperienceContentReady() {
  if (!embeddedInCourse() || window.parent === window) return;
  window.parent.postMessage({ type: FLOW_EXPERIENCE_CONTENT_READY }, "*");
}

function markStepContentReady() {
  hideStepLoading();
  revealStepFrame();
  notifyExperienceContentReady();
}

function stepFrameSrc(): string {
  return els.frame.getAttribute("src") || "";
}

function isBlankStepFrame(src: string): boolean {
  return !src || src === "about:blank";
}

function forwardToCourseParent(data: Record<string, unknown>) {
  if (!embeddedInCourse() || window.parent === window) return;
  const courseCtx = courseContext();
  window.parent.postMessage(
    {
      ...data,
      courseSessionId: data.courseSessionId ?? courseCtx?.sessionId,
      courseItemId: data.courseItemId ?? courseCtx?.itemId,
    },
    "*",
  );
}

function isLastExperienceStep(): boolean {
  if (!experience || !session) return false;
  if (session.completedAt) return true;
  return session.currentStepIndex >= experience.steps.length - 1;
}

function forwardCourseFooterSignal(data: Record<string, unknown>) {
  const step = currentStep();
  if (!isLastExperienceStep() && !isModuleItemCompleteOverride(step?.overrides)) return;
  forwardToCourseParent({ ...data, isLastFlowStep: true });
}

function notifyCourseStepPhase() {
  const courseCtx = courseContext();
  if (!embeddedInCourse() || !courseCtx) return;
  const step = currentStep();
  forwardToCourseParent({
    type: FLOW_EXPERIENCE_STEP_CHANGED,
    courseSessionId: courseCtx.sessionId,
    courseItemId: courseCtx.itemId,
    isLastFlowStep: isLastExperienceStep() || isModuleItemCompleteOverride(step?.overrides),
  });
}

function sessionStorageKey() {
  const ctx = courseContext();
  if (ctx) return `rngames:experience-session:${slug}:course:${ctx.itemId}`;
  return `rngames:experience-session:${slug}`;
}

function nextStepButtonLabel(): string {
  return experience?.foundation?.navigation?.nextStepButtonLabel?.trim() || "Next Activity";
}

function showError(msg: string) {
  els.loading.hidden = true;
  els.stage.hidden = true;
  els.complete.hidden = true;
  els.error.hidden = false;
  els.error.textContent = msg;
  markStepContentReady();
}

function saveSessionLocal(s: Session) {
  try {
    localStorage.setItem(
      sessionStorageKey(),
      JSON.stringify({ sessionId: s.sessionId, participantId: s.participantId }),
    );
  } catch {
    /* ignore */
  }
}

function loadSessionLocal(): { sessionId: string; participantId: string } | null {
  try {
    const raw = localStorage.getItem(sessionStorageKey());
    if (!raw) return null;
    return JSON.parse(raw) as { sessionId: string; participantId: string };
  } catch {
    return null;
  }
}

function updateShellContinue() {
  if (embeddedInCourse()) {
    els.stepFooter.hidden = true;
    return;
  }
  const needsBanner = !NATIVE_FLOW_TYPES.has(currentStep()?.moduleType || "");
  els.stepFooter.hidden = !needsBanner;
  if (needsBanner) {
    els.stepContinue.disabled = advancing || !stepEngaged;
    els.stepContinue.textContent = advancing ? "Loading…" : nextStepButtonLabel();
  }
}

function authQueryParams(): URLSearchParams {
  const q = new URLSearchParams();
  if (previewToken) q.set("previewToken", previewToken);
  const coursePrev = getCoursePreviewAuth();
  if (coursePrev) {
    q.set("coursePreviewToken", coursePrev.coursePreviewToken);
    q.set("courseSlug", coursePrev.courseSlug);
  }
  return q;
}

async function fetchExperience(): Promise<PublicExperience> {
  const q = new URLSearchParams({ slug });
  const auth = authQueryParams();
  auth.forEach((value, key) => q.set(key, value));
  const res = await fetch(`/api/public-experience?${q.toString()}`);
  if (!res.ok) throw new Error("Experience not found");
  const data = await res.json();
  return data.experience as PublicExperience;
}

async function createOrResumeSession(): Promise<Session> {
  const saved = embeddedInCourse() ? null : loadSessionLocal();
  const body: Record<string, string | boolean> = { experienceSlug: slug };
  const auth = authQueryParams();
  auth.forEach((value, key) => {
    body[key] = value;
  });
  if (saved?.sessionId) {
    body.sessionId = saved.sessionId;
    body.participantId = saved.participantId;
    if (embeddedInCourse()) body.restartIfComplete = true;
  }
  const res = await fetch("/api/experience-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Could not start session");
  }
  const data = await res.json();
  const s = data.session as Session;
  saveSessionLocal(s);
  return s;
}

async function restartSession(): Promise<Session> {
  if (!session) throw new Error("No session");
  const res = await fetch("/api/experience-session", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: session.sessionId,
      action: "restart",
    }),
  });
  if (!res.ok) throw new Error("Could not restart");
  const data = await res.json();
  const s = data.session as Session;
  session = s;
  saveSessionLocal(s);
  return s;
}

async function advanceSession(outcomes: Record<string, unknown> = {}) {
  if (!session) return;
  const res = await fetch("/api/experience-session", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: session.sessionId,
      action: "advance",
      outcomes,
    }),
  });
  if (!res.ok) throw new Error("Could not advance");
  const data = await res.json();
  session = data.session as Session;
  saveSessionLocal(session);
}

function currentStep(): PublicStep | null {
  if (!experience || !session) return null;
  const idx = session.currentStepIndex;
  if (idx >= experience.steps.length) return null;
  return experience.steps[idx] || null;
}

function stepFrameUrl(step: PublicStep): string {
  if (!session || !experience) return "";
  const base = componentPublicPath(step.moduleType, step.moduleSlug);
  const isLastStep = session.currentStepIndex >= experience.steps.length - 1;
  const moduleComplete = isModuleItemCompleteOverride(step.overrides);
  const useEndScreen = isLastStep || moduleComplete;
  let path = appendFlowQuery(base, {
    sessionId: session.sessionId,
    experienceId: experience.id,
    nodeId: step.id,
    nextStepLabel: moduleComplete
      ? step.overrides?.endScreen?.primaryCtaLabel?.trim() || "Mark complete & continue"
      : nextStepButtonLabel(),
    endScreen: useEndScreen ? step.overrides?.endScreen : undefined,
  });
  const courseCtx = courseContext();
  if (courseCtx) {
    path = appendCourseQuery(path, {
      sessionId: courseCtx.sessionId,
      courseId: courseCtx.courseId,
      courseSlug: courseCtx.courseSlug,
      itemId: courseCtx.itemId,
    });
    if (isLastStep) path = appendCourseLastStepQuery(path);
    if (isModuleItemCompleteOverride(step.overrides)) path = appendModuleItemCompleteQuery(path);
  }
  if (path.startsWith("http")) return path;
  return `${window.location.origin}${path}`;
}

function notifyCourseComplete() {
  const courseCtx = courseContext();
  if (!courseCtx || !session || window.parent === window) return;
  forwardToCourseParent({
    type: FLOW_EXPERIENCE_COMPLETE,
    outcomes: session.outcomes || {},
  });
  forwardCourseFooterSignal({
    type: FLOW_END_SCREEN_READY,
    courseSessionId: courseCtx.sessionId,
    courseItemId: courseCtx.itemId,
  });
}

function preloadNextStep() {
  // Preloading the next step iframe can fire stray step-complete messages (same session, wrong node).
  return;
}

function renderStep() {
  if (!experience || !session) return;

  if (session.completedAt || session.currentStepIndex >= experience.steps.length) {
    const inCourse = embeddedInCourse();
    els.loading.hidden = true;
    if (inCourse) {
      els.complete.hidden = true;
      els.stage.hidden = false;
      markStepContentReady();
      notifyCourseComplete();
    } else {
      els.stage.hidden = true;
      els.complete.hidden = false;
      els.completeActions.hidden = !previewToken;
      els.courseReturnWrap.hidden = true;
    }
    track({
      type: "experience.complete",
      gameId: experience.id,
      campaignId: experience.id,
      sessionId: session.sessionId,
      payload: { slug: experience.slug },
    });
    return;
  }

  const step = currentStep();
  if (!step) {
    showError("No step configured.");
    return;
  }

  stepEngaged = false;
  advancing = false;

  els.loading.hidden = true;
  els.stage.hidden = false;
  els.complete.hidden = true;
  els.courseReturnWrap.hidden = true;
  els.fallback.hidden = true;
  els.stepFooter.hidden = embeddedInCourse();
  els.title.textContent = experience.title;
  els.progress.textContent = `Step ${session.currentStepIndex + 1} of ${experience.steps.length}`;

  if (step.missing || !step.moduleSlug) {
    els.fallback.hidden = false;
    els.stepFooter.hidden = true;
    els.fallbackMsg.textContent = `Component unavailable (${step.label}).`;
    els.frame.src = "about:blank";
    markStepContentReady();
    return;
  }

  loadAttempts = 0;
  const url = stepFrameUrl(step);
  const currentSrc = stepFrameSrc();
  if (embeddedInCourse()) showStepLoading();
  if (!currentSrc || currentSrc !== url) {
    els.frame.src = url;
  } else if (embeddedInCourse()) {
    markStepContentReady();
  }
  updateShellContinue();

  track({
    type: "experience.step_start",
    gameId: step.moduleInstanceId,
    moduleId: step.moduleInstanceId,
    campaignId: experience.id,
    sessionId: session.sessionId,
    payload: { stepId: step.id, moduleType: step.moduleType },
  });

  notifyCourseStepPhase();
}

async function onStepComplete(outcomes: Record<string, unknown> = {}, fromShell = false) {
  if (!session || !experience || advancing) return;
  if (fromShell && !stepEngaged) return;
  if (session.completedAt) return;

  const step = currentStep();
  advancing = true;
  updateShellContinue();

  track({
    type: "experience.step_complete",
    gameId: step?.moduleInstanceId || experience.id,
    moduleId: step?.moduleInstanceId,
    campaignId: experience.id,
    sessionId: session.sessionId,
    payload: { stepId: step?.id, outcomes },
  });

  try {
    await advanceSession(outcomes);
    renderStep();
  } catch (e) {
    showError(e instanceof Error ? e.message : "Could not advance");
  } finally {
    advancing = false;
    updateShellContinue();
  }
}

function bindEvents() {
  window.addEventListener("message", (ev) => {
    if (isStepContentReadyMessage(ev.data)) {
      markStepContentReady();
      return;
    }
    if (isEndScreenReadyMessage(ev.data)) {
      forwardCourseFooterSignal(ev.data as Record<string, unknown>);
      return;
    }
    if (isCourseItemCompleteMessage(ev.data)) {
      forwardToCourseParent(ev.data as Record<string, unknown>);
      return;
    }
    if (isStepEngagedMessage(ev.data)) {
      if (ev.data.sessionId && session && ev.data.sessionId !== session.sessionId) return;
      stepEngaged = true;
      updateShellContinue();
      forwardCourseFooterSignal({
        ...ev.data,
        moduleType: currentStep()?.moduleType,
      });
      return;
    }
    if (!isStepCompleteMessage(ev.data)) return;
    if (ev.data.sessionId && session && ev.data.sessionId !== session.sessionId) return;
    const step = currentStep();
    if (ev.data.nodeId && step?.id && ev.data.nodeId !== step.id) return;
    void onStepComplete(ev.data.outcomes || {});
  });

  els.frame.addEventListener("load", () => {
    if (isBlankStepFrame(stepFrameSrc())) return;
    markStepContentReady();
  });

  els.frame.addEventListener("error", () => {
    els.fallback.hidden = false;
    els.fallbackMsg.textContent = "This step failed to load.";
  });

  els.retry.addEventListener("click", () => {
    els.fallback.hidden = true;
    renderStep();
  });

  els.continue.addEventListener("click", () => {
    void onStepComplete({}, true);
  });

  els.stepContinue.addEventListener("click", () => {
    void onStepComplete({}, true);
  });

  els.courseReturn.addEventListener("click", () => {
    notifyCourseComplete();
  });

  els.restart.addEventListener("click", () => {
    void (async () => {
      try {
        advancing = true;
        await restartSession();
        renderStep();
      } catch (e) {
        showError(e instanceof Error ? e.message : "Could not restart");
      } finally {
        advancing = false;
      }
    })();
  });
}

function applyCourseEmbedChrome() {
  if (!embeddedInCourse()) return;
  document.getElementById("app")?.classList.add("course-embed");
  const params = new URLSearchParams(window.location.search);
  const bg = params.get("courseLoadingBg");
  const text = params.get("courseLoadingText");
  const textHex = params.get("courseLoadingTextHex");
  const logo = params.get("courseLoadingLogo");
  if (bg) els.stepLoading.style.setProperty("--exp-loading-bg", bg);
  if (textHex) els.stepLoading.style.setProperty("--exp-loading-text", textHex);
  if (text) els.stepLoadingText.textContent = text;
  if (logo && els.stepLoadingLogo) {
    els.stepLoadingLogo.src = logo;
    els.stepLoadingLogo.hidden = false;
  }
}

async function boot() {
  slug = getExperienceSlug();
  previewToken = getPreviewToken();
  const courseCtx = courseContext();
  if (courseCtx) saveCourseContext(courseCtx);
  applyCourseEmbedChrome();
  if (!slug) {
    showError("Missing experience slug.");
    return;
  }
  bindEvents();
  try {
    experience = await fetchExperience();
    session = await createOrResumeSession();
    renderStep();
  } catch (e) {
    showError(e instanceof Error ? e.message : "Failed to load experience");
  }
}

void boot();

export { FLOW_STEP_COMPLETE };
