import { connectLambda } from "@netlify/blobs";
import {
  readCoursesIndex,
  getCourseJson,
  readIndex,
  readExperiencesIndex,
} from "./lib/blobs.mjs";
import {
  normalizeCourseRecord,
  resolvePublicCourseItems,
  toPublicCourse,
} from "./lib/course.mjs";

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
    const items = resolvePublicCourseItems(course, moduleById, experienceById);

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
