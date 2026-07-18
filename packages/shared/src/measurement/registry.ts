import type { ComponentMetadataContract } from "./types.js";
import { SHELL_EVENTS } from "./events.js";

function shellContract(
  componentType: string,
  label: string,
  events: { eventName: string; category: string }[],
): ComponentMetadataContract {
  return {
    componentType,
    label,
    supportedContexts: ["standalone", "flow", "course", "course_flow"],
    lifecycleEvents: events.map((e) => ({ ...e, description: e.eventName })),
    fields: [],
    implementationVersion: "1.0",
  };
}

function componentContract(
  componentType: string,
  label: string,
  fields: ComponentMetadataContract["fields"],
  events: string[] = [],
): ComponentMetadataContract {
  return {
    componentType,
    label,
    supportedContexts: ["standalone", "flow", "course", "course_flow"],
    lifecycleEvents: events.map((eventName) => ({
      eventName,
      category: "component",
    })),
    fields,
    implementationVersion: "1.0",
  };
}

/** Platform registry — source of truth for Measurement and Compliance scans. */
export const COMPONENT_METADATA_REGISTRY: Record<string, ComponentMetadataContract> = {
  course: shellContract("course", "Course shell", [
    { eventName: SHELL_EVENTS.course.viewed, category: "course" },
    { eventName: SHELL_EVENTS.course.enrolled, category: "course" },
    { eventName: SHELL_EVENTS.course.resumed, category: "course" },
    { eventName: SHELL_EVENTS.course.started, category: "course" },
    { eventName: SHELL_EVENTS.course.itemStarted, category: "course" },
    { eventName: SHELL_EVENTS.course.itemCompleted, category: "course" },
    { eventName: SHELL_EVENTS.course.completed, category: "course" },
  ]),
  flow: shellContract("flow", "Flow shell", [
    { eventName: SHELL_EVENTS.flow.viewed, category: "flow" },
    { eventName: SHELL_EVENTS.flow.started, category: "flow" },
    { eventName: SHELL_EVENTS.flow.resumed, category: "flow" },
    { eventName: SHELL_EVENTS.flow.stepStarted, category: "flow" },
    { eventName: SHELL_EVENTS.flow.stepCompleted, category: "flow" },
    { eventName: SHELL_EVENTS.flow.completed, category: "flow" },
  ]),
  landing: componentContract("landing", "Landing page", [], ["component.viewed", "component.completed"]),
  form: componentContract(
    "form",
    "Form",
    [
      { id: "email", label: "Email", dataClass: "personal", defaultCollect: true, defaultReport: false },
      { id: "displayName", label: "Display name", dataClass: "personal", defaultCollect: true, defaultReport: false },
      { id: "freeText", label: "Free text responses", dataClass: "personal", defaultCollect: true, defaultReport: false },
    ],
    ["component.viewed", "component.completed", "form.submitted"],
  ),
  "mini-quiz": componentContract(
    "mini-quiz",
    "Mini quiz",
    [
      { id: "score", label: "Score", dataClass: "behavioural", defaultCollect: true, defaultReport: true },
      { id: "answers", label: "Answers", dataClass: "behavioural", defaultCollect: true, defaultReport: false },
    ],
    ["component.viewed", "component.completed", "quiz.submitted"],
  ),
  runner: componentContract(
    "runner",
    "Runner game",
    [{ id: "score", label: "Score", dataClass: "behavioural", defaultCollect: true, defaultReport: true }],
    ["runner.round_start", "runner.round_end"],
  ),
  catch: componentContract(
    "catch",
    "Catch game",
    [{ id: "score", label: "Score", dataClass: "behavioural", defaultCollect: true, defaultReport: true }],
    ["catch.round_start", "catch.round_end"],
  ),
  "spinning-wheel": componentContract(
    "spinning-wheel",
    "Spinning wheel",
    [{ id: "prize", label: "Prize outcome", dataClass: "behavioural", defaultCollect: true, defaultReport: true }],
    ["wheel.spin"],
  ),
  matching: componentContract(
    "matching",
    "Matching game",
    [
      { id: "matchedPairs", label: "Matched pairs", dataClass: "behavioural", defaultCollect: true, defaultReport: true },
      { id: "moves", label: "Moves", dataClass: "behavioural", defaultCollect: true, defaultReport: true },
    ],
    ["matching.round_start", "matching.pair_matched", "matching.round_end"],
  ),
  certificate: componentContract(
    "certificate",
    "Certificate",
    [{ id: "learnerName", label: "Learner name", dataClass: "personal", defaultCollect: true, defaultReport: false }],
    ["certificate.generated", "certificate.downloaded"],
  ),
  badge: componentContract("badge", "Badge", [], ["badge.earned"]),
  "email-signup": componentContract(
    "email-signup",
    "Email signup",
    [
      { id: "email", label: "Email", dataClass: "personal", defaultCollect: true, defaultReport: false },
      { id: "marketingOptIn", label: "Marketing opt-in", dataClass: "personal", defaultCollect: true, defaultReport: false },
    ],
    ["email_signup.submitted"],
  ),
  leaderboard: componentContract(
    "leaderboard",
    "Leaderboard",
    [{ id: "displayName", label: "Display name", dataClass: "personal", defaultCollect: true, defaultReport: false }],
    ["leaderboard.view"],
  ),
};

export function getComponentMetadata(componentType: string): ComponentMetadataContract | undefined {
  return COMPONENT_METADATA_REGISTRY[componentType];
}

export function listComponentMetadata(): ComponentMetadataContract[] {
  return Object.values(COMPONENT_METADATA_REGISTRY);
}
