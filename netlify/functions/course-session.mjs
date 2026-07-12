import { randomUUID, randomBytes } from "node:crypto";
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

function shortResumeToken() {
  return randomBytes(9).toString("base64url");
}

function emptySession(course, participantId, email) {
  const items = flattenCourseItems(course.sections);
  const first = items[0];
  const resumeToken = shortResumeToken();
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
    earnedBadges: [],
    outcomes: {},
    itemOutcomes: {},
    data: {},
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
  };
}

function normalizeSession(session) {
  if (!Array.isArray(session.completedItemIds)) session.completedItemIds = [];
  if (!Array.isArray(session.earnedCertificates)) session.earnedCertificates = [];
  if (!Array.isArray(session.earnedBadges)) session.earnedBadges = [];
  if (!session.itemOutcomes || typeof session.itemOutcomes !== "object") session.itemOutcomes = {};
  if (!session.outcomes || typeof session.outcomes !== "object") session.outcomes = {};
  if (!session.data || typeof session.data !== "object") session.data = {};
  return session;
}

function mergeItemOutcomesMaps(base, patch) {
  const out = { ...(base || {}) };
  for (const [itemId, outcomes] of Object.entries(patch || {})) {
    if (!outcomes || typeof outcomes !== "object") continue;
    out[itemId] = { ...(out[itemId] || {}), ...outcomes };
  }
  return out;
}

/** Union cumulative session fields from latest storage before write (avoids PATCH races). */
async function saveCourseSessionMerged(sessionId, draft) {
  const latest = await getCourseSessionJson(sessionId);
  if (!latest) return null;

  draft.completedItemIds = [
    ...new Set([...(latest.completedItemIds || []), ...(draft.completedItemIds || [])]),
  ];
  draft.earnedCertificates = [
    ...new Set([...(latest.earnedCertificates || []), ...(draft.earnedCertificates || [])]),
  ];
  draft.earnedBadges = [...new Set([...(latest.earnedBadges || []), ...(draft.earnedBadges || [])])];
  draft.outcomes = { ...(latest.outcomes || {}), ...(draft.outcomes || {}) };
  draft.itemOutcomes = mergeItemOutcomesMaps(latest.itemOutcomes, draft.itemOutcomes);
  draft.data = { ...(latest.data || {}), ...(draft.data || {}) };
  if (latest.completedAt && !draft.completedAt) draft.completedAt = latest.completedAt;

  draft.updatedAt = new Date().toISOString();
  await setCourseSessionJson(sessionId, draft);
  return normalizeSession(draft);
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
        return { statusCode: 200, body: JSON.stringify({ session: normalizeSession(session) }), headers };
      }
      if (!sessionId) {
        return { statusCode: 400, body: JSON.stringify({ error: "id or resumeToken required" }), headers };
      }
      const session = await getCourseSessionJson(sessionId);
      if (!session) {
        return { statusCode: 404, body: JSON.stringify({ error: "Session not found" }), headers };
      }
      return { statusCode: 200, body: JSON.stringify({ session: normalizeSession(session) }), headers };
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
      const intent = String(body.intent || "").trim();
      const classCode = String(body.classCode || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");

      if (resumeToken) {
        const idx = await getCourseResumeIndex(resumeToken);
        if (idx?.sessionId) {
          const existing = await getCourseSessionJson(idx.sessionId);
          if (existing) {
            return {
              statusCode: 200,
              body: JSON.stringify({
                session: normalizeSession(existing),
                resumed: true,
                resumeUrl: `/course/${existing.courseSlug}?resumeToken=${existing.resumeToken}`,
              }),
              headers,
            };
          }
        }
        return { statusCode: 404, body: JSON.stringify({ error: "Learning link not found" }), headers };
      }

      const course = await resolveCourse(slug, previewToken);
      if (!course) {
        return { statusCode: 404, body: JSON.stringify({ error: "Course not found" }), headers };
      }

      if (classCode) {
        const expected = String(course.settings?.classCode || "")
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "");
        if (course.settings?.enrollmentMode !== "class" || !expected || classCode !== expected) {
          return { statusCode: 400, body: JSON.stringify({ error: "Invalid class code" }), headers };
        }
        if (!flattenCourseItems(course.sections).length && !previewToken) {
          return { statusCode: 400, body: JSON.stringify({ error: "Course has no items" }), headers };
        }
        const participantId = String(body.participantId || randomUUID());
        const session = emptySession(course, participantId);
        session.enrolledViaClass = true;
        await setCourseSessionJson(session.sessionId, session);
        await indexSession(session);
        return {
          statusCode: 201,
          body: JSON.stringify({
            session: normalizeSession(session),
            resumed: false,
            resumeUrl: `/course/${session.courseSlug}?resumeToken=${session.resumeToken}`,
          }),
          headers,
        };
      }

      if (previewToken && resumeId) {
        const existing = await getCourseSessionJson(resumeId);
        if (existing && existing.courseSlug === slug) {
          return {
            statusCode: 200,
            body: JSON.stringify({
              session: normalizeSession(existing),
              resumed: true,
              resumeUrl: existing.resumeToken
                ? `/course/${existing.courseSlug}?resumeToken=${existing.resumeToken}`
                : undefined,
            }),
            headers,
          };
        }
      }

      if (intent === "new" || previewToken) {
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
            session: normalizeSession(session),
            resumed: false,
            resumeUrl: session.resumeToken
              ? `/course/${session.courseSlug}?resumeToken=${session.resumeToken}`
              : undefined,
          }),
          headers,
        };
      }

      if (email) {
        const emailIdx = await getCourseEmailIndex(slug, email);
        if (emailIdx?.sessionId) {
          const existing = await getCourseSessionJson(emailIdx.sessionId);
          if (existing && existing.courseSlug === slug) {
            return {
              statusCode: 200,
              body: JSON.stringify({
                session: normalizeSession(existing),
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

      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Choose how to start: create a learning link, resume, or join a class" }),
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

      function markItemComplete(itemId) {
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
        if (item?.kind === "module" && item.moduleType === "badge") {
          const earned = new Set(session.earnedBadges || []);
          earned.add(itemId);
          session.earnedBadges = [...earned];
        }

        const next = items.find((i) => !session.completedItemIds.includes(i.id));
        session.currentItemId = next?.id || null;
        if (!next) session.completedAt = new Date().toISOString();
      }

      if (body.data && typeof body.data === "object") {
        session.data = { ...(session.data || {}), ...body.data };
      }

      if (body.email) {
        const email = normalizeEmail(body.email);
        if (email) {
          session.email = email;
          if (!session.resumeToken) session.resumeToken = shortResumeToken();
          await indexSession(session);
        }
      }

      if (body.itemId && body.action === "sync") {
        const itemId = String(body.itemId);
        if (itemIds.has(itemId)) {
          mergeOutcomes(itemId, body.outcomes);
          if (body.outcomes?.completed === true) {
            markItemComplete(itemId);
          }
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
          markItemComplete(itemId);
        }
      }

      session.updatedAt = new Date().toISOString();
      const saved = await saveCourseSessionMerged(sessionId, session);
      if (!saved) {
        return { statusCode: 404, body: JSON.stringify({ error: "Session not found" }), headers };
      }
      const nextIncomplete = items.find((i) => !saved.completedItemIds.includes(i.id));
      if (!nextIncomplete && items.length && !saved.completedAt) {
        saved.completedAt = new Date().toISOString();
        await setCourseSessionJson(sessionId, saved);
      }
      return { statusCode: 200, body: JSON.stringify({ session: normalizeSession(saved) }), headers };
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
