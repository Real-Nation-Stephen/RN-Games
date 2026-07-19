/**
 * Module capability registry — design draft.
 * Drives flow editor ports, router options, and validation.
 */
import type { ModuleTypeDefinition } from "./experience.js";

export const MODULE_REGISTRY: ModuleTypeDefinition[] = [
  {
    typeId: "spinning-wheel",
    category: "game",
    label: "Spinning wheel",
    status: "shipped",
    participantFacing: true,
    standalonePlayable: true,
    outputs: [
      { id: "completed", label: "Completed", outcomeKey: "completed", valueType: "boolean" },
      { id: "segmentId", label: "Segment ID", outcomeKey: "wheel.segmentId", valueType: "string" },
      { id: "segmentLabel", label: "Segment label", outcomeKey: "wheel.segmentLabel", valueType: "string" },
      { id: "isWin", label: "Win", outcomeKey: "wheel.isWin", valueType: "boolean" },
    ],
  },
  {
    typeId: "scratcher",
    category: "game",
    label: "Digital scratcher",
    status: "shipped",
    participantFacing: true,
    standalonePlayable: true,
    outputs: [
      { id: "completed", label: "Completed", outcomeKey: "completed", valueType: "boolean" },
      { id: "revealed", label: "Revealed", outcomeKey: "scratcher.revealed", valueType: "boolean" },
    ],
  },
  {
    typeId: "flip-cards",
    category: "game",
    label: "Flip cards",
    status: "shipped",
    participantFacing: true,
    standalonePlayable: true,
    outputs: [
      { id: "completed", label: "Completed", outcomeKey: "completed", valueType: "boolean" },
      { id: "matched", label: "Matched pairs", outcomeKey: "flipCards.matched", valueType: "number" },
    ],
  },
  {
    typeId: "matching",
    category: "game",
    label: "Matching game",
    status: "shipped",
    participantFacing: true,
    standalonePlayable: true,
    outputs: [
      { id: "completed", label: "Completed", outcomeKey: "completed", valueType: "boolean" },
      { id: "matchedPairs", label: "Matched pairs", outcomeKey: "matching.matchedPairs", valueType: "number" },
      { id: "moves", label: "Moves", outcomeKey: "matching.moves", valueType: "number" },
      { id: "playMode", label: "Play mode", outcomeKey: "matching.playMode", valueType: "string" },
      { id: "score", label: "Score", outcomeKey: "matching.score", valueType: "number" },
    ],
  },
  {
    typeId: "quiz",
    category: "data-collection",
    label: "Quiz",
    status: "shipped",
    participantFacing: true,
    standalonePlayable: true,
    outputs: [
      { id: "completed", label: "Completed", outcomeKey: "completed", valueType: "boolean" },
      { id: "score", label: "Score", outcomeKey: "quiz.score", valueType: "number" },
      { id: "scorePercent", label: "Score %", outcomeKey: "quiz.scorePercent", valueType: "number" },
      { id: "correctCount", label: "Correct count", outcomeKey: "quiz.correctCount", valueType: "number" },
    ],
  },
  {
    typeId: "pinboard",
    category: "data-collection",
    label: "Pin board",
    status: "shipped",
    participantFacing: true,
    standalonePlayable: true,
    outputs: [
      { id: "completed", label: "Submitted", outcomeKey: "completed", valueType: "boolean" },
      { id: "fieldValues", label: "Submission data", outcomeKey: "form.fieldValues", valueType: "object" },
    ],
  },
  {
    typeId: "catch",
    category: "game",
    label: "Catch game",
    status: "shipped",
    participantFacing: true,
    standalonePlayable: true,
    inputs: [{ id: "displayName", label: "Display name", outcomeKey: "displayName", valueType: "string" }],
    outputs: [
      { id: "completed", label: "Completed", outcomeKey: "completed", valueType: "boolean" },
      { id: "score", label: "Score", outcomeKey: "catch.score", valueType: "number" },
      { id: "displayName", label: "Display name", outcomeKey: "displayName", valueType: "string" },
    ],
  },
  {
    typeId: "runner",
    category: "game",
    label: "Runner game",
    status: "shipped",
    participantFacing: true,
    standalonePlayable: true,
    inputs: [{ id: "displayName", label: "Display name", outcomeKey: "displayName", valueType: "string" }],
    outputs: [
      { id: "completed", label: "Completed", outcomeKey: "completed", valueType: "boolean" },
      { id: "score", label: "Score", outcomeKey: "runner.score", valueType: "number" },
      { id: "distance", label: "Distance", outcomeKey: "runner.distance", valueType: "number" },
      { id: "timeSurvived", label: "Time survived", outcomeKey: "runner.timeSurvived", valueType: "number" },
    ],
  },
  {
    typeId: "leaderboard",
    category: "competition",
    label: "Leaderboard",
    status: "shipped",
    participantFacing: true,
    standalonePlayable: true,
    outputs: [
      { id: "rank", label: "Rank", outcomeKey: "leaderboard.rank", valueType: "number" },
    ],
  },
  // Wave 2 page modules
  {
    typeId: "landing",
    category: "experience",
    label: "Landing page",
    status: "shipped",
    participantFacing: true,
    standalonePlayable: true,
    outputs: [{ id: "completed", label: "CTA continued", outcomeKey: "completed", valueType: "boolean" }],
  },
  {
    typeId: "consent",
    category: "foundation",
    label: "Consent / GDPR",
    status: "shipped",
    participantFacing: true,
    standalonePlayable: false,
    outputs: [{ id: "consentGranted", label: "Consent granted", outcomeKey: "consentGranted", valueType: "boolean" }],
  },
  {
    typeId: "form",
    category: "data-collection",
    label: "Form",
    status: "shipped",
    participantFacing: true,
    standalonePlayable: true,
    outputs: [
      { id: "completed", label: "Submitted", outcomeKey: "completed", valueType: "boolean" },
      { id: "fieldValues", label: "Field values", outcomeKey: "form.fieldValues", valueType: "object" },
    ],
  },
  {
    typeId: "certificate",
    category: "conversion",
    label: "Certificate",
    status: "shipped",
    participantFacing: true,
    standalonePlayable: true,
    outputs: [{ id: "completed", label: "Viewed", outcomeKey: "completed", valueType: "boolean" }],
  },
  {
    typeId: "badge",
    category: "conversion",
    label: "Badge",
    status: "shipped",
    participantFacing: true,
    standalonePlayable: true,
    outputs: [{ id: "completed", label: "Earned", outcomeKey: "completed", valueType: "boolean" }],
  },
  {
    typeId: "redemption",
    category: "conversion",
    label: "Redemption",
    status: "shipped",
    participantFacing: true,
    standalonePlayable: true,
    outputs: [{ id: "completed", label: "Redeemed", outcomeKey: "completed", valueType: "boolean" }],
  },
  {
    typeId: "email-signup",
    category: "data-collection",
    label: "Email signup",
    status: "shipped",
    participantFacing: true,
    standalonePlayable: true,
    outputs: [
      { id: "completed", label: "Signed up", outcomeKey: "completed", valueType: "boolean" },
      { id: "fieldValues", label: "Signup data", outcomeKey: "form.fieldValues", valueType: "object" },
    ],
  },
  {
    typeId: "mini-quiz",
    category: "data-collection",
    label: "Mini quiz",
    status: "shipped",
    participantFacing: true,
    standalonePlayable: true,
    outputs: [
      { id: "completed", label: "Completed", outcomeKey: "completed", valueType: "boolean" },
      { id: "score", label: "Score", outcomeKey: "quiz.score", valueType: "number" },
      { id: "scorePercent", label: "Score %", outcomeKey: "quiz.scorePercent", valueType: "number" },
      { id: "correctCount", label: "Correct count", outcomeKey: "quiz.correctCount", valueType: "number" },
    ],
  },
  // Control-flow — graph only (Logic node unified per ROADMAP Jul 2026)
  {
    typeId: "logic",
    category: "control-flow",
    label: "Logic",
    status: "planned",
    participantFacing: false,
    standalonePlayable: false,
    outputs: [],
  },
  {
    typeId: "join",
    category: "control-flow",
    label: "Join",
    status: "planned",
    participantFacing: false,
    standalonePlayable: false,
    outputs: [],
  },
];

export function getModuleTypeDefinition(typeId: string): ModuleTypeDefinition | undefined {
  return MODULE_REGISTRY.find((m) => m.typeId === typeId);
}

export function shippedModuleTypes(): ModuleTypeDefinition[] {
  return MODULE_REGISTRY.filter((m) => m.status === "shipped" && m.participantFacing);
}
