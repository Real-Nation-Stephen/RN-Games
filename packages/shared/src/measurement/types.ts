/** Measurement layer types — shared by Tracking, Reporting and Compliance. */

export type DeploymentContext =
  | "standalone"
  | "flow"
  | "course"
  | "course_flow"
  | "preview";

export type DataClass =
  | "anonymous"
  | "pseudonymous"
  | "personal"
  | "behavioural"
  | "operational";

export type CollectionMode = "minimal" | "standard" | "diagnostic";

export type CollectionState = "supported" | "collect" | "report" | "retain";

export interface DeploymentReportingConfig {
  enabled: boolean;
  publicAggregateOnly: boolean;
  hiddenMetricIds?: string[];
  labelOverrides?: Record<string, string>;
}

export interface DeploymentRetentionConfig {
  defaultDays?: number;
}

/**
 * Single editable measurement block per deployment.
 * Component-specific enabled features feed the computed effective profile.
 */
export interface DeploymentMeasurement {
  profileVersion: number;
  collectionMode: CollectionMode;
  excludePreviewTraffic: boolean;
  reporting: DeploymentReportingConfig;
  retention: DeploymentRetentionConfig;
  trackingEnabled?: boolean;
  requireConsentBeforeTrack?: boolean;
}

export interface ComponentFieldMeta {
  id: string;
  label: string;
  dataClass: DataClass;
  defaultCollect: boolean;
  defaultReport: boolean;
}

export interface ComponentEventMeta {
  eventName: string;
  category: string;
  description?: string;
}

export interface ComponentMetadataContract {
  componentType: string;
  label: string;
  supportedContexts: DeploymentContext[];
  lifecycleEvents: ComponentEventMeta[];
  fields: ComponentFieldMeta[];
  implementationVersion: string;
}

export interface ScannedComponentInstance {
  componentType: string;
  instanceId: string;
  title?: string;
  config: Record<string, unknown>;
}

export interface EffectiveFieldState {
  fieldId: string;
  componentType: string;
  instanceId: string;
  dataClass: DataClass;
  supported: boolean;
  collect: boolean;
  report: boolean;
  retain: boolean;
  reason: string;
}

export interface LegacyMeasurementException {
  componentType: string;
  instanceId: string;
  title?: string;
  reason: string;
  reportingEnabled?: boolean;
}

export interface EffectiveMeasurementProfile {
  deploymentId: string;
  collectionMode: CollectionMode;
  fields: EffectiveFieldState[];
  events: string[];
  legacyExceptions: LegacyMeasurementException[];
  explanations: string[];
}

export const MEASUREMENT_SCHEMA_VERSION = "1.0";
export const MEASUREMENT_EVENT_VERSION = 1;
