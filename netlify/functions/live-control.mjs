import { connectBlobs } from "./lib/blob-runtime.mjs";
import { getLiveRunWithRetry, secretsEqual, updateLiveRun } from "./lib/live-store.mjs";
import { applyControl, projectRun } from "./lib/live-run.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, x-live-secret",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

function connect(event) {
  connectBlobs(event);
}

export const handler = async (event) => {
  connect(event);
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...headers, "Access-Control-Allow-Methods": "POST, OPTIONS" } };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const code = String(body.code || "").trim().toUpperCase();
    const hostKey = String(body.hostKey || "").trim();
    const action = String(body.action || "").trim();
    if (!code || !hostKey || !action) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "code, hostKey, action required" }) };
    }
    const existing = await getLiveRunWithRetry(code);
    if (!existing) return { statusCode: 404, headers, body: JSON.stringify({ error: "Run not found" }) };
    if (!secretsEqual(String(existing.hostKey || ""), hostKey)) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: "Forbidden" }) };
    }

    let result = {};
    const run = await updateLiveRun(code, (current) => {
      result = applyControl(current, action, body);
      if (result?.duplicate) return null;
      return current;
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        result,
        state: projectRun(run, "moderator", null),
      }),
    };
  } catch (e) {
    const status = e.statusCode || 500;
    return {
      statusCode: status,
      headers,
      body: JSON.stringify({
        error: e instanceof Error ? e.message : "Failed",
        code: e.code || undefined,
        eligibleCount: e.eligibleCount,
      }),
    };
  }
};
