/** Experience normalizers — mirrors @rngames/shared/experience-record (JS for Netlify functions). */

export function defaultExperienceFoundation() {
  return {
    trackingEnabled: true,
    reportingEnabled: false,
    requireConsentBeforeTrack: false,
    sessionTtlMinutes: 0,
    navigation: { backButton: "one_way", nextStepButtonLabel: "Next Activity" },
  };
}

export function graphToLinearSteps(graph) {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const moduleById = new Map(nodes.filter((n) => n.kind === "module").map((n) => [n.id, n]));
  const out = new Map();
  for (const e of edges) {
    if (!out.has(e.sourceNodeId)) out.set(e.sourceNodeId, e.targetNodeId);
  }
  const steps = [];
  let cursor = graph.entryNodeId || "entry";
  const seen = new Set();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const next = out.get(cursor);
    if (!next) break;
    const mod = moduleById.get(next);
    if (mod) {
      steps.push({
        id: mod.id,
        moduleInstanceId: mod.moduleInstanceId,
        moduleType: mod.moduleType,
        label: mod.label,
        overrides: mod.overrides,
      });
    }
    cursor = next;
  }
  return steps;
}

export function linearStepsToGraph(steps) {
  const nodes = [];
  const edges = [];
  const entryId = "entry";
  nodes.push({ kind: "control", id: entryId, controlType: "entry", position: { x: 0, y: 0 } });

  let prevId = entryId;
  steps.forEach((step, i) => {
    const nodeId = step.id || `step-${i}`;
    nodes.push({
      kind: "module",
      id: nodeId,
      position: { x: 0, y: (i + 1) * 100 },
      moduleInstanceId: step.moduleInstanceId,
      moduleType: step.moduleType,
      label: step.label,
      overrides: step.overrides,
    });
    edges.push({ id: `e-${prevId}-${nodeId}`, sourceNodeId: prevId, targetNodeId: nodeId });
    prevId = nodeId;
  });

  const exitId = "exit";
  nodes.push({ kind: "control", id: exitId, controlType: "exit", position: { x: 0, y: (steps.length + 1) * 100 } });
  edges.push({ id: `e-${prevId}-${exitId}`, sourceNodeId: prevId, targetNodeId: exitId });

  return { nodes, edges, entryNodeId: entryId };
}

export function emptyExperienceRecord(id, slug, previewToken) {
  const linearSteps = [];
  return {
    id,
    slug,
    title: "Untitled experience",
    clientName: "",
    projectCode: "",
    designCode: "",
    status: "draft",
    updatedAt: new Date().toISOString(),
    publishedAt: null,
    thumbnailUrl: "",
    previewToken,
    linearSteps,
    graph: linearStepsToGraph(linearSteps),
    metadata: {},
    foundation: defaultExperienceFoundation(),
    templateId: null,
    archived: false,
  };
}

export function normalizeExperienceRecord(doc) {
  const linearSteps = Array.isArray(doc.linearSteps)
    ? doc.linearSteps.map((s, i) => ({
        id: String(s.id || `step-${i}`),
        moduleInstanceId: String(s.moduleInstanceId || ""),
        moduleType: String(s.moduleType || ""),
        label: s.label ? String(s.label) : undefined,
        overrides: s.overrides && typeof s.overrides === "object" ? s.overrides : undefined,
      }))
    : [];

  const graph =
    doc.graph && Array.isArray(doc.graph.nodes) && doc.graph.nodes.length > 0
      ? doc.graph
      : linearStepsToGraph(linearSteps);

  return {
    id: doc.id,
    slug: String(doc.slug || "").trim().toLowerCase(),
    title: String(doc.title || "Untitled experience"),
    clientName: String(doc.clientName || ""),
    projectCode: String(doc.projectCode || ""),
    designCode: String(doc.designCode || ""),
    status: doc.status === "published" || doc.status === "archived" ? doc.status : "draft",
    updatedAt: doc.updatedAt || new Date().toISOString(),
    publishedAt: doc.publishedAt ?? null,
    thumbnailUrl: String(doc.thumbnailUrl || ""),
    previewToken: String(doc.previewToken || ""),
    linearSteps,
    graph,
    metadata: doc.metadata && typeof doc.metadata === "object" ? doc.metadata : {},
    foundation: {
      ...defaultExperienceFoundation(),
      ...(doc.foundation && typeof doc.foundation === "object" ? doc.foundation : {}),
      navigation: {
        ...defaultExperienceFoundation().navigation,
        ...(doc.foundation?.navigation && typeof doc.foundation.navigation === "object"
          ? doc.foundation.navigation
          : {}),
      },
    },
    templateId: doc.templateId ?? null,
    archived: !!doc.archived,
  };
}

const MODULE_NODE_TYPES = new Set([
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
  "badge",
  "consent",
  "email-signup",
  "redemption",
  "mini-quiz",
]);

export function resolvePublishedSteps(experience, moduleById) {
  return (experience.linearSteps || [])
    .filter((s) => s.moduleInstanceId && MODULE_NODE_TYPES.has(s.moduleType))
    .map((step) => {
      const mod = moduleById.get(step.moduleInstanceId);
      return {
        id: step.id,
        moduleInstanceId: step.moduleInstanceId,
        moduleType: step.moduleType,
        label: step.label || mod?.title || step.moduleType,
        moduleSlug: mod?.slug || "",
        moduleTitle: mod?.title || "",
        missing: !mod,
        archived: !!mod?.archived,
        overrides: step.overrides || undefined,
      };
    });
}

export function toPublicExperience(experience, steps) {
  return {
    id: experience.id,
    slug: experience.slug,
    title: experience.title,
    status: experience.status,
    foundation: {
      trackingEnabled: !!experience.foundation?.trackingEnabled,
      navigation: {
        backButton: experience.foundation?.navigation?.backButton || "one_way",
        nextStepButtonLabel:
          experience.foundation?.navigation?.nextStepButtonLabel?.trim() || "Next Activity",
      },
      kiosk: experience.foundation?.kiosk || null,
    },
    steps,
    stepCount: steps.length,
  };
}

export function toExperienceIndexEntry(doc) {
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
    stepCount: Array.isArray(doc.linearSteps) ? doc.linearSteps.length : 0,
    archived: !!doc.archived,
  };
}

export function componentPublicPath(moduleType, slug) {
  const t = (moduleType || "spinning-wheel").trim() || "spinning-wheel";
  switch (t) {
    case "catch":
      return `/catch/${encodeURIComponent(slug)}`;
    case "runner":
      return `/runner/${encodeURIComponent(slug)}`;
    case "leaderboard":
      return `/leaderboard/${encodeURIComponent(slug)}`;
    case "pinboard":
      return `/pinboard/${encodeURIComponent(slug)}`;
    case "quiz":
      return `/quiz/${encodeURIComponent(slug)}/kiosk`;
    case "scratcher":
      return `/play/scratcher.html?slug=${encodeURIComponent(slug)}`;
    case "flip-cards":
      return `/play/flip-cards.html?slug=${encodeURIComponent(slug)}`;
    case "landing":
      return `/landing/${encodeURIComponent(slug)}`;
    case "form":
      return `/form/${encodeURIComponent(slug)}`;
    case "certificate":
      return `/certificate/${encodeURIComponent(slug)}`;
    case "badge":
      return `/badge/${encodeURIComponent(slug)}`;
    case "consent":
      return `/consent/${encodeURIComponent(slug)}`;
    case "email-signup":
      return `/email-signup/${encodeURIComponent(slug)}`;
    case "redemption":
      return `/redemption/${encodeURIComponent(slug)}`;
    case "mini-quiz":
      return `/mini-quiz/${encodeURIComponent(slug)}`;
    default:
      return `/${encodeURIComponent(slug)}`;
  }
}
