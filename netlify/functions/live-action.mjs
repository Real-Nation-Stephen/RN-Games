import { connectBlobs } from "./lib/blob-runtime.mjs";
import { asNetlifyFunction } from "./lib/netlify-v2.mjs";
import { getLiveRunWithRetry, hydrateLiveRun, putLiveMedia, secretsEqual, updateLiveRun, writePresence } from "./lib/live-store.mjs";
import { applyParticipantAction, projectRun, assertAttempt } from "./lib/live-run.mjs";
import { isPostgresRun, postgresAction } from './lib/live-postgres.mjs';
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

    if (action === "heartbeat" || action === "ready") {
      if (action === 'ready') {
        assertAttempt(existing, body);
        if (existing.node?.kind !== 'fill-game') throw Object.assign(new Error('Not a Fill round'),{statusCode:400});
      }
      await writePresence(code, participantId, action === 'ready' ? existing.roundAttemptId : null);
      // A heartbeat needs an acknowledgement, not another full room/presence read.
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          result: { ok: true },
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

    const fast = isPostgresRun(existing) && (
      (existing.node?.kind === 'fill-game' && action === 'answer') ||
      (existing.node?.kind === 'mini-poll' && action === 'vote') ||
      (existing.node?.kind === 'pinboard' && action === 'submit')
    );
    if (fast) {
      const {run,result} = await postgresAction(code, action, participantId, secret, body);
      return {statusCode:200,headers,body:JSON.stringify({result,state:projectRun(run,'participant',participantId)})};
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
}

export default asNetlifyFunction(lambdaHandler);
