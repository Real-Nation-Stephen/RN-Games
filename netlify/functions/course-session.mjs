import { randomUUID } from "node:crypto";
import { connectLambda } from "@netlify/blobs";
import {
  readCoursesIndex,
  getCourseJson,
  getCourseSessionJson,
  setCourseSessionJson,
  getCourseResumeIndex,
  setCourseResumeIndex,
  getCourseEmailIndex,
  setCourseEmailIndex,
} from "./lib/blobs.mjs";
import { normalizeCourseRecord, flattenCourseItems } from "./lib/course.mjs";
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

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

async function resolveCourse(slug, previewToken) {
  const list = await readCoursesIndex();
  const row = list.find((x) => x.slug === slug);
  if (!row) return null;
  const doc = normalizeCourseRecord(await getCourseJson(row.id));
  if (!doc) return null;
  if (doc.status !== "published") {
    if (!previewToken || previewToken !== doc.previewToken) return null;
  }
  return doc;
}

function emptySession(course, participantId, email) {
  const items = flattenCourseItems(course.sections);
  const first = items[0];
  const resumeToken = randomUUID();
  return {
    sessionId: randomUUID(),
    courseId: course.id,
    courseSlug: course.slug,
    participantId,
    email: email || undefined,
    resumeToken,
    completedItemIds: [],
    currentItemId: first?.id || null,
    lastVisitedItemId: null,
    earnedCertificates: [],
    outcomes: {},
    itemOutcomes: {},
    data: {},
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
  };
}

async function indexSession(session) {
  if (session.resumeToken) {
    await setCourseResumeIndex(session.resumeToken, { sessionId: session.sessionId });
  }
  if (session.email) {
    await setCourseEmailIndex(session.courseSlug, session.email, {
      sessionId: session.sessionId,
      resumeToken: session.resumeToken,
    });
  }
}

export const handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  try {
    if (event.httpMethod === "GET") {
      const sessionId = event.queryStringParameters?.id;
      const resumeToken = event.queryStringParameters?.resumeToken;
      if (resumeToken) {
        const idx = await getCourseResumeIndex(resumeToken);
        if (!idx?.sessionId) {
          return { statusCode: 404, body: JSON.stringify({ error: "Resume link not found" }), headers };
        }
        const session = await getCourseSessionJson(idx.sessionId);
        if (!session) {
          return { statusCode: 404, body: JSON.stringify({ error: "Session not found" }), headers };
        }
        return { statusCode: 200, body: JSON.stringify({ session }), headers };
      }
      if (!sessionId) {
        return { statusCode: 400, body: JSON.stringify({ error: "id or resumeToken required" }), headers };
      }
      const session = await getCourseSessionJson(sessionId);
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
      const slug = String(body.courseSlug || body.slug || "").trim().toLowerCase();
      const previewToken = String(body.previewToken || "").trim();
      const resumeId = String(body.sessionId || "").trim();
      const resumeToken = String(body.resumeToken || "").trim();
      const email = normalizeEmail(body.email);

      if (resumeToken) {
        const idx = await getCourseResumeIndex(resumeToken);
        if (idx?.sessionId) {
          const existing = await getCourseSessionJson(idx.sessionId);
          if (existing) {
            return {
              statusCode: 200,
              body: JSON.stringify({
                session: existing,
                resumed: true,
                resumeUrl: `/course/${existing.courseSlug}?resumeToken=${existing.resumeToken}`,
              }),
              headers,
            };
          }
        }
      }

      if (resumeId) {
        const existing = await getCourseSessionJson(resumeId);
        if (existing && existing.courseSlug === slug) {
          return {
            statusCode: 200,
            body: JSON.stringify({
              session: existing,
              resumed: true,
              resumeUrl: existing.resumeToken
                ? `/course/${existing.courseSlug}?resumeToken=${existing.resumeToken}`
                : undefined,
            }),
            headers,
          };
        }
      }

      if (email) {
        const emailIdx = await getCourseEmailIndex(slug, email);
        if (emailIdx?.sessionId) {
          const existing = await getCourseSessionJson(emailIdx.sessionId);
          if (existing && existing.courseSlug === slug) {
            return {
              statusCode: 200,
              body: JSON.stringify({
                session: existing,
                resumed: true,
                resumeUrl: existing.resumeToken
                  ? `/course/${existing.courseSlug}?resumeToken=${existing.resumeToken}`
                  : undefined,
              }),
              headers,
            };
          }
        }
      }

      const course = await resolveCourse(slug, previewToken);
      if (!course) {
        return { statusCode: 404, body: JSON.stringify({ error: "Course not found" }), headers };
      }
      if (!flattenCourseItems(course.sections).length && !previewToken) {
        return { statusCode: 400, body: JSON.stringify({ error: "Course has no items" }), headers };
      }

      const participantId = String(body.participantId || randomUUID());
      const session = emptySession(course, participantId, email || undefined);
      await setCourseSessionJson(session.sessionId, session);
      await indexSession(session);

      return {
        statusCode: 201,
        body: JSON.stringify({
          session,
          resumed: false,
          resumeUrl: session.resumeToken
            ? `/course/${session.courseSlug}?resumeToken=${session.resumeToken}`
            : undefined,
        }),
        headers,
      };
    }

    if (event.httpMethod === "PATCH") {
      const body = JSON.parse(event.body || "{}");
      const sessionId = String(body.sessionId || "").trim();
      if (!sessionId) {
        return { statusCode: 400, body: JSON.stringify({ error: "sessionId required" }), headers };
      }
      const session = await getCourseSessionJson(sessionId);
      if (!session) {
        return { statusCode: 404, body: JSON.stringify({ error: "Session not found" }), headers };
      }

      const course = normalizeCourseRecord(await getCourseJson(session.courseId));
      if (!course) {
        return { statusCode: 404, body: JSON.stringify({ error: "Course not found" }), headers };
      }

      const items = flattenCourseItems(course.sections);
      const itemIds = new Set(items.map((i) => i.id));

      function mergeOutcomes(itemId, outcomes) {
        if (!outcomes || typeof outcomes !== "object") return;
        session.outcomes = { ...(session.outcomes || {}), ...outcomes };
        if (itemId) {
          session.itemOutcomes = session.itemOutcomes || {};
          session.itemOutcomes[itemId] = { ...(session.itemOutcomes[itemId] || {}), ...outcomes };
        }
      }

      if (body.data && typeof body.data === "object") {
        session.data = { ...(session.data || {}), ...body.data };
      }

      if (body.email) {
        const email = normalizeEmail(body.email);
        if (email) {
          session.email = email;
          if (!session.resumeToken) session.resumeToken = randomUUID();
          await indexSession(session);
        }
      }

      if (body.itemId && body.action === "sync") {
        const itemId = String(body.itemId);
        if (itemIds.has(itemId)) {
          mergeOutcomes(itemId, body.outcomes);
        }
      }

      if (body.itemId && body.action === "visit") {
        const itemId = String(body.itemId);
        if (itemIds.has(itemId)) {
          session.currentItemId = itemId;
          session.lastVisitedItemId = itemId;
        }
      }

      if (body.itemId && body.action === "complete") {
        const itemId = String(body.itemId);
        if (itemIds.has(itemId)) {
          mergeOutcomes(itemId, body.outcomes);
          const completed = new Set(session.completedItemIds || []);
          completed.add(itemId);
          session.completedItemIds = [...completed];
          session.lastVisitedItemId = itemId;

          const item = items.find((i) => i.id === itemId);
          if (item?.kind === "module" && item.moduleType === "certificate") {
            const earned = new Set(session.earnedCertificates || []);
            earned.add(itemId);
            session.earnedCertificates = [...earned];
          }

          const next = items.find((i) => !session.completedItemIds.includes(i.id));
          session.currentItemId = next?.id || null;
          if (!next) session.completedAt = new Date().toISOString();
        }
      }

      session.updatedAt = new Date().toISOString();
      await setCourseSessionJson(sessionId, session);
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
