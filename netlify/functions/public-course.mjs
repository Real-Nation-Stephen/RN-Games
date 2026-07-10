import { connectLambda } from "@netlify/blobs";
import {
  readCoursesIndex,
  getCourseJson,
  readIndex,
  readExperiencesIndex,
  getExperienceJson,
  getWheelJson,
} from "./lib/blobs.mjs";
import {
  normalizeCourseRecord,
  resolvePublicCourseItems,
  toPublicCourse,
  flattenCourseItems,
} from "./lib/course.mjs";
import { normalizeExperienceRecord } from "./lib/experience.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }), headers };
  }

  try {
    const slug = String(event.queryStringParameters?.slug || "").trim().toLowerCase();
    const previewToken = String(event.queryStringParameters?.previewToken || "").trim();
    if (!slug) {
      return { statusCode: 400, body: JSON.stringify({ error: "slug required" }), headers };
    }

    const list = await readCoursesIndex();
    const row = list.find((x) => x.slug === slug);
    if (!row) {
      return { statusCode: 404, body: JSON.stringify({ error: "Not found" }), headers };
    }

    const raw = await getCourseJson(row.id);
    if (!raw) {
      return { statusCode: 404, body: JSON.stringify({ error: "Not found" }), headers };
    }

    const course = normalizeCourseRecord(raw);
    const isPreview = previewToken && previewToken === course.previewToken;
    if (course.status !== "published" && !isPreview) {
      return { statusCode: 404, body: JSON.stringify({ error: "Not found" }), headers };
    }

    const modules = await readIndex();
    const experiences = await readExperiencesIndex();
    const moduleById = new Map(modules.map((m) => [m.id, m]));
    const experienceById = new Map(experiences.map((e) => [e.id, e]));

    const experienceIds = new Set(
      flattenCourseItems(course.sections)
        .filter((item) => item.kind === "experience" && item.experienceId)
        .map((item) => item.experienceId),
    );
    for (const expId of experienceIds) {
      const expRaw = await getExperienceJson(expId);
      if (expRaw) {
        experienceById.set(expId, normalizeExperienceRecord(expRaw));
      }
    }

    const badgeModuleIds = new Set(
      flattenCourseItems(course.sections)
        .filter((item) => {
          if (item.kind !== "module" || !item.moduleInstanceId) return false;
          const mod = moduleById.get(item.moduleInstanceId);
          const moduleType = item.moduleType || mod?.gameType;
          return moduleType === "badge";
        })
        .map((item) => item.moduleInstanceId),
    );
    for (const modId of badgeModuleIds) {
      const raw = await getWheelJson(modId);
      if (raw?.gameType === "badge") {
        const entry = moduleById.get(modId) || {};
        moduleById.set(modId, { ...entry, badgeBackgroundUrl: raw.badgeBackgroundUrl || "" });
      }
    }

    const items = resolvePublicCourseItems(course, moduleById, experienceById, {
      includeContentPreviewTokens: isPreview,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        course: toPublicCourse(course, items),
      }),
      headers,
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e instanceof Error ? e.message : "Server error" }),
    };
  }
};
