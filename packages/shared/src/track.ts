/**
 * Canonical measurement event client.
 * Posts to `/api/track` with mandatory envelope fields.
 */
import { loadFlowContext, parseFlowContextFromSearch } from "./flow-bridge.js";
import { resolveCourseContext } from "./course-bridge.js";
import {
  MEASUREMENT_EVENT_VERSION,
  MEASUREMENT_SCHEMA_VERSION,
  canonicalEventName,
  eventCategoryFor,
  resolveDeploymentScope,
} from "./measurement/index.js";

const MEASUREMENT_SESSION_KEY = "rngames:measurement-session";

export interface TrackEventContext {
  deploymentId: string;
  deploymentContext: string;
  courseId?: string;
  courseSessionId?: string;
  courseItemId?: string;
  courseSlug?: string;
  flowId?: string;
  flowSessionId?: string;
  flowStepId?: string;
  componentType: string;
  componentInstanceId: string;
  participantId?: string;
  preview?: boolean;
}

export interface CanonicalTrackEvent {
  eventId: string;
  eventVersion: number;
  schemaVersion: string;
  eventName: string;
  eventCategory: string;
  occurredAt: string;
  deploymentId: string;
  deploymentContext: string;
  componentType: string;
  componentInstanceId: string;
  sessionId: string;
  context: TrackEventContext;
  properties?: Record<string, unknown>;
  privacy?: { dataClasses?: string[] };
  /** Legacy compat — mirrored in Blob ingest */
  type?: string;
  gameId?: string;
  moduleId?: string;
  campaignId?: string;
  timestamp?: string;
  payload?: Record<string, unknown>;
}

export type TrackEventInput = {
  eventId?: string;
  eventName?: string;
  /** Legacy event name */
  type?: string;
  componentType?: string;
  componentInstanceId?: string;
  gameId?: string;
  moduleId?: string;
  campaignId?: string;
  sessionId?: string;
  occurredAt?: string;
  timestamp?: string;
  flowStepId?: string;
  participantId?: string;
  properties?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  privacy?: { dataClasses?: string[] };
};

function newEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function isPreviewMode(): boolean {
  if (typeof window === "undefined") return false;
  return !!new URLSearchParams(window.location.search).get("previewToken");
}

function getOrCreateMeasurementSessionId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = sessionStorage.getItem(MEASUREMENT_SESSION_KEY);
    if (existing) return existing;
    const id = newEventId();
    sessionStorage.setItem(MEASUREMENT_SESSION_KEY, id);
    return id;
  } catch {
    return newEventId();
  }
}

function resolveFlowIds(): {
  sessionId?: string;
  experienceId?: string;
  nodeId?: string;
} {
  if (typeof window === "undefined") return {};
  const fromUrl = parseFlowContextFromSearch(new URLSearchParams(window.location.search));
  const ctx = fromUrl ?? loadFlowContext();
  if (!ctx) return {};
  return {
    sessionId: ctx.sessionId,
    experienceId: ctx.experienceId,
    nodeId: ctx.nodeId,
  };
}

function inferComponentType(gameId?: string): string {
  if (typeof window === "undefined") return "unknown";
  const path = window.location.pathname.toLowerCase();
  if (path.includes("/course/")) return "course";
  if (path.includes("/x/") || path.includes("/play/experience")) return "flow";
  const seg = path.split("/").filter(Boolean);
  const slug = seg[seg.length - 1] || "";
  const known = [
    "landing",
    "form",
    "certificate",
    "badge",
    "runner",
    "catch",
    "leaderboard",
    "quiz",
    "scratcher",
    "flip-cards",
    "pinboard",
    "email-signup",
    "redemption",
    "mini-quiz",
  ];
  for (const k of known) {
    if (path.includes(`/${k}/`) || path.includes(`/${k}`)) return k;
  }
  if (slug && !["play", "admin", "report"].includes(slug)) return "component";
  return "unknown";
}

function buildCanonicalEvent(input: TrackEventInput): CanonicalTrackEvent {
  const flow = resolveFlowIds();
  const course = resolveCourseContext();
  const preview = isPreviewMode();
  const rawName = input.eventName || input.type || "unknown.event";
  const eventName = canonicalEventName(rawName);
  const componentInstanceId =
    input.componentInstanceId || input.gameId || input.moduleId || flow.experienceId || course?.courseId || "unknown";
  const componentType = input.componentType || inferComponentType(componentInstanceId);
  const sessionId =
    input.sessionId ||
    flow.sessionId ||
    course?.sessionId ||
    getOrCreateMeasurementSessionId();

  const scope = resolveDeploymentScope({
    courseId: course?.courseId,
    experienceId: flow.experienceId || input.campaignId,
    componentInstanceId,
    preview,
  });

  const properties = {
    ...(input.payload && typeof input.payload === "object" ? input.payload : {}),
    ...(input.properties && typeof input.properties === "object" ? input.properties : {}),
  };

  const occurredAt = input.occurredAt || input.timestamp || new Date().toISOString();

  const context: TrackEventContext = {
    deploymentId: scope.deploymentId,
    deploymentContext: scope.deploymentContext,
    componentType,
    componentInstanceId,
    preview,
    courseId: course?.courseId,
    courseSessionId: course?.sessionId,
    courseItemId: course?.itemId,
    courseSlug: course?.courseSlug,
    flowId: flow.experienceId || input.campaignId,
    flowSessionId: flow.sessionId || input.sessionId,
    flowStepId: input.flowStepId || flow.nodeId,
    participantId: input.participantId,
  };

  return {
    eventId: input.eventId || newEventId(),
    eventVersion: MEASUREMENT_EVENT_VERSION,
    schemaVersion: MEASUREMENT_SCHEMA_VERSION,
    eventName,
    eventCategory: eventCategoryFor(eventName),
    occurredAt,
    deploymentId: scope.deploymentId,
    deploymentContext: scope.deploymentContext,
    componentType,
    componentInstanceId,
    sessionId,
    context,
    properties: Object.keys(properties).length ? properties : undefined,
    privacy: input.privacy,
    type: rawName,
    gameId: input.gameId || componentInstanceId,
    moduleId: input.moduleId,
    campaignId: flow.experienceId || input.campaignId,
    timestamp: occurredAt,
    payload: properties,
  };
}

/** @deprecated Use CanonicalTrackEvent — kept for gradual migration */
export interface TrackEvent {
  type: string;
  gameId: string;
  moduleId?: string;
  campaignId?: string;
  sessionId?: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

export function track(event: TrackEventInput): void {
  const record = buildCanonicalEvent(event);
  if (typeof fetch === "undefined") return;
  void fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
    keepalive: true,
  }).catch(() => {});
}

export { buildCanonicalEvent };
