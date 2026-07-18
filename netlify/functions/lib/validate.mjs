export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "assets",
  "play",
  "report",
  "static",
  "favicon.ico",
  "robots.txt",
  "_next",
  ".netlify",
  "quiz",
  "scratcher",
  "flip-cards",
  "pinboard",
  "leaderboard",
  "catch",
  "runner",
  "matching",
  "x",
]);

export function validateSlug(raw) {
  const slug = raw.trim().toLowerCase();
  if (slug.length < 2 || slug.length > 64) {
    return { ok: false, error: "Slug must be 2–64 characters." };
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { ok: false, error: "Use lowercase letters, numbers, and hyphens only." };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: "This slug is reserved." };
  }
  return { ok: true, slug };
}
