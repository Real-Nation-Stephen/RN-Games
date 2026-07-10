/**
 * Experience flow runtime — parent/iframe coordination and session context.
 */

import {
  loadCourseContext,
  parseCourseContextFromSearch,
} from "./course-bridge.js";

export interface FlowContext {
  sessionId: string;
  experienceId: string;
  experienceSlug: string;
  nodeId: string;
  preview?: boolean;
}

export const FLOW_CTX_STORAGE_KEY = "rngames:flow";
export const FLOW_STEP_COMPLETE = "rngames:step_complete";
export const FLOW_STEP_ENGAGED = "rngames:step_engaged";
export const FLOW_EXPERIENCE_COMPLETE = "rngames:experience_complete";

export function parseFlowContextFromSearch(params: URLSearchParams): FlowContext | null {
  if (params.get("flow") !== "1") return null;
  const sessionId = params.get("sessionId")?.trim();
  const experienceId = params.get("experienceId")?.trim();
  const nodeId = params.get("nodeId")?.trim();
  if (!sessionId || !experienceId || !nodeId) return null;
  return {
    sessionId,
    experienceId,
    nodeId,
    experienceSlug: params.get("experienceSlug")?.trim() || "",
    preview: params.get("preview") === "1",
  };
}

export function saveFlowContext(ctx: FlowContext): void {
  try {
    sessionStorage.setItem(FLOW_CTX_STORAGE_KEY, JSON.stringify(ctx));
  } catch {
    /* ignore */
  }
}

export function loadFlowContext(): FlowContext | null {
  try {
    const raw = sessionStorage.getItem(FLOW_CTX_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as FlowContext;
  } catch {
    return null;
  }
}

export function clearFlowContext(): void {
  try {
    sessionStorage.removeItem(FLOW_CTX_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function isFlowMode(params?: URLSearchParams): boolean {
  const p = params ?? (typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null);
  return p?.get("flow") === "1";
}

export function emitStepEngaged(): void {
  if (typeof window === "undefined") return;
  const ctx = loadFlowContext() ?? parseFlowContextFromSearch(new URLSearchParams(window.location.search));
  const payload = {
    type: FLOW_STEP_ENGAGED,
    sessionId: ctx?.sessionId,
    experienceId: ctx?.experienceId,
    nodeId: ctx?.nodeId,
  };
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(payload, "*");
  }
  window.dispatchEvent(new CustomEvent(FLOW_STEP_ENGAGED, { detail: payload }));
}

export function emitStepComplete(outcomes: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  const ctx = loadFlowContext() ?? parseFlowContextFromSearch(new URLSearchParams(window.location.search));
  const courseCtx =
    loadCourseContext() ?? parseCourseContextFromSearch(new URLSearchParams(window.location.search));
  const payload = {
    type: FLOW_STEP_COMPLETE,
    sessionId: ctx?.sessionId,
    experienceId: ctx?.experienceId,
    nodeId: ctx?.nodeId,
    courseSessionId: courseCtx?.sessionId,
    courseItemId: courseCtx?.itemId,
    outcomes,
  };
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(payload, "*");
  }
  window.dispatchEvent(new CustomEvent(FLOW_STEP_COMPLETE, { detail: payload }));
}

export type StepCompleteMessage = {
  type: typeof FLOW_STEP_COMPLETE;
  sessionId?: string;
  experienceId?: string;
  nodeId?: string;
  courseSessionId?: string;
  courseItemId?: string;
  outcomes?: Record<string, unknown>;
};

export function isStepCompleteMessage(data: unknown): data is StepCompleteMessage {
  return (
    !!data &&
    typeof data === "object" &&
    (data as StepCompleteMessage).type === FLOW_STEP_COMPLETE
  );
}

export type StepEngagedMessage = {
  type: typeof FLOW_STEP_ENGAGED;
  sessionId?: string;
  experienceId?: string;
  nodeId?: string;
};

export function isStepEngagedMessage(data: unknown): data is StepEngagedMessage {
  return (
    !!data &&
    typeof data === "object" &&
    (data as StepEngagedMessage).type === FLOW_STEP_ENGAGED
  );
}

export type ExperienceCompleteMessage = {
  type: typeof FLOW_EXPERIENCE_COMPLETE;
  courseSessionId?: string;
  courseItemId?: string;
  outcomes?: Record<string, unknown>;
};

export function isExperienceCompleteMessage(data: unknown): data is ExperienceCompleteMessage {
  return (
    !!data &&
    typeof data === "object" &&
    (data as ExperienceCompleteMessage).type === FLOW_EXPERIENCE_COMPLETE
  );
}
