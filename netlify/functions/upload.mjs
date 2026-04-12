import { connectLambda } from "@netlify/blobs";
import { requireAuth } from "./lib/auth.mjs";
import { saveBinary } from "./lib/files.mjs";

const MAX_BYTES = 12 * 1024 * 1024;

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

  try {
    const body = JSON.parse(event.body || "{}");
    const { base64, contentType, filename } = body;
    if (!base64 || typeof base64 !== "string") {
      return { statusCode: 400, body: JSON.stringify({ error: "base64 required" }), headers };
    }
    const buf = Buffer.from(base64, "base64");
    if (buf.length > MAX_BYTES) {
      return { statusCode: 400, body: JSON.stringify({ error: "File too large (max 12MB)" }), headers };
    }
    const id = await saveBinary(buf, contentType || "application/octet-stream");
    const site = process.env.URL || "";
    const url = `${site}/api/file?id=${encodeURIComponent(id)}`;
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
