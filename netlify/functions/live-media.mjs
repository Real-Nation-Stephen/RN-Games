import { connectLambda } from "@netlify/blobs";
import { getQueryParam } from "./lib/query.mjs";
import { getLiveMedia, getLiveRunWithRetry, secretsEqual } from "./lib/live-store.mjs";

const jsonHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
};

export const handler = async (event) => {
  try {
    connectLambda(event);
  } catch {
    /* local/test store */
  }
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...jsonHeaders, "Access-Control-Allow-Methods": "GET, OPTIONS" } };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: jsonHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const runId = String(getQueryParam(event, "runId") || "");
    const id = String(getQueryParam(event, "id") || "");
    const code = String(getQueryParam(event, "code") || "").trim().toUpperCase();
    const hostKey = String(getQueryParam(event, "hostKey") || "");
    if (!runId || !id) {
      return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ error: "runId and id required" }) };
    }

    const media = await getLiveMedia(runId, id);
    if (!media?.dataUrl) return { statusCode: 404, headers: jsonHeaders, body: JSON.stringify({ error: "Not found" }) };

    let allowed = false;
    if (code) {
      const run = await getLiveRunWithRetry(code);
      if (run && run.runId === runId) {
        const subs = run.node?.submissions || [];
        const sub = subs.find((s) => s.mediaId === id);
        if (sub?.status === "approved") allowed = true;
        if (hostKey && secretsEqual(hostKey, String(run.hostKey || ""))) allowed = true;
      }
    }
    if (!allowed) {
      return { statusCode: 403, headers: jsonHeaders, body: JSON.stringify({ error: "Forbidden" }) };
    }

    const match = String(media.dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) return { statusCode: 415, headers: jsonHeaders, body: JSON.stringify({ error: "Unsupported" }) };
    const buf = Buffer.from(match[2], "base64");
    return {
      statusCode: 200,
      headers: {
        "Content-Type": match[1],
        "Cache-Control": "private, max-age=60",
        "Access-Control-Allow-Origin": "*",
      },
      body: buf.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (e) {
    return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ error: e instanceof Error ? e.message : "Failed" }) };
  }
};
