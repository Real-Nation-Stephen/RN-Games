import { readIndex, readExperiencesIndex } from "./blobs.mjs";
import { validateSlug } from "./validate.mjs";

export async function isSlugTaken(slug, { excludeWheelId, excludeExperienceId } = {}) {
  const wheels = await readIndex();
  if (wheels.some((w) => w.slug === slug && w.id !== excludeWheelId)) return true;
  const experiences = await readExperiencesIndex();
  if (experiences.some((e) => e.slug === slug && e.id !== excludeExperienceId)) return true;
  return false;
}

export async function validateUniqueSlug(raw, opts = {}) {
  const check = validateSlug(raw);
  if (!check.ok) return check;
  if (await isSlugTaken(check.slug, opts)) {
    return { ok: false, error: "Slug already in use." };
  }
  return check;
}
