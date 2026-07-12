import { connectLambda } from "@netlify/blobs";
import { ingestEvents } from "./lib/event-ingest.mjs";

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
    const events = Array.isArray(body.events) ? body.events : body.eventId || body.type || body.eventName ? [body] : [];
    if (!events.length) {
      return { statusCode: 400, body: JSON.stringify({ error: "No events" }), headers };
    }

    const results = await ingestEvents(events);
    const accepted = results.filter((r) => r.ok).length;
    const rejected = results.filter((r) => !r.ok).length;

    return {
      statusCode: 202,
      body: JSON.stringify({
        ok: true,
        count: events.length,
        accepted,
        rejected,
        results,
      }),
      headers,
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e instanceof Error ? e.message : "Server error" }),
    };
  }
};
