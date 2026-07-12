const MANDATORY_STRING_FIELDS = [
  "eventId",
  "schemaVersion",
  "eventName",
  "occurredAt",
  "deploymentId",
  "deploymentContext",
  "componentType",
  "componentInstanceId",
  "sessionId",
];

export function canonicalEventName(raw) {
  const map = {
    "experience.step_start": "flow.step_started",
    "experience.step_complete": "flow.step_completed",
    "experience.complete": "flow.completed",
    "page.step_complete": "component.step_completed",
  };
  const name = String(raw || "").trim();
  if (!name) return "unknown.event";
  return map[name] || name;
}

export function eventCategoryFor(eventName) {
  if (eventName.startsWith("course.")) return "course";
  if (eventName.startsWith("flow.")) return "flow";
  if (eventName.startsWith("component.")) return "component";
  return String(eventName || "unknown").split(".")[0] || "component";
}

/** Normalise legacy or partial client payloads into canonical envelope. */
export function normaliseIncomingEvent(raw) {
  const src = raw && typeof raw === "object" ? { ...raw } : {};
  const legacyType = src.type || src.eventName;
  const eventName = canonicalEventName(legacyType);
  const componentInstanceId =
    src.componentInstanceId || src.gameId || src.moduleId || src.context?.componentInstanceId || "unknown";
  const componentType = src.componentType || src.context?.componentType || "unknown";
  const sessionId = src.sessionId || src.context?.flowSessionId || src.context?.courseSessionId || "";
  const occurredAt = src.occurredAt || src.timestamp || new Date().toISOString();
  const ctx = src.context && typeof src.context === "object" ? src.context : {};

  const deploymentId =
    src.deploymentId ||
    ctx.deploymentId ||
    (ctx.courseId
      ? `dep_course_${ctx.courseId}`
      : ctx.flowId
        ? `dep_flow_${ctx.flowId}`
        : `dep_component_${componentInstanceId}`);

  let deploymentContext =
    src.deploymentContext || ctx.deploymentContext || (ctx.courseId && ctx.flowId ? "course_flow" : "standalone");
  if (ctx.preview || src.preview) deploymentContext = "preview";
  else if (ctx.courseId && ctx.flowId) deploymentContext = "course_flow";
  else if (ctx.courseId) deploymentContext = "course";
  else if (ctx.flowId) deploymentContext = "flow";
  else if (!src.deploymentContext && !ctx.deploymentContext) deploymentContext = "standalone";

  const properties = {
    ...(src.payload && typeof src.payload === "object" ? src.payload : {}),
    ...(src.properties && typeof src.properties === "object" ? src.properties : {}),
  };

  return {
    eventId: String(src.eventId || "").trim(),
    eventVersion: Number(src.eventVersion) || 1,
    schemaVersion: String(src.schemaVersion || "1.0").trim(),
    eventName,
    eventCategory: src.eventCategory || eventCategoryFor(eventName),
    occurredAt,
    deploymentId: String(deploymentId).trim(),
    deploymentContext: String(deploymentContext).trim(),
    componentType: String(componentType).trim(),
    componentInstanceId: String(componentInstanceId).trim(),
    sessionId: String(sessionId).trim(),
    courseId: ctx.courseId || src.courseId || null,
    courseSessionId: ctx.courseSessionId || src.courseSessionId || null,
    courseItemId: ctx.courseItemId || src.courseItemId || null,
    flowId: ctx.flowId || src.flowId || src.campaignId || null,
    flowSessionId: ctx.flowSessionId || src.flowSessionId || src.sessionId || null,
    flowStepId: ctx.flowStepId || src.flowStepId || null,
    participantId: ctx.participantId || src.participantId || null,
    preview: !!(ctx.preview || src.preview),
    properties,
    privacy: src.privacy && typeof src.privacy === "object" ? src.privacy : {},
    rawEnvelope: src,
  };
}

export function validateMandatoryEvent(ev) {
  const missing = [];
  for (const field of MANDATORY_STRING_FIELDS) {
    if (!ev[field] || !String(ev[field]).trim()) missing.push(field);
  }
  if (!Number.isFinite(ev.eventVersion)) missing.push("eventVersion");
  if (missing.length) {
    return { ok: false, missing };
  }
  return { ok: true };
}
