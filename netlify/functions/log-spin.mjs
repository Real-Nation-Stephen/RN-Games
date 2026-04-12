import { connectLambda } from "@netlify/blobs";
import { readIndex, getWheelJson, setWheelJson } from "./lib/blobs.mjs";
import {
  appendSpinRowToTab,
  ensureWheelReportingTab,
  sanitizeSheetTabName,
} from "./lib/sheets.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...headers, "Access-Control-Allow-Methods": "POST, OPTIONS" } };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }), headers };
  }

  if (!process.env.GOOGLE_SHEET_ID) {
    return {
      statusCode: 503,
      body: JSON.stringify({ error: "Reporting not configured on server" }),
      headers,
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { slug, segmentIndex, prizeLabel, outcome } = body;
    if (!slug || segmentIndex === undefined) {
      return { statusCode: 400, body: JSON.stringify({ error: "slug and segmentIndex required" }), headers };
    }

    const list = await readIndex();
    const item = list.find((x) => x.slug === slug);
    if (!item) {
      return { statusCode: 404, body: JSON.stringify({ error: "Wheel not found" }), headers };
    }

    const wheel = await getWheelJson(item.id);
    if (!wheel || !wheel.reportingEnabled) {
      return { statusCode: 400, body: JSON.stringify({ error: "Reporting disabled for this wheel" }), headers };
    }

    const idx = Number(segmentIndex);
    if (idx < 0 || idx >= wheel.segmentCount) {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid segment" }), headers };
    }

    const tab = wheel.reportingSheetTab || sanitizeSheetTabName(wheel.slug, wheel.id);
    const row = {
      timestampUtc: new Date().toISOString(),
      wheelSlug: slug,
      wheelId: wheel.id,
      segmentIndex: idx,
      prizeLabel: String(prizeLabel ?? wheel.prizes[idx] ?? ""),
      outcome: outcome === "win" || outcome === true ? "win" : "lose",
      schemaVersion: wheel.prizeSchemaVersion ?? 1,
    };

    await ensureWheelReportingTab(tab, { prizeLabels: wheel.prizes || [] });
    await appendSpinRowToTab(tab, row);

    if (!wheel.reportingSheetTab) {
      wheel.reportingSheetTab = tab;
      await setWheelJson(wheel.id, wheel);
    }

    return { statusCode: 204, body: "", headers };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e instanceof Error ? e.message : "Log failed" }),
    };
  }
};
