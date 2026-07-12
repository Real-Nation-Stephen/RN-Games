import { connectLambda } from "@netlify/blobs";
import { requireAuth } from "./lib/auth.mjs";
import { replayBlobEventsToDb, recordReplayRun } from "./lib/event-ingest.mjs";
import { isMeasurementDbEnabled } from "./lib/db.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function parseBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    return {};
  }
}

export const handler = async (event, context) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }), headers };
  }

  const deny = requireAuth(event, context);
  if (deny) return { ...deny, headers: { ...headers, ...deny.headers } };

  if (!isMeasurementDbEnabled()) {
    return {
      statusCode: 503,
      body: JSON.stringify({ error: "Measurement database ingest is disabled" }),
      headers,
    };
  }

  const body = parseBody(event);
  const hours = Math.min(168, Math.max(1, Number(body.hours) || 48));
  const dryRun = body.dryRun === true;

  try {
    const summary = await replayBlobEventsToDb({ hours, dryRun });
    const runId = dryRun ? null : await recordReplayRun(summary);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        dryRun,
        runId,
        ...summary,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e instanceof Error ? e.message : "Replay failed" }),
    };
  }
};
