/** Platform content loading stays on Netlify; the same pure engine runs on every live backend. */
export * from "./live-engine.mjs";
import { LIVE_CAPABLE, defaultJoinScreen } from "./live-engine.mjs";
import { getWheelJson, readIndex, getExperienceJson } from "./blobs.mjs";
import { normalizeExperienceRecord, resolvePublishedSteps, toPublicExperience } from "./experience.mjs";
import { normalizeFillGameRecord, normalizeMiniPollRecord } from "./live-modules.mjs";
import { normalizePageModule } from "./page-modules.mjs";

export async function buildSnapshot(experience) {
  const testHooks = globalThis.__RN_LIVE_TEST__ || {};
  if (typeof testHooks.buildSnapshot === "function") {
    return testHooks.buildSnapshot(experience);
  }
  const moduleIndex = await readIndex();
  const moduleById = new Map(moduleIndex.map((m) => [m.id, m]));
  const steps = resolvePublishedSteps(experience, moduleById).filter((s) => !s.missing && !s.archived);
  const configs = {};
  const secrets = {};
  const liveSteps = [];
  for (const step of steps) {
    const row = moduleById.get(step.moduleInstanceId);
    const raw = row ? await getWheelJson(row.id) : null;
    const liveCapable = LIVE_CAPABLE.has(step.moduleType);
    liveSteps.push({
      id: step.id,
      moduleInstanceId: step.moduleInstanceId,
      moduleType: step.moduleType,
      label: step.label || step.moduleTitle || step.moduleType,
      moduleSlug: step.moduleSlug,
      liveCapable,
    });
    if (!raw) continue;
    if (step.moduleType === "mini-poll") {
      configs[step.id] = normalizeMiniPollRecord(raw);
    } else if (step.moduleType === "fill-game") {
      const full = normalizeFillGameRecord(raw);
      full.questions = full.questions.filter((q) => q.enabled !== false);
      configs[step.id] = full;
      secrets[step.id] = { questions: full.questions };
    } else if (step.moduleType === "mini-quiz") {
      const full = normalizePageModule(raw);
      configs[step.id] = full;
      secrets[step.id] = { questions: full.questions || [] };
    } else {
      configs[step.id] = raw;
    }
  }
  return {
    title: experience.title,
    joinScreen: { ...defaultJoinScreen(), ...(experience.foundation?.joinScreen || {}) },
    steps: liveSteps,
    configs,
    secrets,
    publicExperience: toPublicExperience(experience, steps),
  };
}

export async function loadExperienceBySlug(slug) {
  const testHooks = globalThis.__RN_LIVE_TEST__ || {};
  if (typeof testHooks.loadExperience === "function") {
    return testHooks.loadExperience(slug);
  }
  const { readExperiencesIndex } = await import("./blobs.mjs");
  const list = await readExperiencesIndex();
  const row = list.find((x) => x.slug === String(slug || "").toLowerCase());
  if (!row) return null;
  const raw = await getExperienceJson(row.id);
  if (!raw) return null;
  return normalizeExperienceRecord(raw);
}
