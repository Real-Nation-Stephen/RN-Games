/**
 * Experience record — persisted shape (Wave 1).
 */
import type {
  ExperienceFoundation,
  ExperienceGraph,
  ExperienceMetadata,
  ExperienceStatus,
} from "./experience.js";

export interface ExperienceLinearStep {
  id: string;
  moduleInstanceId: string;
  moduleType: string;
  label?: string;
}

export interface ExperienceRecord {
  id: string;
  slug: string;
  title: string;
  clientName: string;
  projectCode: string;
  designCode: string;
  status: ExperienceStatus;
  updatedAt: string;
  publishedAt?: string | null;
  thumbnailUrl?: string;
  /** Secret token for draft preview links */
  previewToken: string;
  /** Wave 1 editor — ordered steps; graph derived on save */
  linearSteps: ExperienceLinearStep[];
  graph: ExperienceGraph;
  metadata: ExperienceMetadata;
  foundation: ExperienceFoundation;
  templateId?: string | null;
  archived?: boolean;
}

/** Build a linear graph from ordered steps (Wave 1 editor). */
export function linearStepsToGraph(steps: ExperienceLinearStep[]): ExperienceGraph {
  const nodes: ExperienceGraph["nodes"] = [];
  const edges: ExperienceGraph["edges"] = [];

  const entryId = "entry";
  nodes.push({
    kind: "control",
    id: entryId,
    controlType: "entry",
    position: { x: 0, y: 0 },
  });

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
    });
    edges.push({
      id: `e-${prevId}-${nodeId}`,
      sourceNodeId: prevId,
      targetNodeId: nodeId,
    });
    prevId = nodeId;
  });

  const exitId = "exit";
  nodes.push({
    kind: "control",
    id: exitId,
    controlType: "exit",
    position: { x: 0, y: (steps.length + 1) * 100 },
  });
  edges.push({
    id: `e-${prevId}-${exitId}`,
    sourceNodeId: prevId,
    targetNodeId: exitId,
  });

  return { nodes, edges, entryNodeId: entryId };
}

export function defaultExperienceFoundation(): ExperienceFoundation {
  return {
    trackingEnabled: true,
    reportingEnabled: false,
    requireConsentBeforeTrack: false,
    sessionTtlMinutes: 0,
    navigation: { backButton: "one_way" },
  };
}

export function emptyExperience(id: string, slug: string, previewToken: string): ExperienceRecord {
  const linearSteps: ExperienceLinearStep[] = [];
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

export function normalizeExperience(
  doc: Partial<ExperienceRecord> & { id: string; slug: string },
): ExperienceRecord {
  const linearSteps = Array.isArray(doc.linearSteps)
    ? doc.linearSteps.map((s, i) => ({
        id: String(s.id || `step-${i}`),
        moduleInstanceId: String(s.moduleInstanceId || ""),
        moduleType: String(s.moduleType || ""),
        label: s.label ? String(s.label) : undefined,
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
