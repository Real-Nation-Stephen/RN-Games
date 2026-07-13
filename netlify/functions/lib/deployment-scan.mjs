import {
  getCourseJson,
  getExperienceJson,
  getWheelJson,
} from "./blobs.mjs";
import { normalizeCourseRecord, flattenCourseItems } from "./course.mjs";
import { normalizeExperienceRecord, graphToLinearSteps } from "./experience.mjs";
import { normalizeDeploymentMeasurement } from "./measurement.mjs";
import { getComponentMetadata } from "./measurement-registry.mjs";
import { detectEnabledRegistryFieldIds } from "./field-detection.mjs";

function collectionAllowed(mode, dataClass) {
  if (mode === "diagnostic") return true;
  if (mode === "minimal") return dataClass === "anonymous" || dataClass === "operational";
  return dataClass !== "operational";
}

export function resolveEffectiveMeasurementJs(input) {
  const { deploymentKind, recordId, measurement, scannedComponents } = input;
  const deploymentId = `dep_${deploymentKind}_${recordId}`;
  const fields = [];
  const legacyExceptions = [];
  const explanations = [
    `Deployment collection mode is "${measurement.collectionMode}" — controls which data classes are collected by default.`,
  ];

  for (const instance of scannedComponents) {
    const meta = getComponentMetadata(instance.componentType);
    if (!meta) {
      explanations.push(
        `Component ${instance.componentType} (${instance.instanceId}) has no metadata contract — review required.`,
      );
      continue;
    }

    const enabledFieldIds = new Set(
      detectEnabledRegistryFieldIds({ componentType: instance.componentType, config: instance.config || {} }),
    );

    for (const field of meta.fields || []) {
      const enabled =
        enabledFieldIds.has(field.id) ||
        (field.id === "reportingEnabled" && instance.config?.reportingEnabled === true);
      const collect =
        enabled &&
        collectionAllowed(measurement.collectionMode, field.dataClass) &&
        measurement.trackingEnabled !== false;
      const report = collect && measurement.reporting?.enabled;
      const retain = collect && !!measurement.retention?.defaultDays;

      let reason = "Not enabled in component configuration.";
      if (enabled && !collect) reason = `Disabled by deployment collection mode (${measurement.collectionMode}).`;
      else if (enabled && collect && !report) reason = "Collected but hidden from reports by deployment settings.";
      else if (enabled && collect) reason = "Enabled in component config and allowed by deployment defaults.";

      fields.push({
        fieldId: field.id,
        componentType: instance.componentType,
        instanceId: instance.instanceId,
        title: instance.title,
        dataClass: field.dataClass,
        supported: true,
        collect,
        report,
        retain,
        reason,
      });
    }

    if (instance.config?.reportingEnabled === true && !measurement.reporting?.enabled) {
      legacyExceptions.push({
        componentType: instance.componentType,
        instanceId: instance.instanceId,
        title: instance.title,
        reason: "Legacy reportingEnabled differs from deployment reporting default (e.g. Sheets pipeline).",
        reportingEnabled: true,
      });
    }
  }

  return {
    deploymentId,
    collectionMode: measurement.collectionMode,
    fields,
    events: [],
    legacyExceptions,
    explanations,
  };
}

async function loadModuleInstance(moduleInstanceId, moduleType) {
  const config = await getWheelJson(moduleInstanceId);
  if (!config) return null;
  return {
    componentType: moduleType || config.gameType || "module",
    instanceId: moduleInstanceId,
    title: config.title || moduleType,
    config,
  };
}

async function scanExperienceSteps(experienceId, seen) {
  const raw = await getExperienceJson(experienceId);
  if (!raw) return [];
  const exp = normalizeExperienceRecord(raw);
  const steps = exp.linearSteps?.length ? exp.linearSteps : graphToLinearSteps(exp.graph);
  const out = [];
  for (const step of steps) {
    if (!step.moduleInstanceId) continue;
    const key = `${step.moduleType}:${step.moduleInstanceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const inst = await loadModuleInstance(step.moduleInstanceId, step.moduleType);
    if (inst) out.push(inst);
  }
  return out;
}

export async function scanDeployment(kind, recordId) {
  const seen = new Set();
  const components = [];

  if (kind === "course") {
    const raw = await getCourseJson(recordId);
    if (!raw) return null;
    const course = normalizeCourseRecord(raw);
    const items = flattenCourseItems(course.sections);
    for (const item of items) {
      if (item.kind === "module" && item.moduleInstanceId) {
        const key = `${item.moduleType}:${item.moduleInstanceId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const inst = await loadModuleInstance(item.moduleInstanceId, item.moduleType);
        if (inst) components.push(inst);
      }
      if (item.kind === "experience" && item.experienceId) {
        const nested = await scanExperienceSteps(item.experienceId, seen);
        components.push(...nested);
      }
    }
    return {
      kind: "course",
      recordId: course.id,
      title: course.title,
      slug: course.slug,
      measurement: normalizeDeploymentMeasurement(course.measurement),
      components,
    };
  }

  if (kind === "flow") {
    const raw = await getExperienceJson(recordId);
    if (!raw) return null;
    const exp = normalizeExperienceRecord(raw);
    const steps = exp.linearSteps?.length ? exp.linearSteps : graphToLinearSteps(exp.graph);
    for (const step of steps) {
      if (!step.moduleInstanceId) continue;
      const key = `${step.moduleType}:${step.moduleInstanceId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const inst = await loadModuleInstance(step.moduleInstanceId, step.moduleType);
      if (inst) components.push(inst);
    }
    return {
      kind: "flow",
      recordId: exp.id,
      title: exp.title,
      slug: exp.slug,
      measurement: normalizeDeploymentMeasurement(exp.measurement, exp.foundation),
      components,
    };
  }

  if (kind === "component") {
    const config = await getWheelJson(recordId);
    if (!config) return null;
    components.push({
      componentType: config.gameType || "module",
      instanceId: recordId,
      title: config.title,
      config,
    });
    return {
      kind: "component",
      recordId,
      title: config.title,
      slug: config.slug,
      measurement: normalizeDeploymentMeasurement(undefined, {
        reportingEnabled: config?.reportingEnabled,
      }),
      components,
    };
  }

  return null;
}
