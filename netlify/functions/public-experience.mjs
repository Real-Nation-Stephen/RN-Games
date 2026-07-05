import { readExperiencesIndex, getExperienceJson, readIndex } from "./lib/blobs.mjs";
import {
  normalizeExperienceRecord,
  resolvePublishedSteps,
  toPublicExperience,
} from "./lib/experience.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  try {
    if (event.httpMethod !== "GET") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }), headers };
    }

    const slug = String(event.queryStringParameters?.slug || "").trim().toLowerCase();
    const previewToken = String(event.queryStringParameters?.previewToken || "").trim();

    if (!slug) {
      return { statusCode: 400, body: JSON.stringify({ error: "slug required" }), headers };
    }

    const list = await readExperiencesIndex();
    const row = list.find((x) => x.slug === slug);
    if (!row) {
      return { statusCode: 404, body: JSON.stringify({ error: "Not found" }), headers };
    }

    const raw = await getExperienceJson(row.id);
    if (!raw) {
      return { statusCode: 404, body: JSON.stringify({ error: "Not found" }), headers };
    }

    const experience = normalizeExperienceRecord(raw);
    const isPreview = previewToken && previewToken === experience.previewToken;

    if (experience.status !== "published" && !isPreview) {
      return { statusCode: 404, body: JSON.stringify({ error: "Not found" }), headers };
    }

    const moduleIndex = await readIndex();
    const moduleById = new Map(moduleIndex.map((m) => [m.id, m]));
    const steps = resolvePublishedSteps(experience, moduleById);

    return {
      statusCode: 200,
      body: JSON.stringify({
        experience: toPublicExperience(experience, steps),
        preview: isPreview,
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
