import { connectBlobs } from "./lib/blob-runtime.mjs";
import { getLiveRunWithRetry, hydrateLiveRun, putLiveMedia, secretsEqual, updateLiveRun, writePresence } from "./lib/live-store.mjs";
import { applyParticipantAction, projectRun } from "./lib/live-run.mjs";
import { makeId as storeId } from "./lib/live-store.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, x-live-secret",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

const MAX_DATA_URL = 450_000;

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
    const participantId = String(body.participantId || "").trim();
    const secret = String(body.secret || "").trim();
    const action = String(body.action || "").trim();
    if (!code || !participantId || !secret || !action) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "code, participantId, secret, action required" }) };
    }
    const existing = await getLiveRunWithRetry(code);
    if (!existing) return { statusCode: 404, headers, body: JSON.stringify({ error: "Run not found" }) };
    const p = existing.participants?.[participantId];
    if (!p || !secretsEqual(String(p.secret || ""), secret)) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: "Forbidden" }) };
    }

    if (action === "heartbeat") {
      await writePresence(code, participantId);
      const run = await hydrateLiveRun(code);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          result: { ok: true },
          state: projectRun(run, "participant", participantId),
        }),
      };
    }

    if (action === "submit" && body.imageDataUrl) {
      const dataUrl = String(body.imageDataUrl);
      if (!dataUrl.startsWith("data:image/") || dataUrl.length > MAX_DATA_URL) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Image too large or invalid" }) };
      }
      const mediaId = storeId();
      await putLiveMedia(existing.runId, mediaId, {
        runId: existing.runId,
        mediaId,
        dataUrl,
        participantId,
        createdAt: new Date().toISOString(),
      });
      body.mediaId = mediaId;
      body.kind = "photo";
    }

    let result = {};
    const run = await updateLiveRun(code, (current) => {
      result = applyParticipantAction(current, participantId, action, body);
      if (result?.duplicate) return null;
      return current;
    });
    await writePresence(code, participantId);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        result,
        state: projectRun(run, "participant", participantId),
      }),
    };
  } catch (e) {
    const status = e.statusCode || 500;
    return {
      statusCode: status,
      headers,
      body: JSON.stringify({ error: e instanceof Error ? e.message : "Failed", code: e.code || undefined }),
    };
  }
};
