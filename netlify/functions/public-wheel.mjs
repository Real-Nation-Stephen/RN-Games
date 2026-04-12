import { connectLambda } from "@netlify/blobs";
import { readIndex, getWheelJson } from "./lib/blobs.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

/** Strip fields not needed client-side */
function toPublicWheel(w) {
  return {
    id: w.id,
    title: w.title,
    slug: w.slug,
    faviconUrl: w.faviconUrl || "",
    segmentCount: w.segmentCount,
    prizes: w.prizes,
    segmentOutcome: w.segmentOutcome,
    weights: w.weights,
    useWeightedSpin: w.useWeightedSpin,
    wheelRotationOffsetDeg: w.wheelRotationOffsetDeg,
    assets: w.assets,
    sounds: w.sounds,
    spin: w.spin,
    landscape: w.landscape,
    reportingEnabled: w.reportingEnabled,
    prizeSchemaVersion: w.prizeSchemaVersion,
    showPoweredBy: w.showPoweredBy !== false,
  };
}

export const handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...headers, "Access-Control-Allow-Methods": "GET, OPTIONS" } };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }), headers };
  }
  const slug = event.queryStringParameters?.slug;
  if (!slug) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing slug" }), headers };
  }
  const list = await readIndex();
  const item = list.find((x) => x.slug === slug);
  if (!item) {
    return { statusCode: 404, body: JSON.stringify({ error: "Wheel not found" }), headers };
  }
  const wheel = await getWheelJson(item.id);
  if (!wheel) {
    return { statusCode: 404, body: JSON.stringify({ error: "Wheel not found" }), headers };
  }
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(toPublicWheel(wheel)),
  };
};
