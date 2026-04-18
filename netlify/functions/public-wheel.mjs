import { connectLambda } from "@netlify/blobs";
import { readIndex, getWheelJson } from "./lib/blobs.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

/** Strip fields not needed client-side */
function toPublicWheel(w) {
  return {
    gameType: "spinning-wheel",
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

function toPublicScratcher(s) {
  const winChance = Math.min(100, Math.max(0, Number(s.winChancePercent) || 50));
  const loseUrl = (s.assets?.bottomLose || "").trim();
  const winOnly = winChance >= 100 || !loseUrl;
  return {
    gameType: "scratcher",
    id: s.id,
    title: s.title,
    slug: s.slug,
    faviconUrl: s.faviconUrl || "",
    showPoweredBy: s.showPoweredBy !== false,
    scratcherFormat: s.scratcherFormat || "16x9",
    assets: {
      top: s.assets?.top || "",
      bottomWin: s.assets?.bottomWin || "",
      bottomLose: winOnly ? "" : loseUrl,
      button: s.assets?.button || "",
      backgroundImage: s.assets?.backgroundImage || "",
    },
    backgroundColor: s.backgroundColor || "#0a1628",
    sounds: {
      win: s.sounds?.win || null,
      lose: s.sounds?.lose || null,
    },
    winButtonUrl: s.winButtonUrl || "",
    clearThreshold: typeof s.clearThreshold === "number" ? s.clearThreshold : 0.97,
    winChancePercent: winOnly ? 100 : winChance,
    reportingEnabled: s.reportingEnabled,
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
    return { statusCode: 404, body: JSON.stringify({ error: "Game not found" }), headers };
  }
  const doc = await getWheelJson(item.id);
  if (!doc) {
    return { statusCode: 404, body: JSON.stringify({ error: "Game not found" }), headers };
  }
  const payload = doc.gameType === "scratcher" ? toPublicScratcher(doc) : toPublicWheel(doc);
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(payload),
  };
};
