/**
 * Experience platform types — design draft (Wave 1+).
 * Not wired to API or player runtime yet; stable contracts for planning and implementation.
 */

// ---------------------------------------------------------------------------
// Module capability registry (declares what each module type can emit / accept)
// ---------------------------------------------------------------------------

/** Semantic outcome keys a module may write into session context on completion. */
export type ModuleOutcomeKey =
  | "completed"
  | "abandoned"
  | "displayName"
  | "email"
  | "consentGranted"
  | "wheel.segmentId"
  | "wheel.segmentLabel"
  | "wheel.isWin"
  | "scratcher.revealed"
  | "flipCards.matched"
  | "quiz.score"
  | "quiz.scorePercent"
  | "quiz.correctCount"
  | "catch.score"
  | "runner.score"
  | "runner.distance"
  | "runner.timeSurvived"
  | "leaderboard.rank"
  | "form.fieldValues"
  | "custom";

export type ModuleOutcomeValue =
  | string
  | number
  | boolean
  | null
  | Record<string, unknown>
  | unknown[];

/** One port on a control node or module — used for validation and aggregator UI. */
export interface ModulePort {
  id: string;
  label: string;
  /** JSON-path into SessionContext.outcomes, e.g. "wheel.isWin" */
  outcomeKey?: ModuleOutcomeKey | string;
  valueType: "boolean" | "number" | "string" | "enum" | "object";
  enumValues?: string[];
}

export type ModuleCategory =
  | "foundation"
  | "experience"
  | "data-collection"
  | "game"
  | "competition"
  | "outcome"
  | "conversion"
  | "reporting"
  | "control-flow";

export interface ModuleTypeDefinition {
  /** Matches gameType on module instances, or control-flow id e.g. "router" */
  typeId: string;
  category: ModuleCategory;
  label: string;
  /** Shipped | planned | deprecated */
  status: "shipped" | "planned" | "deprecated";
  /** Can appear as a module-reference node in an experience graph */
  participantFacing: boolean;
  /** Keys this module may write when the user completes the step */
  outputs: ModulePort[];
  /** Keys the module may read from session (e.g. pre-filled name) */
  inputs?: ModulePort[];
  /** Legacy standalone public URL still works when not in a flow */
  standalonePlayable: boolean;
}

// ---------------------------------------------------------------------------
// Experience graph
// ---------------------------------------------------------------------------

export type FlowNodeKind = "module" | "control";

export type ControlNodeType =
  | "entry"
  | "exit"
  /** Unified routing — rules, time conditions, merge, loops (locked Jul 2026) */
  | "logic"
  | "join"
  | "delay"
  | "redirect";

/** In-flow overrides — component layout unchanged; behaviour/labels adjusted per experience node. */
export interface ExperienceNodeOverrides {
  completionBehaviour?: "auto_continue" | "show_continue" | "replay" | "custom";
  endScreen?: {
    headline?: string;
    body?: string;
    hidePlayAgain?: boolean;
    primaryCtaLabel?: string;
    secondaryCtaLabel?: string;
  };
  leaderboard?: {
    mode?: "player_rank" | "top10" | "projector";
    autoContinue?: boolean;
  };
}

/** Reference to a configured module instance (wheel:{uuid} blob today). */
export interface ModuleRefNode {
  kind: "module";
  id: string;
  position: { x: number; y: number };
  moduleInstanceId: string;
  moduleType: string;
  label?: string;
  overrides?: ExperienceNodeOverrides;
}

export type RouterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "truthy"
  | "before"
  | "after"
  | "between";

export interface LogicRule {
  id: string;
  label?: string;
  /** Session path, e.g. outcomes["wheel.isWin"] or event window */
  source: string;
  operator: RouterOperator;
  value?: string | number | boolean | string[];
  targetNodeId: string;
}

export interface ControlRefNode {
  kind: "control";
  id: string;
  position: { x: number; y: number };
  controlType: ControlNodeType;
  label?: string;
  /** logic node — conditional routes */
  rules?: LogicRule[];
  delayMs?: number;
  redirectUrl?: string;
  /** Required on logic nodes when rules may not match */
  defaultTargetNodeId?: string;
}

export type FlowNode = ModuleRefNode | ControlRefNode;

export interface FlowEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  /** Optional port id on source (e.g. "win", "lose", "default") */
  sourcePortId?: string;
  label?: string;
}

export interface ExperienceGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** Must point to a control entry or first module node */
  entryNodeId: string;
}

// ---------------------------------------------------------------------------
// Experience (campaign assembly) record
// ---------------------------------------------------------------------------

export type ExperienceStatus = "draft" | "published" | "archived";

/** Lightweight experience metadata — visual branding lives on components (locked Jul 2026). */
export interface ExperienceMetadata {
  faviconUrl?: string;
  notes?: string;
}

export interface ExperienceNavigation {
  backButton: "free" | "one_way" | "blocked";
  fallbackNodeId?: string;
  /** In-flow continue label on module end screens (e.g. flip-cards, wheel). */
  nextStepButtonLabel?: string;
}

export interface ExperienceKiosk {
  idleTimeoutMs: number;
  idleDestinationNodeId?: string;
}

export interface ExperienceFoundation {
  trackingEnabled: boolean;
  reportingEnabled: boolean;
  requireConsentBeforeTrack: boolean;
  sessionTtlMinutes: number;
  navigation: ExperienceNavigation;
  kiosk?: ExperienceKiosk;
}

// ---------------------------------------------------------------------------
// Runtime session
// ---------------------------------------------------------------------------

export interface SessionIdentity {
  displayName?: string;
  email?: string;
  externalId?: string;
  /** Pseudonymous first-party id */
  participantId: string;
}

export interface SessionProgress {
  experienceId: string;
  experienceSlug: string;
  currentNodeId: string;
  /** Ordered list of visited node ids */
  history: string[];
  startedAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

/** Flat map of module outcome keys → latest value for this session */
export type SessionOutcomes = Record<string, ModuleOutcomeValue>;

export interface SessionContext {
  sessionId: string;
  experienceId: string;
  identity: SessionIdentity;
  progress: SessionProgress;
  outcomes: SessionOutcomes;
  /** Consent flags, custom form fields, etc. */
  data: Record<string, unknown>;
  /** Module instance id → last completion payload */
  moduleSnapshots: Record<string, Record<string, unknown>>;
  /** Rollup for leagues / aggregate scoring (Wave 5+) */
  experienceSummary?: {
    bestScores: Record<string, number>;
    completedNodeIds: string[];
  };
}

// ---------------------------------------------------------------------------
// Index row (Studio list / search) — extends wheels-index pattern
// ---------------------------------------------------------------------------

export interface ModuleIndexRow {
  id: string;
  gameType: string;
  slug: string;
  title: string;
  clientName: string;
  projectCode: string;
  designCode: string;
  updatedAt: string;
  reportingEnabled: boolean;
  thumbnailUrl?: string;
}

export interface ExperienceIndexRow {
  id: string;
  slug: string;
  title: string;
  clientName: string;
  projectCode: string;
  designCode: string;
  status: ExperienceStatus;
  updatedAt: string;
  thumbnailUrl?: string;
  nodeCount: number;
  moduleCount: number;
}

// ---------------------------------------------------------------------------
// Helpers (design-time validation stubs)
// ---------------------------------------------------------------------------

export function isModuleRefNode(node: FlowNode): node is ModuleRefNode {
  return node.kind === "module";
}

export function isControlRefNode(node: FlowNode): node is ControlRefNode {
  return node.kind === "control";
}

/** Default outcome key for a module type, e.g. catch.score */
export function moduleOutcomeKey(moduleType: string, key: string): string {
  return `${moduleType}.${key}`;
}

/** Node-scoped key when the same module type appears more than once in a flow */
export function nodeScopedOutcomeKey(nodeId: string, moduleType: string, key: string): string {
  return `nodes.${nodeId}.${moduleType}.${key}`;
}
