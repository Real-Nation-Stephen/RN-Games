import { connectBlobs } from "./lib/blob-runtime.mjs";
import { asNetlifyFunction } from "./lib/netlify-v2.mjs";
import { requireOperatorAuth } from "./lib/auth.mjs";
import { getQueryParam } from "./lib/query.mjs";
import {
  createActivatedLiveRun,
  getActiveRunCode,
  getLiveRun,
  hydrateLiveRun,
  makeSecret,
  secretsEqual,
} from "./lib/live-store.mjs";
import { buildSnapshot, createRunDocument, loadExperienceBySlug, projectRun } from "./lib/live-run.mjs";
import { makeRoomCode as storeCode } from "./lib/live-store.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, x-live-secret",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

function connect(event) {
  connectBlobs(event);
}

function readSecret(event) {
  return String(
    getQueryParam(event, "secret") ||
      event.headers?.["x-live-secret"] ||
      event.headers?.["X-Live-Secret"] ||
      "",
  ).trim();
}

export async function lambdaHandler(event, context) {
  connect(event);
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...headers, "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } };
  }

  try {
    if (event.httpMethod === "GET") {
      const code = String(getQueryParam(event, "code") || "").trim().toUpperCase();
      const slug = String(getQueryParam(event, "slug") || "").trim().toLowerCase();
      const rev = String(getQueryParam(event, "rev") || "");
      const role = String(getQueryParam(event, "role") || "public");
      const participantId = String(getQueryParam(event, "participantId") || "");
      const hostKey = String(getQueryParam(event, "hostKey") || "");
      const secret = readSecret(event);

      let resolved = code;
      if (!resolved && slug) {
        const experience = await loadExperienceBySlug(slug);
        if (!experience) return { statusCode: 404, headers, body: JSON.stringify({ error: "Flow not found" }) };
        resolved = await getActiveRunCode(experience.id);
      }
      if (!resolved) return { statusCode: 404, headers, body: JSON.stringify({ error: "No active run" }) };

      const run = await hydrateLiveRun(resolved);
      if (!run) return { statusCode: 404, headers, body: JSON.stringify({ error: "Run not found" }) };

      if (role === "moderator") {
        if (!hostKey || !secretsEqual(hostKey, String(run.hostKey || ""))) {
          return { statusCode: 403, headers, body: JSON.stringify({ error: "Forbidden" }) };
        }
      }

      if (role === "participant") {
        const p = run.participants?.[participantId];
        if (!participantId || !secret || !p || !secretsEqual(secret, String(p.secret || ""))) {
          return { statusCode: 403, headers, body: JSON.stringify({ error: "Forbidden" }) };
        }
      }

      const projRole = role === "moderator" ? "moderator" : role === "participant" ? "participant" : "public";
      const state = projectRun(run, projRole, projRole === "participant" ? participantId : null);
      if (rev && rev === String(state.viewToken || "")) {
        return { statusCode: 200, headers, body: JSON.stringify({ changed: false, state: null }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ changed: true, state }) };
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const slug = String(body.slug || "").trim().toLowerCase();
      if (!slug) return { statusCode: 400, headers, body: JSON.stringify({ error: "slug required" }) };
      const experience = await loadExperienceBySlug(slug);
      if (!experience) return { statusCode: 404, headers, body: JSON.stringify({ error: "Flow not found" }) };
      if (!experience.foundation?.interactive) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "This flow is not interactive" }) };
      }

      const operator = await requireOperatorAuth(event, context);
      const hasOperator = !operator.error;
      const providedKey = String(body.hostKey || "");

      const existingCode = await getActiveRunCode(experience.id);
      const existing = existingCode ? await getLiveRun(existingCode) : null;
      const hostOk = !!(existing && providedKey && secretsEqual(providedKey, String(existing.hostKey || "")));

      if (existing && existing.status !== "superseded" && !body.forceNew) {
        if (hostOk || hasOperator) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              code: existing.code,
              hostKey: existing.hostKey,
              runId: existing.runId,
              reused: true,
              state: projectRun(existing, "moderator", null),
            }),
          };
        }
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({
            error: "A live run is already active. Open the original Flow Master from Studio or start a new run.",
            code: existing.code,
            runId: existing.runId,
          }),
        };
      }

      const resetting = !!(existing && body.forceNew);
      if (resetting) {
        if (!hostOk && !hasOperator) {
          return { statusCode: 403, headers, body: JSON.stringify({ error: "Forbidden" }) };
        }
      } else if (!hasOperator) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
      }

      const snapshot = await buildSnapshot(experience);
      let run = null;
      for (let i = 0; i < 8; i++) {
        const code = storeCode();
        if (await getLiveRun(code)) continue;
        const candidate = createRunDocument({ experience, snapshot, hostKey: makeSecret(), code });
        try {
          await createActivatedLiveRun(candidate, {
            experienceId: experience.id,
            previousCode: existingCode || "",
          });
          run = candidate;
          break;
        } catch (e) {
          if (i < 7 && /already exists/i.test(e.message || "")) continue;
          throw e;
        }
      }
      if (!run) throw Object.assign(new Error("Could not create live run"), { statusCode: 500 });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          code: run.code,
          hostKey: run.hostKey,
          runId: run.runId,
          state: projectRun(run, "moderator", null),
        }),
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (e) {
    const status = e.statusCode || 500;
    return { statusCode: status, headers, body: JSON.stringify({ error: e instanceof Error ? e.message : "Failed" }) };
  }
}

export default asNetlifyFunction(lambdaHandler);
