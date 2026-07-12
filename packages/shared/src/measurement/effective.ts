import { getComponentMetadata } from "./registry.js";
import { deploymentIdFor } from "./deployment.js";
import type {
  DeploymentMeasurement,
  EffectiveFieldState,
  EffectiveMeasurementProfile,
  LegacyMeasurementException,
  ScannedComponentInstance,
} from "./types.js";

function detectFormFields(config: Record<string, unknown>): string[] {
  const fields = config.fields;
  if (!Array.isArray(fields)) return [];
  return fields
    .map((f) => (f && typeof f === "object" ? String((f as { id?: string }).id || "") : ""))
    .filter(Boolean);
}

function detectEnabledFields(instance: ScannedComponentInstance): string[] {
  const { componentType, config } = instance;
  if (componentType === "form" || componentType === "email-signup") {
    return detectFormFields(config);
  }
  if (config.reportingEnabled === true) return ["reportingEnabled"];
  return [];
}

function collectionAllowed(mode: DeploymentMeasurement["collectionMode"], dataClass: string): boolean {
  if (mode === "diagnostic") return true;
  if (mode === "minimal") return dataClass === "anonymous" || dataClass === "operational";
  return dataClass !== "operational";
}

/**
 * Compute effective measurement from deployment defaults + scanned component configs.
 * Component enabled features/fields are inputs — not a second editable profile.
 */
export function resolveEffectiveMeasurement(input: {
  deploymentKind: "course" | "flow" | "component";
  recordId: string;
  measurement: DeploymentMeasurement;
  scannedComponents: ScannedComponentInstance[];
}): EffectiveMeasurementProfile {
  const deploymentId = deploymentIdFor(input.deploymentKind, input.recordId);
  const { measurement, scannedComponents } = input;
  const fields: EffectiveFieldState[] = [];
  const events = new Set<string>();
  const legacyExceptions: LegacyMeasurementException[] = [];
  const explanations: string[] = [];

  explanations.push(
    `Deployment collection mode is "${measurement.collectionMode}" — controls which data classes are collected by default.`,
  );

  for (const instance of scannedComponents) {
    const meta = getComponentMetadata(instance.componentType);
    if (!meta) {
      explanations.push(
        `Component ${instance.componentType} (${instance.instanceId}) has no metadata contract — review required.`,
      );
      continue;
    }

    for (const ev of meta.lifecycleEvents) events.add(ev.eventName);

    const enabledFieldIds = new Set(detectEnabledFields(instance));

    for (const field of meta.fields) {
      const enabled =
        enabledFieldIds.has(field.id) ||
        (field.id === "reportingEnabled" && instance.config.reportingEnabled === true);
      const collect =
        enabled &&
        collectionAllowed(measurement.collectionMode, field.dataClass) &&
        measurement.trackingEnabled !== false;
      const report = collect && field.defaultReport && measurement.reporting.enabled;
      const retain = collect && !!measurement.retention.defaultDays;

      let reason = "Not enabled in component configuration.";
      if (enabled && !collect) reason = `Disabled by deployment collection mode (${measurement.collectionMode}).`;
      else if (enabled && collect && !report) reason = "Collected but hidden from reports by deployment settings.";
      else if (enabled && collect) reason = "Enabled in component config and allowed by deployment defaults.";

      fields.push({
        fieldId: field.id,
        componentType: instance.componentType,
        instanceId: instance.instanceId,
        dataClass: field.dataClass,
        supported: true,
        collect,
        report,
        retain,
        reason,
      });
    }

    if (instance.config.reportingEnabled === true && !measurement.reporting.enabled) {
      legacyExceptions.push({
        componentType: instance.componentType,
        instanceId: instance.instanceId,
        reason: "Legacy reportingEnabled differs from deployment reporting default (e.g. Sheets pipeline).",
        reportingEnabled: true,
      });
    }
  }

  return {
    deploymentId,
    collectionMode: measurement.collectionMode,
    fields,
    events: [...events],
    legacyExceptions,
    explanations,
  };
}
