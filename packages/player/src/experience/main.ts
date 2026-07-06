import { appendFlowQuery, componentPublicPath, track } from "@rngames/shared";
import { FLOW_STEP_COMPLETE, isStepCompleteMessage, isStepEngagedMessage } from "@rngames/shared";

type PublicStep = {
  id: string;
  moduleInstanceId: string;
  moduleType: string;
  label: string;
  moduleSlug: string;
  moduleTitle: string;
  missing?: boolean;
  archived?: boolean;
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

const els = {
  loading: document.getElementById("exp-loading")!,
  error: document.getElementById("exp-error")!,
  complete: document.getElementById("exp-complete")!,
  completeActions: document.getElementById("exp-complete-actions")!,
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
  "consent",
  "email-signup",
  "redemption",
  ...AUTO_ADVANCE_TYPES,
]);

let experience: PublicExperience | null = null;
let session: Session | null = null;
let loadAttempts = 0;
let slug = "";
let previewToken = "";
let advancing = false;
let stepEngaged = false;

function sessionStorageKey() {
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
  const needsBanner = !NATIVE_FLOW_TYPES.has(currentStep()?.moduleType || "");
  els.stepFooter.hidden = !needsBanner;
  if (needsBanner) {
    els.stepContinue.disabled = advancing || !stepEngaged;
    els.stepContinue.textContent = advancing ? "Loading…" : nextStepButtonLabel();
  }
}

async function fetchExperience(): Promise<PublicExperience> {
  const q = new URLSearchParams({ slug });
  if (previewToken) q.set("previewToken", previewToken);
  const res = await fetch(`/api/public-experience?${q.toString()}`);
  if (!res.ok) throw new Error("Experience not found");
  const data = await res.json();
  return data.experience as PublicExperience;
}

async function createOrResumeSession(): Promise<Session> {
  const saved = loadSessionLocal();
  const body: Record<string, string> = { experienceSlug: slug };
  if (previewToken) body.previewToken = previewToken;
  if (saved?.sessionId) {
    body.sessionId = saved.sessionId;
    body.participantId = saved.participantId;
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
  const originRelative = appendFlowQuery(base, {
    sessionId: session.sessionId,
    experienceId: experience.id,
    nodeId: step.id,
    nextStepLabel: nextStepButtonLabel(),
  });
  if (originRelative.startsWith("http")) return originRelative;
  return `${window.location.origin}${originRelative}`;
}

function preloadNextStep() {
  if (!experience || !session) return;
  const nextIdx = session.currentStepIndex + 1;
  if (nextIdx >= experience.steps.length) {
    els.preload.removeAttribute("src");
    return;
  }
  const step = experience.steps[nextIdx];
  if (!step || step.missing || !step.moduleSlug) {
    els.preload.removeAttribute("src");
    return;
  }
  const url = stepFrameUrl(step);
  if (els.preload.getAttribute("src") !== url) {
    els.preload.src = url;
  }
}

function renderStep() {
  if (!experience || !session) return;

  if (session.completedAt || session.currentStepIndex >= experience.steps.length) {
    els.stage.hidden = true;
    els.loading.hidden = true;
    els.complete.hidden = false;
    els.completeActions.hidden = !previewToken;
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
  els.fallback.hidden = true;
  els.title.textContent = experience.title;
  els.progress.textContent = `Step ${session.currentStepIndex + 1} of ${experience.steps.length}`;

  if (step.missing || !step.moduleSlug) {
    els.fallback.hidden = false;
    els.stepFooter.hidden = true;
    els.fallbackMsg.textContent = `Component unavailable (${step.label}).`;
    els.frame.src = "about:blank";
    return;
  }

  loadAttempts = 0;
  els.frame.src = stepFrameUrl(step);
  updateShellContinue();
  preloadNextStep();

  track({
    type: "experience.step_start",
    gameId: step.moduleInstanceId,
    moduleId: step.moduleInstanceId,
    campaignId: experience.id,
    sessionId: session.sessionId,
    payload: { stepId: step.id, moduleType: step.moduleType },
  });
}

async function onStepComplete(outcomes: Record<string, unknown> = {}, fromShell = false) {
  if (!session || !experience || advancing) return;
  if (fromShell && !stepEngaged) return;

  advancing = true;
  updateShellContinue();

  const step = currentStep();
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
    if (isStepEngagedMessage(ev.data)) {
      if (ev.data.sessionId && session && ev.data.sessionId !== session.sessionId) return;
      stepEngaged = true;
      updateShellContinue();
      return;
    }
    if (!isStepCompleteMessage(ev.data)) return;
    if (ev.data.sessionId && session && ev.data.sessionId !== session.sessionId) return;
    void onStepComplete(ev.data.outcomes || {});
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

async function boot() {
  slug = getExperienceSlug();
  previewToken = getPreviewToken();
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
