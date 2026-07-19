/** Component metadata registry — mirrors packages/shared/src/measurement/registry.ts */

export const COMPONENT_METADATA_REGISTRY = {
  course: { componentType: "course", fields: [] },
  flow: { componentType: "flow", fields: [] },
  form: {
    componentType: "form",
    fields: [
      { id: "email", dataClass: "personal" },
      { id: "displayName", dataClass: "personal" },
      { id: "freeText", dataClass: "personal" },
    ],
  },
  "email-signup": {
    componentType: "email-signup",
    fields: [
      { id: "email", dataClass: "personal" },
      { id: "marketingOptIn", dataClass: "personal" },
    ],
  },
  leaderboard: {
    componentType: "leaderboard",
    fields: [{ id: "displayName", dataClass: "personal" }],
  },
  certificate: {
    componentType: "certificate",
    fields: [{ id: "learnerName", dataClass: "personal" }],
  },
  pinboard: {
    componentType: "pinboard",
    fields: [{ id: "photo", dataClass: "personal" }],
  },
  "mini-quiz": { componentType: "mini-quiz", fields: [{ id: "answers", dataClass: "behavioural" }] },
  landing: { componentType: "landing", fields: [] },
  runner: { componentType: "runner", fields: [{ id: "score", dataClass: "behavioural" }] },
  catch: { componentType: "catch", fields: [{ id: "score", dataClass: "behavioural" }] },
  "spinning-wheel": { componentType: "spinning-wheel", fields: [{ id: "prize", dataClass: "behavioural" }] },
  matching: {
    componentType: "matching",
    fields: [
      { id: "matchedPairs", dataClass: "behavioural" },
      { id: "moves", dataClass: "behavioural" },
      { id: "score", dataClass: "behavioural" },
    ],
  },
  badge: { componentType: "badge", fields: [] },
};

export function getComponentMetadata(componentType) {
  return COMPONENT_METADATA_REGISTRY[componentType];
}
