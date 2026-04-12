import { randomUUID } from "node:crypto";
import { connectLambda } from "@netlify/blobs";
import { requireAuth } from "./lib/auth.mjs";
import {
  readIndex,
  writeIndex,
  getWheelJson,
  setWheelJson,
  deleteWheelBlob,
} from "./lib/blobs.mjs";
import { validateSlug } from "./lib/validate.mjs";
import { ensureWheelReportingTab, sanitizeSheetTabName } from "./lib/sheets.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function emptyWheelRecord(id, slug) {
  const n = 12;
  return {
    id,
    title: "Untitled wheel",
    clientName: "",
    slug,
    updatedAt: new Date().toISOString(),
    reportingEnabled: false,
    reportingLockedAt: null,
    prizeSchemaVersion: 1,
    segmentCount: n,
    prizes: Array.from({ length: n }, (_, i) => `Prize ${i + 1}`),
    segmentOutcome: Array.from({ length: n }, (_, i) => i % 2 === 1),
    weights: null,
    useWeightedSpin: false,
    wheelRotationOffsetDeg: 0,
    assets: {
      logo: "",
      headline: "",
      button: "",
      restart: "",
      background: "",
      wheel: "",
      frame: "",
      winPanel: "",
      losePanel: "",
      segmentPanels: null,
    },
    sounds: {
      spin: null,
      segmentReveal: Array.from({ length: n }, () => null),
      music: null,
      musicVolume: 0.35,
    },
    spin: {
      minFullRotations: 5,
      maxFullRotations: 8,
      durationMs: 4500,
      easing: "cubic-bezier(0.15, 0.85, 0.2, 1)",
    },
    landscape: { minAspectRatio: 1.25 },
    thumbnailUrl: "",
    faviconUrl: "",
    reportingSheetTab: "",
    showPoweredBy: true,
  };
}

function syncSegmentArrays(w) {
  const n = w.segmentCount;
  w.prizes = Array.from({ length: n }, (__, i) => w.prizes[i] ?? `Prize ${i + 1}`);
  w.segmentOutcome = Array.from({ length: n }, (__, i) =>
    w.segmentOutcome[i] !== undefined ? w.segmentOutcome[i] : i % 2 === 1,
  );
  if (w.weights && w.weights.length !== n) w.weights = null;
  w.sounds = w.sounds || {};
  w.sounds.segmentReveal = Array.from({ length: n }, (__, i) => w.sounds.segmentReveal?.[i] ?? null);
  const a = w.assets || (w.assets = {});
  if (Array.isArray(a.segmentPanels)) {
    a.segmentPanels = Array.from({ length: n }, (__, i) => a.segmentPanels[i] ?? null);
  }
}

export const handler = async (event, context) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: { ...headers, "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS" },
    };
  }

  const deny = requireAuth(event, context);
  if (deny) return { ...deny, headers: { ...headers, ...deny.headers } };

  try {
    if (event.httpMethod === "GET") {
      const id = event.queryStringParameters?.id;
      if (id) {
        const wheel = await getWheelJson(id);
        if (!wheel) {
          return { statusCode: 404, body: JSON.stringify({ error: "Not found" }), headers };
        }
        return { statusCode: 200, body: JSON.stringify(wheel), headers };
      }
      const list = await readIndex();
      return { statusCode: 200, body: JSON.stringify({ wheels: list }), headers };
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const slugCheck = validateSlug(body.slug || "wheel-" + randomUUID().slice(0, 8));
      if (!slugCheck.ok) {
        return { statusCode: 400, body: JSON.stringify({ error: slugCheck.error }), headers };
      }
      const list = await readIndex();
      if (list.some((x) => x.slug === slugCheck.slug)) {
        return { statusCode: 409, body: JSON.stringify({ error: "Slug already in use" }), headers };
      }
      const id = randomUUID();
      const wheel = emptyWheelRecord(id, slugCheck.slug);
      wheel.title = body.title || wheel.title;
      wheel.clientName = body.clientName || "";
      await setWheelJson(id, wheel);
      const entry = {
        id,
        slug: wheel.slug,
        title: wheel.title,
        clientName: wheel.clientName,
        updatedAt: wheel.updatedAt,
        reportingEnabled: wheel.reportingEnabled,
        thumbnailUrl: wheel.thumbnailUrl,
      };
      list.push(entry);
      await writeIndex(list);
      return { statusCode: 201, body: JSON.stringify({ wheel }), headers };
    }

    if (event.httpMethod === "PUT") {
      const body = JSON.parse(event.body || "{}");
      const id = body.id;
      if (!id) {
        return { statusCode: 400, body: JSON.stringify({ error: "id required" }), headers };
      }
      const existing = await getWheelJson(id);
      if (!existing) {
        return { statusCode: 404, body: JSON.stringify({ error: "Not found" }), headers };
      }

      if (body.slug && body.slug !== existing.slug) {
        const slugCheck = validateSlug(body.slug);
        if (!slugCheck.ok) {
          return { statusCode: 400, body: JSON.stringify({ error: slugCheck.error }), headers };
        }
        const list = await readIndex();
        if (list.some((x) => x.slug === slugCheck.slug && x.id !== id)) {
          return { statusCode: 409, body: JSON.stringify({ error: "Slug already in use" }), headers };
        }
        existing.slug = slugCheck.slug;
      }

      if (existing.reportingEnabled && existing.reportingLockedAt) {
        const schemaKeys = ["segmentCount", "prizes", "segmentOutcome"];
        for (const k of schemaKeys) {
          if (body[k] !== undefined && JSON.stringify(body[k]) !== JSON.stringify(existing[k])) {
            return {
              statusCode: 423,
              body: JSON.stringify({
                error:
                  "Prize/segment schema is locked while reporting is on. Turn off reporting to edit.",
              }),
              headers,
            };
          }
        }
      }

      const prevReporting = existing.reportingEnabled;

      const assign = [
        "title",
        "clientName",
        "segmentCount",
        "prizes",
        "segmentOutcome",
        "weights",
        "useWeightedSpin",
        "wheelRotationOffsetDeg",
        "assets",
        "sounds",
        "spin",
        "landscape",
        "thumbnailUrl",
        "reportingEnabled",
        "faviconUrl",
        "showPoweredBy",
      ];
      for (const k of assign) {
        if (body[k] !== undefined) existing[k] = body[k];
      }

      if (body.reportingEnabled === true && !existing.reportingLockedAt) {
        existing.reportingLockedAt = new Date().toISOString();
      }
      if (body.reportingEnabled === false) {
        existing.reportingLockedAt = null;
      }

      existing.updatedAt = new Date().toISOString();
      syncSegmentArrays(existing);

      if (existing.reportingEnabled && !prevReporting && process.env.GOOGLE_SHEET_ID) {
        try {
          const tab = sanitizeSheetTabName(existing.slug, existing.id);
          await ensureWheelReportingTab(tab, { prizeLabels: existing.prizes || [] });
          existing.reportingSheetTab = tab;
        } catch (err) {
          console.error("ensureWheelReportingTab failed", err);
        }
      }

      await setWheelJson(id, existing);

      const list = await readIndex();
      const idx = list.findIndex((x) => x.id === id);
      const entry = {
        id,
        slug: existing.slug,
        title: existing.title,
        clientName: existing.clientName,
        updatedAt: existing.updatedAt,
        reportingEnabled: existing.reportingEnabled,
        thumbnailUrl: existing.thumbnailUrl,
      };
      if (idx >= 0) list[idx] = entry;
      else list.push(entry);
      await writeIndex(list);

      return { statusCode: 200, body: JSON.stringify({ wheel: existing }), headers };
    }

    if (event.httpMethod === "DELETE") {
      const id = event.queryStringParameters?.id;
      if (!id) {
        return { statusCode: 400, body: JSON.stringify({ error: "id required" }), headers };
      }
      await deleteWheelBlob(id);
      const list = (await readIndex()).filter((x) => x.id !== id);
      await writeIndex(list);
      return { statusCode: 204, body: "", headers };
    }

    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }), headers };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e instanceof Error ? e.message : "Server error" }),
    };
  }
};
