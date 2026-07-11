import { randomUUID } from "node:crypto";
import { connectLambda } from "@netlify/blobs";
import { readIndex, getWheelJson, getPollStateJson, setPollStateJson } from "./lib/blobs.mjs";
import { requireAuth } from "./lib/auth.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

async function resolveLanding(slug) {
  const list = await readIndex();
  const item = list.find((x) => x.slug === slug);
  if (!item) return null;
  const doc = await getWheelJson(item.id);
  if (!doc || doc.gameType !== "landing") return null;
  return { id: item.id, doc };
}

export const handler = async (event, context) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: { ...headers, "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS" },
    };
  }

  const params = event.queryStringParameters || {};
  const slug = params.slug || (() => {
    try {
      return JSON.parse(event.body || "{}").slug;
    } catch {
      return "";
    }
  })();
  const blockId = params.blockId || (() => {
    try {
      return JSON.parse(event.body || "{}").blockId;
    } catch {
      return "";
    }
  })();

  if (!slug || !blockId) {
    return { statusCode: 400, body: JSON.stringify({ error: "slug and blockId required" }), headers };
  }

  const landing = await resolveLanding(slug);
  if (!landing) {
    return { statusCode: 404, body: JSON.stringify({ error: "Landing page not found" }), headers };
  }

  if (event.httpMethod === "GET") {
    const admin = params.admin === "1";
    if (admin) {
      const deny = requireAuth(event, context);
      if (deny) return deny;
    }
    const state = await getPollStateJson(landing.id, blockId);
    if (!admin) {
      const voterId = params.voterId || "";
      const voted = voterId ? state.ballots.some((b) => b.voterId === voterId) : false;
      return {
        statusCode: 200,
        body: JSON.stringify({
          tallies: state.tallies,
          total: Object.values(state.tallies).reduce((n, c) => n + Number(c || 0), 0),
          voted,
        }),
        headers,
      };
    }
    return { statusCode: 200, body: JSON.stringify({ state }), headers };
  }

  if (event.httpMethod === "POST") {
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }), headers };
    }
    const optionId = String(body.optionId || "").trim();
    const voterId = String(body.voterId || "").trim();
    if (!optionId || !voterId) {
      return { statusCode: 400, body: JSON.stringify({ error: "optionId and voterId required" }), headers };
    }

    const state = await getPollStateJson(landing.id, blockId);
    if (state.ballots.some((b) => b.voterId === voterId)) {
      return { statusCode: 409, body: JSON.stringify({ error: "Already voted" }), headers };
    }

    state.tallies[optionId] = Number(state.tallies[optionId] || 0) + 1;
    state.ballots.unshift({
      id: randomUUID(),
      optionId,
      voterId,
      votedAt: new Date().toISOString(),
    });
    await setPollStateJson(landing.id, blockId, state);

    return {
      statusCode: 201,
      body: JSON.stringify({
        tallies: state.tallies,
        total: Object.values(state.tallies).reduce((n, c) => n + Number(c || 0), 0),
      }),
      headers,
    };
  }

  if (event.httpMethod === "PUT") {
    const deny = requireAuth(event, context);
    if (deny) return deny;

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }), headers };
    }

    if (body.action !== "clear") {
      return { statusCode: 400, body: JSON.stringify({ error: "Unknown action" }), headers };
    }

    const state = {
      version: 1,
      landingId: landing.id,
      blockId,
      tallies: {},
      ballots: [],
      clearedAt: new Date().toISOString(),
    };
    await setPollStateJson(landing.id, blockId, state);
    return { statusCode: 200, body: JSON.stringify({ state }), headers };
  }

  return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }), headers };
};
