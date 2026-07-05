import { randomUUID } from "node:crypto";
import { connectLambda } from "@netlify/blobs";
import {
  readExperiencesIndex,
  getExperienceJson,
  getExperienceSessionJson,
  setExperienceSessionJson,
} from "./lib/blobs.mjs";
import { normalizeExperienceRecord } from "./lib/experience.mjs";
import { blobStore } from "./lib/store.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
};

const RATE_LIMIT_PER_HOUR = 120;

function clientIp(event) {
  return (
    event.headers["x-nf-client-connection-ip"] ||
    event.headers["client-ip"] ||
    event.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    "unknown"
  );
}

async function checkRateLimit(ip) {
  const hour = new Date().toISOString().slice(0, 13);
  const key = `session-rate:${ip}:${hour}`;
  const st = await blobStore();
  const raw = await st.get(key, { type: "json" });
  const count = Number(raw?.count) || 0;
  if (count >= RATE_LIMIT_PER_HOUR) return false;
  await st.setJSON(key, { count: count + 1, hour });
  return true;
}

async function resolveExperience(slug, previewToken) {
  const list = await readExperiencesIndex();
  const row = list.find((x) => x.slug === slug);
  if (!row) return null;
  const doc = normalizeExperienceRecord(await getExperienceJson(row.id));
  if (!doc) return null;
  if (doc.status !== "published") {
    if (!previewToken || previewToken !== doc.previewToken) return null;
  }
  return doc;
}

function emptySession(experience, participantId) {
  const steps = experience.linearSteps || [];
  const first = steps[0];
  return {
    sessionId: randomUUID(),
    experienceId: experience.id,
    experienceSlug: experience.slug,
    participantId,
    currentStepIndex: 0,
    currentNodeId: first?.id || null,
    history: [],
    outcomes: {},
    data: {},
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
  };
}

export const handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  try {
    if (event.httpMethod === "GET") {
      const sessionId = event.queryStringParameters?.id;
      if (!sessionId) {
        return { statusCode: 400, body: JSON.stringify({ error: "id required" }), headers };
      }
      const session = await getExperienceSessionJson(sessionId);
      if (!session) {
        return { statusCode: 404, body: JSON.stringify({ error: "Session not found" }), headers };
      }
      return { statusCode: 200, body: JSON.stringify({ session }), headers };
    }

    if (event.httpMethod === "POST") {
      const ip = clientIp(event);
      if (!(await checkRateLimit(ip))) {
        return { statusCode: 429, body: JSON.stringify({ error: "Too many sessions. Try again later." }), headers };
      }

      const body = JSON.parse(event.body || "{}");
      const slug = String(body.experienceSlug || body.slug || "").trim().toLowerCase();
      const previewToken = String(body.previewToken || "").trim();
      const resumeId = String(body.sessionId || "").trim();

      if (resumeId) {
        const existing = await getExperienceSessionJson(resumeId);
        if (existing && existing.experienceSlug === slug) {
          return { statusCode: 200, body: JSON.stringify({ session: existing, resumed: true }), headers };
        }
      }

      const experience = await resolveExperience(slug, previewToken);
      if (!experience) {
        return { statusCode: 404, body: JSON.stringify({ error: "Experience not found" }), headers };
      }
      if (!experience.linearSteps?.length) {
        return { statusCode: 400, body: JSON.stringify({ error: "Experience has no steps" }), headers };
      }

      const participantId = String(body.participantId || randomUUID());
      const session = emptySession(experience, participantId);
      await setExperienceSessionJson(session.sessionId, session);
      return { statusCode: 201, body: JSON.stringify({ session, resumed: false }), headers };
    }

    if (event.httpMethod === "PATCH") {
      const body = JSON.parse(event.body || "{}");
      const sessionId = String(body.sessionId || "").trim();
      if (!sessionId) {
        return { statusCode: 400, body: JSON.stringify({ error: "sessionId required" }), headers };
      }
      const session = await getExperienceSessionJson(sessionId);
      if (!session) {
        return { statusCode: 404, body: JSON.stringify({ error: "Session not found" }), headers };
      }

      const experience = normalizeExperienceRecord(await getExperienceJson(session.experienceId));
      if (!experience) {
        return { statusCode: 404, body: JSON.stringify({ error: "Experience not found" }), headers };
      }

      const steps = experience.linearSteps || [];

      if (body.outcomes && typeof body.outcomes === "object") {
        session.outcomes = { ...session.outcomes, ...body.outcomes };
      }
      if (body.data && typeof body.data === "object") {
        session.data = { ...session.data, ...body.data };
      }

      if (body.action === "advance") {
        const idx = Number(session.currentStepIndex) || 0;
        const current = steps[idx];
        if (current?.id) {
          session.history = [...(session.history || []), current.id];
        }
        const nextIdx = idx + 1;
        if (nextIdx >= steps.length) {
          session.currentStepIndex = steps.length;
          session.currentNodeId = null;
          session.completedAt = new Date().toISOString();
        } else {
          session.currentStepIndex = nextIdx;
          session.currentNodeId = steps[nextIdx]?.id || null;
        }
      }

      session.updatedAt = new Date().toISOString();
      await setExperienceSessionJson(sessionId, session);
      return { statusCode: 200, body: JSON.stringify({ session }), headers };
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
