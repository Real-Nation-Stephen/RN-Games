/** Measurement normalizers for Netlify functions (mirrors @rngames/shared/measurement). */

export function defaultDeploymentMeasurement(foundation) {
  return {
    profileVersion: 1,
    collectionMode: "standard",
    excludePreviewTraffic: true,
    trackingEnabled: foundation?.trackingEnabled ?? true,
    requireConsentBeforeTrack: foundation?.requireConsentBeforeTrack ?? false,
    reporting: {
      enabled: foundation?.reportingEnabled ?? false,
      publicAggregateOnly: true,
      hiddenMetricIds: [],
      labelOverrides: {},
    },
    retention: {
      defaultDays: 365,
    },
  };
}

export function normalizeDeploymentMeasurement(raw, foundation) {
  const d = defaultDeploymentMeasurement(foundation);
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    profileVersion: Number(src.profileVersion) || d.profileVersion,
    collectionMode:
      src.collectionMode === "minimal" || src.collectionMode === "diagnostic"
        ? src.collectionMode
        : d.collectionMode,
    excludePreviewTraffic: src.excludePreviewTraffic !== false,
    trackingEnabled: src.trackingEnabled ?? d.trackingEnabled,
    requireConsentBeforeTrack: src.requireConsentBeforeTrack ?? d.requireConsentBeforeTrack,
    reporting: {
      enabled: src.reporting?.enabled ?? d.reporting.enabled,
      publicAggregateOnly: src.reporting?.publicAggregateOnly !== false,
      hiddenMetricIds: Array.isArray(src.reporting?.hiddenMetricIds)
        ? src.reporting.hiddenMetricIds.map(String)
        : d.reporting.hiddenMetricIds,
      labelOverrides:
        src.reporting?.labelOverrides && typeof src.reporting.labelOverrides === "object"
          ? { ...src.reporting.labelOverrides }
          : d.reporting.labelOverrides,
    },
    retention: {
      defaultDays:
        typeof src.retention?.defaultDays === "number" ? src.retention.defaultDays : d.retention.defaultDays,
    },
  };
}

export function deploymentIdFor(kind, recordId) {
  return `dep_${kind}_${String(recordId || "").trim()}`;
}
