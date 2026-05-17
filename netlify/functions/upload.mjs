import { connectLambda } from "@netlify/blobs";
import { requireAuth } from "./lib/auth.mjs";
import { saveBinary } from "./lib/files.mjs";

/** Raw file bytes after decode (stay under Netlify ~6MB request body with base64 + JSON). */
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_CHARS = 6 * 1024 * 1024;

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const handler = async (event, context) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...headers, "Access-Control-Allow-Methods": "POST, OPTIONS" } };
  }
  const deny = requireAuth(event, context);
  if (deny) return { ...deny, headers: { ...headers, ...deny.headers } };

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }), headers };
  }

  if (!event.blobs) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error:
          "Upload storage is not configured for this deploy (missing Netlify Blobs context). Redeploy the site or contact support.",
      }),
    };
  }

  const rawBody = event.body || "";
  if (rawBody.length > MAX_REQUEST_CHARS) {
    return {
      statusCode: 413,
      headers,
      body: JSON.stringify({
        error: "Upload too large. Use a smaller image (under ~3MB) or re-export as JPEG.",
      }),
    };
  }

  try {
    const body = JSON.parse(rawBody || "{}");
    const { base64, contentType, filename } = body;
    if (!base64 || typeof base64 !== "string") {
      return { statusCode: 400, body: JSON.stringify({ error: "base64 required" }), headers };
    }
    const buf = Buffer.from(base64, "base64");
    if (buf.length > MAX_BYTES) {
      return {
        statusCode: 413,
        headers,
        body: JSON.stringify({ error: "File too large (max 4MB). Try a smaller JPEG or PNG." }),
      };
    }
    const id = await saveBinary(buf, contentType || "application/octet-stream");
    /** Same-origin relative URL so saved wheels keep working across domains / deploy contexts. */
    const url = `/api/file?id=${encodeURIComponent(id)}`;
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ id, url, filename: filename || "file" }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e instanceof Error ? e.message : "Upload failed" }),
    };
  }
};
