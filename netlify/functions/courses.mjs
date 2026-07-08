import { randomUUID } from "node:crypto";
import { connectLambda } from "@netlify/blobs";
import { requireAuth } from "./lib/auth.mjs";
import {
  readCoursesIndex,
  writeCoursesIndex,
  getCourseJson,
  setCourseJson,
  deleteCourseBlob,
  readIndex,
  readExperiencesIndex,
  getWheelJson,
  getExperienceJson,
} from "./lib/blobs.mjs";
import {
  emptyCourseRecord,
  normalizeCourseRecord,
  toCourseIndexEntry,
  flattenCourseItems,
} from "./lib/course.mjs";
import { validateUniqueSlug } from "./lib/slug-uniqueness.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function filterList(list, params) {
  let out = list.filter((x) => !x.archived);
  const q = String(params?.q || "").trim().toLowerCase();
  if (q) {
    out = out.filter(
      (x) =>
        (x.title || "").toLowerCase().includes(q) ||
        (x.clientName || "").toLowerCase().includes(q) ||
        (x.slug || "").toLowerCase().includes(q) ||
        (x.projectCode || "").toLowerCase().includes(q) ||
        (x.designCode || "").toLowerCase().includes(q),
    );
  }
  const pc = String(params?.projectCode || "").trim().toLowerCase();
  if (pc) out = out.filter((x) => (x.projectCode || "").toLowerCase().includes(pc));
  const dc = String(params?.designCode || "").trim().toLowerCase();
  if (dc) out = out.filter((x) => (x.designCode || "").toLowerCase().includes(dc));
  return out;
}

export async function validateCourseSections(sections) {
  const warnings = [];
  const modules = await readIndex();
  const experiences = await readExperiencesIndex();
  const moduleById = new Map(modules.map((r) => [r.id, r]));
  const experienceById = new Map(experiences.map((r) => [r.id, r]));

  for (const section of sections || []) {
    for (const item of section.items || []) {
      if (item.kind === "module") {
        if (!item.moduleInstanceId) {
          warnings.push({ itemId: item.id, message: "No component selected" });
          continue;
        }
        const row = moduleById.get(item.moduleInstanceId);
        if (!row) {
          warnings.push({ itemId: item.id, message: "Component missing or deleted" });
          continue;
        }
        const full = await getWheelJson(item.moduleInstanceId);
        if (!full) warnings.push({ itemId: item.id, message: "Component config missing" });
        else if (full.archived) warnings.push({ itemId: item.id, message: "Component is archived" });
      } else if (item.kind === "experience") {
        if (!item.experienceId) {
          warnings.push({ itemId: item.id, message: "No experience selected" });
          continue;
        }
        const row = experienceById.get(item.experienceId);
        if (!row) warnings.push({ itemId: item.id, message: "Experience missing or deleted" });
        else {
          const full = await getExperienceJson(item.experienceId);
          if (!full) warnings.push({ itemId: item.id, message: "Experience config missing" });
          else if (full.archived) warnings.push({ itemId: item.id, message: "Experience is archived" });
        }
      } else if (item.kind === "video" && !item.videoUrl) {
        warnings.push({ itemId: item.id, message: "Video URL missing" });
      }
    }
  }
  return warnings;
}

export const handler = async (event, context) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  try {
    if (event.httpMethod === "GET") {
      const id = event.queryStringParameters?.id;
      if (id) {
        const doc = await getCourseJson(id);
        if (!doc) {
          return { statusCode: 404, body: JSON.stringify({ error: "Not found" }), headers };
        }
        return {
          statusCode: 200,
          body: JSON.stringify({ course: normalizeCourseRecord(doc) }),
          headers,
        };
      }
      let list = await readCoursesIndex();
      list = filterList(list, event.queryStringParameters);
      list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      return { statusCode: 200, body: JSON.stringify({ courses: list }), headers };
    }

    const deny = requireAuth(event, context);
    if (deny) return { ...deny, headers: { ...headers, ...deny.headers } };

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const id = randomUUID();
      const slugRaw = body.slug || `course-${Date.now().toString(36)}`;
      const slugCheck = await validateUniqueSlug(slugRaw);
      if (!slugCheck.ok) {
        return { statusCode: 400, body: JSON.stringify({ error: slugCheck.error }), headers };
      }

      let course;
      if (body.sourceId) {
        const src = await getCourseJson(String(body.sourceId));
        if (!src) {
          return { statusCode: 404, body: JSON.stringify({ error: "Source not found" }), headers };
        }
        course = normalizeCourseRecord({
          ...src,
          id,
          slug: slugCheck.slug,
          title: body.title || `${src.title} (copy)`,
          status: "draft",
          publishedAt: null,
          previewToken: randomUUID(),
          updatedAt: new Date().toISOString(),
        });
      } else {
        course = emptyCourseRecord(id, slugCheck.slug, randomUUID());
        course.title = body.title || course.title;
        course.clientName = body.clientName || "";
      }

      await setCourseJson(id, course);
      const list = await readCoursesIndex();
      list.push(toCourseIndexEntry(course));
      await writeCoursesIndex(list);
      return { statusCode: 201, body: JSON.stringify({ course }), headers };
    }

    if (event.httpMethod === "PUT") {
      const body = JSON.parse(event.body || "{}");
      const id = body.id;
      if (!id) {
        return { statusCode: 400, body: JSON.stringify({ error: "id required" }), headers };
      }
      const existing = await getCourseJson(id);
      if (!existing) {
        return { statusCode: 404, body: JSON.stringify({ error: "Not found" }), headers };
      }

      if (body.slug && body.slug !== existing.slug) {
        const slugCheck = await validateUniqueSlug(body.slug, { excludeCourseId: id });
        if (!slugCheck.ok) {
          return { statusCode: 400, body: JSON.stringify({ error: slugCheck.error }), headers };
        }
        existing.slug = slugCheck.slug;
      }

      const assign = [
        "title",
        "description",
        "clientName",
        "projectCode",
        "designCode",
        "thumbnailUrl",
        "sections",
        "presentation",
        "settings",
        "archived",
      ];
      for (const k of assign) {
        if (body[k] !== undefined) existing[k] = body[k];
      }

      if (body.publish === true) {
        existing.status = "published";
        existing.publishedAt = new Date().toISOString();
      } else if (body.publish === false) {
        existing.status = "draft";
      } else if (body.status !== undefined) {
        existing.status =
          body.status === "published" ? "published" : body.status === "archived" ? "archived" : "draft";
        if (existing.status === "published" && !existing.publishedAt) {
          existing.publishedAt = new Date().toISOString();
        }
      }

      existing.updatedAt = new Date().toISOString();
      const normalized = normalizeCourseRecord(existing);
      const warnings = await validateCourseSections(normalized.sections);
      await setCourseJson(id, normalized);

      const list = await readCoursesIndex();
      const idx = list.findIndex((x) => x.id === id);
      const entry = toCourseIndexEntry(normalized);
      if (idx >= 0) list[idx] = entry;
      else list.push(entry);
      await writeCoursesIndex(list);

      return { statusCode: 200, body: JSON.stringify({ course: normalized, warnings }), headers };
    }

    if (event.httpMethod === "DELETE") {
      const id = event.queryStringParameters?.id;
      if (!id) {
        return { statusCode: 400, body: JSON.stringify({ error: "id required" }), headers };
      }
      await deleteCourseBlob(id);
      const list = (await readCoursesIndex()).filter((x) => x.id !== id);
      await writeCoursesIndex(list);
      return { statusCode: 204, body: "", headers };
    }

    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }), headers };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e instanceof Error ? e.message : "Server error" }),
    };
  }
};
