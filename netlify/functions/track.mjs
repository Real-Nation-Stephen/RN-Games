import { connectLambda } from "@netlify/blobs";
import { blobStore } from "./lib/store.mjs";

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

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }), headers };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const events = Array.isArray(body.events) ? body.events : body.type ? [body] : [];
    if (!events.length) {
      return { statusCode: 400, body: JSON.stringify({ error: "No events" }), headers };
    }

    const st = await blobStore();
    const hour = new Date().toISOString().slice(0, 13);
    const key = `track-log:${hour}`;
    const raw = await st.get(key, { type: "json" });
    const list = Array.isArray(raw?.events) ? raw.events : [];
    const stamped = events.map((ev) => ({
      ...ev,
      timestamp: ev.timestamp || new Date().toISOString(),
    }));
    list.push(...stamped);
    const trimmed = list.slice(-5000);
    await st.setJSON(key, { events: trimmed, updatedAt: new Date().toISOString() });

    return { statusCode: 202, body: JSON.stringify({ ok: true, count: stamped.length }), headers };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e instanceof Error ? e.message : "Server error" }),
    };
  }
};
