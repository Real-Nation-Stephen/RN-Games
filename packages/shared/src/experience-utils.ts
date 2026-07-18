/**
 * Experience record helpers — Wave 1 linear flows.
 */
export type { ExperienceLinearStep, ExperienceRecord } from "./experience-record.js";
export {
  emptyExperience,
  graphToLinearSteps,
  linearStepsToGraph,
  normalizeExperience,
} from "./experience-record.js";

/** Resolve playable URL path for a component type (site-relative). */
export function componentPublicPath(moduleType: string, slug: string): string {
  const t = (moduleType || "spinning-wheel").trim() || "spinning-wheel";
  switch (t) {
    case "catch":
      return `/catch/${encodeURIComponent(slug)}`;
    case "runner":
      return `/runner/${encodeURIComponent(slug)}`;
    case "matching":
      return `/matching/${encodeURIComponent(slug)}`;
    case "leaderboard":
      return `/leaderboard/${encodeURIComponent(slug)}`;
    case "pinboard":
      return `/pinboard/${encodeURIComponent(slug)}`;
    case "quiz":
      return `/quiz/${encodeURIComponent(slug)}/kiosk`;
    case "scratcher":
      return `/play/scratcher.html?slug=${encodeURIComponent(slug)}`;
    case "flip-cards":
      return `/play/flip-cards.html?slug=${encodeURIComponent(slug)}`;
    case "landing":
      return `/landing/${encodeURIComponent(slug)}`;
    case "form":
      return `/form/${encodeURIComponent(slug)}`;
    case "certificate":
      return `/certificate/${encodeURIComponent(slug)}`;
    case "badge":
      return `/badge/${encodeURIComponent(slug)}`;
    case "consent":
      return `/consent/${encodeURIComponent(slug)}`;
    case "email-signup":
      return `/email-signup/${encodeURIComponent(slug)}`;
    case "redemption":
      return `/redemption/${encodeURIComponent(slug)}`;
    case "mini-quiz":
      return `/mini-quiz/${encodeURIComponent(slug)}`;
    case "spinning-wheel":
    default:
      return `/${encodeURIComponent(slug)}`;
  }
}

/** Append experience flow params. Do not pass `preview=1` — that flag is for Studio editor iframes only. */
export function appendFlowQuery(
  path: string,
  params: {
    sessionId: string;
    experienceId: string;
    nodeId: string;
    nextStepLabel?: string;
    endScreen?: {
      headline?: string;
      body?: string;
      primaryCtaLabel?: string;
    };
  },
): string {
  const sep = path.includes("?") ? "&" : "?";
  const q = new URLSearchParams({
    flow: "1",
    sessionId: params.sessionId,
    experienceId: params.experienceId,
    nodeId: params.nodeId,
  });
  if (params.nextStepLabel?.trim()) {
    q.set("nextStepLabel", params.nextStepLabel.trim());
  }
  const end = params.endScreen;
  if (end?.headline?.trim()) q.set("endHeadline", end.headline.trim());
  if (end?.body?.trim()) q.set("endBody", end.body.trim());
  if (end?.primaryCtaLabel?.trim()) q.set("endCta", end.primaryCtaLabel.trim());
  return `${path}${sep}${q.toString()}`;
}
