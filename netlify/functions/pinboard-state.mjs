import { connectLambda } from "@netlify/blobs";
import { readIndex, getWheelJson, getPinboardStateJson, setPinboardStateJson } from "./lib/blobs.mjs";
import { randomUUID } from "node:crypto";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

async function resolveWheelId(slug) {
  const list = await readIndex();
  const item = list.find((x) => x.slug === slug);
  if (!item) return null;
  const doc = await getWheelJson(item.id);
  if (!doc || doc.gameType !== "pinboard") return null;
  return item.id;
}

export const handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: { ...headers, "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS" },
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

  const wheelId = await resolveWheelId(slug);
  if (!wheelId) {
    return { statusCode: 404, body: JSON.stringify({ error: "Pin board not found" }), headers };
  }

  if (event.httpMethod === "GET") {
    const state = await getPinboardStateJson(wheelId);
    return { statusCode: 200, body: JSON.stringify({ state }), headers };
  }

  if (event.httpMethod === "POST") {
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }), headers };
    }
    const submission = body.submission;
    if (!submission || !submission.type) {
      return { statusCode: 400, body: JSON.stringify({ error: "submission required" }), headers };
    }
    const state = await getPinboardStateJson(wheelId);
    const entry = {
      ...submission,
      id: randomUUID(),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    state.submissions.unshift(entry);
    await setPinboardStateJson(wheelId, state);
    return { statusCode: 201, body: JSON.stringify({ submission: entry }), headers };
  }

  if (event.httpMethod === "PUT") {
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }), headers };
    }
    const state = await getPinboardStateJson(wheelId);
    const action = body.action;

    if (action === "approve" && body.id) {
      const i = state.submissions.findIndex((s) => s.id === body.id);
      if (i < 0) return { statusCode: 404, body: JSON.stringify({ error: "Not found" }), headers };
      state.submissions[i] = {
        ...state.submissions[i],
        status: "approved",
        placement: body.placement || state.submissions[i].placement,
      };
    } else if (action === "reject" && body.id) {
      const i = state.submissions.findIndex((s) => s.id === body.id);
      if (i < 0) return { statusCode: 404, body: JSON.stringify({ error: "Not found" }), headers };
      state.submissions[i] = { ...state.submissions[i], status: "rejected", placement: undefined };
    } else if (action === "remove" && body.id) {
      const i = state.submissions.findIndex((s) => s.id === body.id);
      if (i < 0) return { statusCode: 404, body: JSON.stringify({ error: "Not found" }), headers };
      state.submissions[i] = { ...state.submissions[i], status: "rejected", placement: undefined };
    } else if (action === "clear_board") {
      state.submissions = state.submissions.filter((s) => s.status !== "approved");
      state.boardClearedAt = new Date().toISOString();
    } else if (action === "patch" && body.id && body.patch) {
      const i = state.submissions.findIndex((s) => s.id === body.id);
      if (i < 0) return { statusCode: 404, body: JSON.stringify({ error: "Not found" }), headers };
      state.submissions[i] = { ...state.submissions[i], ...body.patch };
    } else {
      return { statusCode: 400, body: JSON.stringify({ error: "Unknown action" }), headers };
    }

    await setPinboardStateJson(wheelId, state);
    return { statusCode: 200, body: JSON.stringify({ state }), headers };
  }

  return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }), headers };
};
