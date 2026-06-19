import { connectLambda } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import {
  readIndex,
  getWheelJson,
  getLeaderboardStateJson,
  setLeaderboardStateJson,
} from "./lib/blobs.mjs";
import {
  normalizeLeaderboardRecord,
  toPublicLeaderboardState,
} from "./lib/leaderboard.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

async function resolveLeaderboard(slug) {
  const list = await readIndex();
  const item = list.find((x) => x.slug === slug);
  if (!item) return null;
  const doc = await getWheelJson(item.id);
  if (!doc || doc.gameType !== "leaderboard") return null;
  return { wheelId: item.id, config: normalizeLeaderboardRecord(doc) };
}

function bumpState(state) {
  state.revision = (Number(state.revision) || 0) + 1;
  return state;
}

function pinOk(config, pin) {
  const expected = String(config.moderatorPin || "").trim();
  if (!expected) return false;
  return String(pin || "").trim() === expected;
}

export const handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: { ...headers, "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS" },
    };
  }

  const slug =
    event.queryStringParameters?.slug ||
    (() => {
      try {
        return JSON.parse(event.body || "{}").slug;
      } catch {
        return "";
      }
    })();

  if (!slug) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing slug" }), headers };
  }

  const resolved = await resolveLeaderboard(slug);
  if (!resolved) {
    return { statusCode: 404, body: JSON.stringify({ error: "Leaderboard not found" }), headers };
  }
  const { wheelId, config } = resolved;

  if (event.httpMethod === "GET") {
    const rev = Number(event.queryStringParameters?.rev || 0);
    const state = await getLeaderboardStateJson(wheelId);
    const publicState = toPublicLeaderboardState(state);
    if (rev > 0 && rev === publicState.revision) {
      return {
        statusCode: 200,
        body: JSON.stringify({ changed: false, revision: publicState.revision, state: null }),
        headers,
      };
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ changed: true, revision: publicState.revision, state: publicState }),
      headers,
    };
  }

  if (event.httpMethod === "POST") {
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }), headers };
    }

    if (config.mode !== "linked") {
      return { statusCode: 403, body: JSON.stringify({ error: "Leaderboard is not in linked mode" }), headers };
    }
    const sourceGameId = String(body.sourceGameId || "").trim();
    if (!sourceGameId || sourceGameId !== String(config.linkedGameId || "").trim()) {
      return { statusCode: 403, body: JSON.stringify({ error: "Source game not linked to this leaderboard" }), headers };
    }

    const displayName = String(body.displayName || "").trim().slice(0, 64);
    const score = Number(body.score);
    if (!displayName) {
      return { statusCode: 400, body: JSON.stringify({ error: "displayName required" }), headers };
    }
    if (!Number.isFinite(score)) {
      return { statusCode: 400, body: JSON.stringify({ error: "score required" }), headers };
    }

    const state = await getLeaderboardStateJson(wheelId);
    const now = new Date().toISOString();
    const externalId = String(body.externalId || "").trim();
    let entry;
    if (externalId) {
      const i = state.entries.findIndex((e) => e.externalId === externalId);
      if (i >= 0) {
        const prev = state.entries[i];
        state.entries[i] = {
          ...prev,
          displayName,
          score: Math.max(Number(prev.score) || 0, score),
          updatedAt: now,
        };
        entry = state.entries[i];
      }
    }
    if (!entry) {
      entry = {
        id: randomUUID(),
        displayName,
        score,
        source: "linked",
        linkedGameId: sourceGameId,
        externalId: externalId || undefined,
        rankTieAt: now,
        createdAt: now,
        updatedAt: now,
      };
      state.entries.push(entry);
    }

    bumpState(state);
    await setLeaderboardStateJson(wheelId, state);
    return { statusCode: 201, body: JSON.stringify({ entry, state: toPublicLeaderboardState(state) }), headers };
  }

  if (event.httpMethod === "PUT") {
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }), headers };
    }
    if (!pinOk(config, body.pin)) {
      return { statusCode: 403, body: JSON.stringify({ error: "Invalid moderator PIN" }), headers };
    }

    const state = await getLeaderboardStateJson(wheelId);
    const action = body.action;
    const now = new Date().toISOString();

    if (action === "add_entry") {
      const displayName = String(body.displayName || "").trim().slice(0, 64);
      const score = Number(body.score);
      if (!displayName) {
        return { statusCode: 400, body: JSON.stringify({ error: "displayName required" }), headers };
      }
      if (!Number.isFinite(score)) {
        return { statusCode: 400, body: JSON.stringify({ error: "score required" }), headers };
      }
      state.entries.push({
        id: randomUUID(),
        displayName,
        score,
        source: "manual",
        rankTieAt: now,
        createdAt: now,
        updatedAt: now,
      });
    } else if (action === "update_entry" && body.id) {
      const i = state.entries.findIndex((e) => e.id === body.id);
      if (i < 0) return { statusCode: 404, body: JSON.stringify({ error: "Entry not found" }), headers };
      const prev = state.entries[i];
      const next = { ...prev, updatedAt: now };
      if (body.displayName !== undefined) next.displayName = String(body.displayName).trim().slice(0, 64);
      if (body.score !== undefined) {
        next.score = Number(body.score);
        if (!Number.isFinite(next.score)) {
          return { statusCode: 400, body: JSON.stringify({ error: "Invalid score" }), headers };
        }
        next.rankTieAt = now;
      }
      state.entries[i] = next;
    } else if (action === "remove_entry" && body.id) {
      state.entries = state.entries.filter((e) => e.id !== body.id);
    } else if (action === "set_pan") {
      state.panOffset = Math.max(0, Number(body.offset) || 0);
    } else if (action === "clear_entries") {
      state.entries = [];
      state.panOffset = 0;
      state.clearedAt = now;
    } else {
      return { statusCode: 400, body: JSON.stringify({ error: "Unknown action" }), headers };
    }

    bumpState(state);
    await setLeaderboardStateJson(wheelId, state);
    return { statusCode: 200, body: JSON.stringify({ state: toPublicLeaderboardState(state) }), headers };
  }

  return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }), headers };
};
