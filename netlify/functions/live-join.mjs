import { connectBlobs } from "./lib/blob-runtime.mjs";
import { asNetlifyFunction } from "./lib/netlify-v2.mjs";
import { getActiveRunCode, getLiveRunWithRetry, updateLiveRun, writePresence } from "./lib/live-store.mjs";
import { heartbeat, joinParticipant, loadExperienceBySlug, projectRun } from "./lib/live-run.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, x-live-secret",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

function connect(event) {
  connectBlobs(event);
}

export async function lambdaHandler(event) {
  connect(event);
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...headers, "Access-Control-Allow-Methods": "POST, OPTIONS" } };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    let code = String(body.code || "").trim().toUpperCase();
    const slug = String(body.slug || "").trim().toLowerCase();
    if (!code && slug) {
      const experience = await loadExperienceBySlug(slug);
      if (!experience) return { statusCode: 404, headers, body: JSON.stringify({ error: "Flow not found" }) };
      code = await getActiveRunCode(experience.id);
    }
    if (!code) return { statusCode: 400, headers, body: JSON.stringify({ error: "code or slug required" }) };

    const exists = await getLiveRunWithRetry(code);
    if (!exists) return { statusCode: 404, headers, body: JSON.stringify({ error: "Run not found" }) };

    let joined = null;
    const run = await updateLiveRun(code, (current) => {
      joined = joinParticipant(current, body.participantId || "", body.secret || "");
      heartbeat(current, joined.id);
      return current;
    });
    await writePresence(code, joined.id);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        participantId: joined.id,
        secret: joined.secret,
        participantNumber: joined.number,
        code: run.code,
        state: projectRun(run, "participant", joined.id),
      }),
    };
  } catch (e) {
    const status = e.statusCode || 500;
    return { statusCode: status, headers, body: JSON.stringify({ error: e instanceof Error ? e.message : "Failed" }) };
  }
}

export default asNetlifyFunction(lambdaHandler);
