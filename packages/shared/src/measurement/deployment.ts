import type { DeploymentContext, DeploymentMeasurement } from "./types.js";

export type DeploymentKind = "course" | "flow" | "component";

export function deploymentIdFor(kind: DeploymentKind, recordId: string): string {
  const id = String(recordId || "").trim();
  return `dep_${kind}_${id}`;
}

export function parseDeploymentId(deploymentId: string): { kind: DeploymentKind; recordId: string } | null {
  const m = /^dep_(course|flow|component)_(.+)$/.exec(String(deploymentId || "").trim());
  if (!m) return null;
  return { kind: m[1] as DeploymentKind, recordId: m[2] };
}

export function defaultDeploymentMeasurement(): DeploymentMeasurement {
  return {
    profileVersion: 1,
    collectionMode: "standard",
    excludePreviewTraffic: true,
    trackingEnabled: true,
    requireConsentBeforeTrack: false,
    reporting: {
      enabled: false,
      publicAggregateOnly: true,
      hiddenMetricIds: [],
      labelOverrides: {},
    },
    retention: {
      defaultDays: 365,
    },
  };
}

export function normalizeDeploymentMeasurement(
  raw: Partial<DeploymentMeasurement> | undefined,
  foundation?: {
    trackingEnabled?: boolean;
    reportingEnabled?: boolean;
    requireConsentBeforeTrack?: boolean;
  },
): DeploymentMeasurement {
  const d = defaultDeploymentMeasurement();
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    profileVersion: Number(src.profileVersion) || d.profileVersion,
    collectionMode:
      src.collectionMode === "minimal" || src.collectionMode === "diagnostic"
        ? src.collectionMode
        : d.collectionMode,
    excludePreviewTraffic: src.excludePreviewTraffic !== false,
    trackingEnabled:
      src.trackingEnabled ?? foundation?.trackingEnabled ?? d.trackingEnabled,
    requireConsentBeforeTrack:
      src.requireConsentBeforeTrack ??
      foundation?.requireConsentBeforeTrack ??
      d.requireConsentBeforeTrack,
    reporting: {
      enabled: src.reporting?.enabled ?? foundation?.reportingEnabled ?? d.reporting.enabled,
      publicAggregateOnly: src.reporting?.publicAggregateOnly !== false,
      hiddenMetricIds: Array.isArray(src.reporting?.hiddenMetricIds)
        ? src.reporting.hiddenMetricIds.map(String)
        : [...(d.reporting.hiddenMetricIds || [])],
      labelOverrides:
        src.reporting?.labelOverrides && typeof src.reporting.labelOverrides === "object"
          ? { ...src.reporting.labelOverrides }
          : { ...(d.reporting.labelOverrides || {}) },
    },
    retention: {
      defaultDays:
        typeof src.retention?.defaultDays === "number"
          ? src.retention.defaultDays
          : d.retention.defaultDays,
    },
  };
}

export function resolveDeploymentScope(input: {
  courseId?: string;
  experienceId?: string;
  componentInstanceId?: string;
  preview?: boolean;
}): { deploymentId: string; deploymentContext: DeploymentContext } {
  const preview = !!input.preview;
  if (input.courseId && input.experienceId) {
    return {
      deploymentId: deploymentIdFor("course", input.courseId),
      deploymentContext: preview ? "preview" : "course_flow",
    };
  }
  if (input.courseId) {
    return {
      deploymentId: deploymentIdFor("course", input.courseId),
      deploymentContext: preview ? "preview" : "course",
    };
  }
  if (input.experienceId) {
    return {
      deploymentId: deploymentIdFor("flow", input.experienceId),
      deploymentContext: preview ? "preview" : "flow",
    };
  }
  const instanceId = input.componentInstanceId || "unknown";
  return {
    deploymentId: deploymentIdFor("component", instanceId),
    deploymentContext: preview ? "preview" : "standalone",
  };
}
