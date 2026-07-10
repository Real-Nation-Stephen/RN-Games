import { randomUUID } from "node:crypto";
import { connectLambda } from "@netlify/blobs";
import { requireAuth } from "./lib/auth.mjs";
import {
  readExperiencesIndex,
  writeExperiencesIndex,
  getExperienceJson,
  setExperienceJson,
  deleteExperienceBlob,
  readIndex,
  getWheelJson,
} from "./lib/blobs.mjs";
import {
  emptyExperienceRecord,
  normalizeExperienceRecord,
  linearStepsToGraph,
  graphToLinearSteps,
  toExperienceIndexEntry,
} from "./lib/experience.mjs";
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

export const handler = async (event, context) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  try {
    if (event.httpMethod === "GET") {
      const id = event.queryStringParameters?.id;
      if (id) {
        const doc = await getExperienceJson(id);
        if (!doc) {
          return { statusCode: 404, body: JSON.stringify({ error: "Not found" }), headers };
        }
        return {
          statusCode: 200,
          body: JSON.stringify({ experience: normalizeExperienceRecord(doc) }),
          headers,
        };
      }
      let list = await readExperiencesIndex();
      list = filterList(list, event.queryStringParameters);
      list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      return { statusCode: 200, body: JSON.stringify({ experiences: list }), headers };
    }

    const deny = requireAuth(event, context);
    if (deny) return { ...deny, headers: { ...headers, ...deny.headers } };

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const id = randomUUID();
      const slugRaw = body.slug || `experience-${Date.now().toString(36)}`;
      const slugCheck = await validateUniqueSlug(slugRaw);
      if (!slugCheck.ok) {
        return { statusCode: 400, body: JSON.stringify({ error: slugCheck.error }), headers };
      }

      let experience;
      if (body.sourceId) {
        const src = await getExperienceJson(String(body.sourceId));
        if (!src) {
          return { statusCode: 404, body: JSON.stringify({ error: "Source not found" }), headers };
        }
        experience = normalizeExperienceRecord({
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
        experience = emptyExperienceRecord(id, slugCheck.slug, randomUUID());
        experience.title = body.title || experience.title;
        experience.clientName = body.clientName || "";
      }

      await setExperienceJson(id, experience);
      const list = await readExperiencesIndex();
      list.push(toExperienceIndexEntry(experience));
      await writeExperiencesIndex(list);
      return { statusCode: 201, body: JSON.stringify({ experience }), headers };
    }

    if (event.httpMethod === "PUT") {
      const body = JSON.parse(event.body || "{}");
      const id = body.id;
      if (!id) {
        return { statusCode: 400, body: JSON.stringify({ error: "id required" }), headers };
      }
      const existing = await getExperienceJson(id);
      if (!existing) {
        return { statusCode: 404, body: JSON.stringify({ error: "Not found" }), headers };
      }

      if (body.slug && body.slug !== existing.slug) {
        const slugCheck = await validateUniqueSlug(body.slug, { excludeExperienceId: id });
        if (!slugCheck.ok) {
          return { statusCode: 400, body: JSON.stringify({ error: slugCheck.error }), headers };
        }
        existing.slug = slugCheck.slug;
      }

      const assign = [
        "title",
        "clientName",
        "projectCode",
        "designCode",
        "thumbnailUrl",
        "metadata",
        "foundation",
        "archived",
        "linearSteps",
        "graph",
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

      if (body.graph && Array.isArray(body.graph.nodes) && body.graph.nodes.length > 0) {
        existing.graph = body.graph;
        existing.linearSteps = graphToLinearSteps(body.graph);
      } else if (Array.isArray(body.linearSteps)) {
        existing.linearSteps = body.linearSteps;
        existing.graph = linearStepsToGraph(existing.linearSteps);
      }

      existing.updatedAt = new Date().toISOString();
      const normalized = normalizeExperienceRecord(existing);
      const warnings = await validateExperienceSteps(normalized.linearSteps);
      await setExperienceJson(id, normalized);

      const list = await readExperiencesIndex();
      const idx = list.findIndex((x) => x.id === id);
      const entry = toExperienceIndexEntry(normalized);
      if (idx >= 0) list[idx] = entry;
      else list.push(entry);
      await writeExperiencesIndex(list);

      return { statusCode: 200, body: JSON.stringify({ experience: normalized, warnings }), headers };
    }

    if (event.httpMethod === "DELETE") {
      const id = event.queryStringParameters?.id;
      if (!id) {
        return { statusCode: 400, body: JSON.stringify({ error: "id required" }), headers };
      }
      await deleteExperienceBlob(id);
      const list = (await readExperiencesIndex()).filter((x) => x.id !== id);
      await writeExperiencesIndex(list);
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

export async function validateExperienceSteps(linearSteps) {
  const warnings = [];
  const index = await readIndex();
  const byId = new Map(index.map((r) => [r.id, r]));
  for (const step of linearSteps || []) {
    if (!step.moduleInstanceId) {
      warnings.push({ stepId: step.id, message: "No component selected" });
      continue;
    }
    const row = byId.get(step.moduleInstanceId);
    if (!row) {
      warnings.push({ stepId: step.id, message: "Component missing or deleted" });
      continue;
    }
    const full = await getWheelJson(step.moduleInstanceId);
    if (!full) {
      warnings.push({ stepId: step.id, message: "Component config missing" });
    } else if (full.archived) {
      warnings.push({ stepId: step.id, message: "Component is archived" });
    }
  }
  return warnings;
}
