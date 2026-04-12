import { connectLambda } from "@netlify/blobs";
import { readIndex } from "./lib/blobs.mjs";
import { readSpinRows } from "./lib/sheets.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

export const handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...headers, "Access-Control-Allow-Methods": "GET, OPTIONS" } };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }), headers };
  }

  if (!process.env.GOOGLE_SHEET_ID) {
    return {
      statusCode: 503,
      body: JSON.stringify({ error: "Reporting not configured" }),
      headers,
    };
  }

  const slug = event.queryStringParameters?.slug;
  const from = event.queryStringParameters?.from;
  const to = event.queryStringParameters?.to;

  if (!slug) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing slug" }), headers };
  }

  const list = await readIndex();
  const item = list.find((x) => x.slug === slug);
  if (!item || !item.reportingEnabled) {
    return { statusCode: 404, body: JSON.stringify({ error: "Report not available" }), headers };
  }

  try {
    const rows = await readSpinRows();
    const fromMs = from ? Date.parse(from) : 0;
    const toMs = to ? Date.parse(to) : Number.MAX_SAFE_INTEGER;

    const filtered = rows.filter((r) => {
      if (r.wheel_slug !== slug) return false;
      const t = Date.parse(r.timestamp_utc);
      if (Number.isNaN(t)) return false;
      return t >= fromMs && t <= toMs;
    });

    /** @type {Record<string, number>} */
    const counts = {};
    for (const r of filtered) {
      const label = r.prize_label || "Unknown";
      counts[label] = (counts[label] || 0) + 1;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        slug,
        total: filtered.length,
        counts,
        from: from || null,
        to: to || null,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e instanceof Error ? e.message : "Report failed" }),
    };
  }
};
