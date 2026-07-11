import { randomUUID } from "node:crypto";
import { connectLambda } from "@netlify/blobs";
import { readIndex, getWheelJson, getFormSubmissionsJson, setFormSubmissionsJson } from "./lib/blobs.mjs";
import { requireAuth } from "./lib/auth.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

async function resolveFormId(slug) {
  const list = await readIndex();
  const item = list.find((x) => x.slug === slug);
  if (!item) return null;
  const doc = await getWheelJson(item.id);
  if (!doc || doc.gameType !== "form") return null;
  return item.id;
}

export const handler = async (event, context) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: { ...headers, "Access-Control-Allow-Methods": "GET, POST, OPTIONS" },
    };
  }

  const slug = event.queryStringParameters?.slug || (() => {
    try {
      return JSON.parse(event.body || "{}").slug;
    } catch {
      return "";
    }
  })();

  if (!slug) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing slug" }), headers };
  }

  const formId = await resolveFormId(slug);
  if (!formId) {
    return { statusCode: 404, body: JSON.stringify({ error: "Form not found" }), headers };
  }

  if (event.httpMethod === "GET") {
    const deny = requireAuth(event, context);
    if (deny) return deny;
    const state = await getFormSubmissionsJson(formId);
    return { statusCode: 200, body: JSON.stringify({ state }), headers };
  }

  if (event.httpMethod === "POST") {
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }), headers };
    }
    const values = body.values;
    if (!values || typeof values !== "object") {
      return { statusCode: 400, body: JSON.stringify({ error: "values required" }), headers };
    }
    const state = await getFormSubmissionsJson(formId);
    const entry = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      values,
      sessionId: body.sessionId ? String(body.sessionId) : undefined,
    };
    state.submissions.unshift(entry);
    await setFormSubmissionsJson(formId, state);
    return { statusCode: 201, body: JSON.stringify({ submission: entry }), headers };
  }

  return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }), headers };
};
