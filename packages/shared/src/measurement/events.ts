/** Canonical event names and legacy mapping. */

export const SHELL_EVENTS = {
  course: {
    viewed: "course.viewed",
    enrolled: "course.enrolled",
    resumed: "course.resumed",
    /** First course-home view after new enrolment (not resume). Basis for course starts metrics. */
    started: "course.started",
    itemViewed: "course.item_viewed",
    itemStarted: "course.item_started",
    itemCompleted: "course.item_completed",
    completed: "course.completed",
  },
  flow: {
    viewed: "flow.viewed",
    started: "flow.started",
    resumed: "flow.resumed",
    stepStarted: "flow.step_started",
    stepCompleted: "flow.step_completed",
    completed: "flow.completed",
  },
} as const;

const LEGACY_EVENT_MAP: Record<string, string> = {
  "experience.step_start": SHELL_EVENTS.flow.stepStarted,
  "experience.step_complete": SHELL_EVENTS.flow.stepCompleted,
  "experience.complete": SHELL_EVENTS.flow.completed,
  "page.step_complete": "component.step_completed",
};

export function canonicalEventName(raw: string | undefined): string {
  const name = String(raw || "").trim();
  if (!name) return "unknown.event";
  return LEGACY_EVENT_MAP[name] || name;
}

export function eventCategoryFor(eventName: string): string {
  if (eventName.startsWith("course.")) return "course";
  if (eventName.startsWith("flow.")) return "flow";
  if (eventName.startsWith("component.")) return "component";
  const prefix = eventName.split(".")[0];
  return prefix || "component";
}
