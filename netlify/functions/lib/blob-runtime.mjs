/**
 * Unified blob/CAS runtime for live runs AND platform config/seed/media.
 * Local isolation uses memory or file stores for every named namespace.
 * Hosted deploy contexts cannot enable memory/file drivers or unsigned probes.
 */

import path from "node:path";
import { getStore, setEnvironmentContext } from "@netlify/blobs";
import {
  createFileCasStore,
  createMemoryCasStore,
  defaultFileStoreDir,
  probeConditionalWrites,
  wrapBlobsCasStore,
} from "./cas-store.mjs";

/**
 * Installed SDK defaults getStore({ name }) to eventual (main.cjs Client.consistency).
 * Live CAS probe + getWithMetadata-before-onlyIfMatch need strong reads or they see
 * stale misses (false 503) and stale etags (extra 409). Scoped to the live store only:
 * platform config/media is not CAS-probed, and forcing strong there would fail closed
 * in contexts without uncachedEdgeURL even when live is unused.
 */
export const LIVE_BLOBS_CONSISTENCY = "strong";

const PLATFORM = "rngames-platform";
const memoryByName = new Map();
const fileByName = new Map();
const blobsByName = new Map();

function hooks() {
  return globalThis.__RN_LIVE_TEST__ || {};
}

function headerValue(event, name) {
  const headers = event?.headers || {};
  const want = String(name).toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === want) return String(value || "");
  }
  return "";
}

function decodeBlobsContext(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && !(raw instanceof Buffer)) return raw;
  if (typeof raw !== "string" || !raw) return {};
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
}

/** SDK EnvironmentContext field only — do not guess uncachedURL / uncached_url. */
function uncachedEdgeURLFrom(obj) {
  if (!obj || typeof obj !== "object") return "";
  return typeof obj.uncachedEdgeURL === "string" ? obj.uncachedEdgeURL : "";
}

function readBlobsEnvContext() {
  const raw = process.env.NETLIFY_BLOBS_CONTEXT || globalThis.netlifyBlobsContext || "";
  return decodeBlobsContext(raw);
}

export function liveBlobsStrongUnavailableError(detail) {
  const extra = detail ? ` ${detail}` : "";
  const err = new Error(
    `Live runs need Netlify Blobs strong consistency (EnvironmentContext.uncachedEdgeURL).${extra} Live store will not fall back to eventual reads.`,
  );
  err.statusCode = 503;
  err.code = "live_blobs_strong_unavailable";
  return err;
}

/**
 * Hosted Lambda/Netlify Functions must never use the local file driver, even when
 * CONTEXT is unset. Isolated QA and `netlify dev` are not hosted.
 */
export function hostedRemoteContext() {
  if (process.env.NETLIFY_DEV === "true") return false;
  if (process.env.RN_ISOLATED_QA === "1") return false;
  const ctx = String(process.env.CONTEXT || "");
  if (ctx === "dev") return false;
  if (ctx === "production" || ctx === "deploy-preview" || ctx === "branch-deploy") return true;
  if (process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT || process.env.AWS_EXECUTION_ENV) {
    return true;
  }
  return false;
}

/**
 * Functions v2 initializes NETLIFY_BLOBS_CONTEXT (including uncachedEdgeURL) before
 * user code. Stock connectLambda (SDK 11.1) copies { deployID, edgeURL, siteID, token }
 * from Lambda event.blobs `{ token, url }` and drops uncachedEdgeURL.
 *
 * If the event has no blobs payload, leave the v2 context intact. If Lambda blobs
 * arrive, restore uncachedEdgeURL only from the prior EnvironmentContext field.
 * Ignore non-string blobs (isolated QA sets `{ isolated: true }`). Do not invent
 * uncachedURL fields or endpoint hostnames.
 */
export function connectBlobs(event) {
  const prior = readBlobsEnvContext();
  const payload = typeof event?.blobs === "string" ? decodeBlobsContext(event.blobs) : {};
  const hasPayload = !!(payload.token || payload.url);
  if (!hasPayload) return;
  setEnvironmentContext({
    apiURL: prior.apiURL,
    deployID: headerValue(event, "x-nf-deploy-id") || prior.deployID,
    edgeURL: payload.url || prior.edgeURL,
    primaryRegion: prior.primaryRegion,
    siteID: headerValue(event, "x-nf-site-id") || prior.siteID,
    token: payload.token || prior.token,
    uncachedEdgeURL: uncachedEdgeURLFrom(prior) || undefined,
  });
}

export function blobsHasUncachedEdge() {
  return !!uncachedEdgeURLFrom(readBlobsEnvContext());
}

function sanitizeName(name) {
  return String(name || "store").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64);
}

export function isolationDriver() {
  if (hostedRemoteContext()) return "";
  const d = String(process.env.LIVE_STORE_DRIVER || "").trim();
  if (d === "memory" || d === "file") return d;
  if (process.env.RN_ISOLATED_QA === "1") return "file";
  if (hooks().store) return "memory-test";
  return "";
}

export function platformStoreName() {
  if (process.env.PLATFORM_BLOB_STORE) return String(process.env.PLATFORM_BLOB_STORE);
  if (isolationDriver()) return "rngames-platform-local";
  return PLATFORM;
}

export function liveStoreName() {
  if (process.env.LIVE_BLOB_STORE) return String(process.env.LIVE_BLOB_STORE);
  if (isolationDriver() || !hostedRemoteContext()) return "rngames-live-local";
  return "rngames-live";
}

export function blobsStoreOptions(name) {
  if (name === liveStoreName()) {
    return { name, consistency: LIVE_BLOBS_CONSISTENCY };
  }
  return { name };
}

export function blobsWrapOptions(name) {
  if (name === liveStoreName()) {
    return { readConsistency: LIVE_BLOBS_CONSISTENCY };
  }
  return {};
}

export function assertLiveBlobsStrongConsistency(name) {
  if (name !== liveStoreName()) return;
  if (isolationDriver()) return;
  if (blobsHasUncachedEdge()) return;
  throw liveBlobsStrongUnavailableError(
    "connectLambda dropped it or NETLIFY_BLOBS_CONTEXT is missing it.",
  );
}

function blobsEndpointHint() {
  const raw = process.env.NETLIFY_BLOBS_CONTEXT || process.env.NETLIFY_BLOBS_URL || "";
  if (!raw) return "";
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    return String(parsed.url || parsed.edgeURL || parsed.unauthenticatedEdgeURL || "");
  } catch {
    try {
      const parsed = JSON.parse(raw);
      return String(parsed.url || parsed.edgeURL || "");
    } catch {
      return String(raw);
    }
  }
}

export function inspectStorageConfig() {
  const driver = isolationDriver() || String(process.env.LIVE_STORE_DRIVER || "").trim();
  const endpoint = blobsEndpointHint();
  const productionEndpoint = /netlify\.com|amazonaws\.com/i.test(endpoint);
  const isolated = !!isolationDriver();
  const liveName = liveStoreName();
  const platformName = platformStoreName();
  const siteId = String(process.env.SITE_ID || process.env.NETLIFY_SITE_ID || "");
  const hosted = hostedRemoteContext();
  const requested = String(process.env.LIVE_STORE_DRIVER || "").trim();

  let blocked = false;
  let blockReason = null;

  if (hosted && (requested === "memory" || requested === "file")) {
    blocked = true;
    blockReason = "memory/file stores cannot be enabled on hosted deploy contexts";
  } else if (!hosted && !isolated && productionEndpoint && process.env.LIVE_ALLOW_PROD !== "1") {
    blocked = true;
    blockReason =
      "Blob endpoint looks like production; use LIVE_STORE_DRIVER=memory|file, PLATFORM_BLOB_STORE=rngames-platform-local, LIVE_BLOB_STORE=rngames-live-local";
  } else if (liveName === PLATFORM) {
    blocked = true;
    blockReason = "Live run state must not use rngames-platform";
  } else if (isolated && platformName === PLATFORM) {
    blocked = true;
    blockReason = "Isolated QA must not use rngames-platform for config/seed";
  }

  return {
    driver: driver || "(auto)",
    storeName: liveName,
    liveStoreName: liveName,
    platformStore: PLATFORM,
    platformStoreName: platformName,
    endpoint: endpoint || "(unset)",
    siteId: siteId || "(unset)",
    productionContext: hosted,
    netlifyDev: process.env.NETLIFY_DEV === "true",
    isolated,
    productionEndpoint,
    blocked,
    blockReason,
    liveBlobsConsistency: LIVE_BLOBS_CONSISTENCY,
    platformBlobsConsistency: "eventual",
  };
}

export function assertStorageAllowed() {
  const cfg = inspectStorageConfig();
  if (cfg.blocked) {
    const err = new Error(cfg.blockReason || "Storage guard blocked");
    err.statusCode = 503;
    throw err;
  }
  return cfg;
}

export function resetRuntimeStores() {
  memoryByName.clear();
  fileByName.clear();
  blobsByName.clear();
}

export async function getRuntimeStore(name) {
  assertStorageAllowed();
  const hookStore = hooks().store;
  if (hookStore) return hookStore;

  const driver = isolationDriver();
  if (driver === "memory") {
    if (!memoryByName.has(name)) memoryByName.set(name, createMemoryCasStore());
    return memoryByName.get(name);
  }
  if (driver === "file") {
    if (!fileByName.has(name)) {
      const root = process.env.LIVE_CAS_DIR || defaultFileStoreDir();
      fileByName.set(name, createFileCasStore(path.join(root, sanitizeName(name))));
    }
    return fileByName.get(name);
  }

  if (blobsByName.has(name)) return blobsByName.get(name);

  const liveName = liveStoreName();
  if (name === liveName && !blobsHasUncachedEdge()) {
    if (hostedRemoteContext()) throw liveBlobsStrongUnavailableError();
    const root = process.env.LIVE_CAS_DIR || defaultFileStoreDir();
    const file = createFileCasStore(path.join(root, sanitizeName(name)));
    blobsByName.set(name, file);
    return file;
  }

  if (name === liveName) assertLiveBlobsStrongConsistency(name);

  const wrapped = wrapBlobsCasStore(getStore(blobsStoreOptions(name)), name, blobsWrapOptions(name));
  if (name === liveName) {
    const cas = await probeConditionalWrites(wrapped);
    if (!cas.ok) {
      const err = new Error(
        `Netlify Blobs conditional writes are unavailable (${cas.reason || "unknown"}). Live runs refuse unsafe overwrites.`,
      );
      err.statusCode = 503;
      if (hostedRemoteContext()) throw err;
      const root = process.env.LIVE_CAS_DIR || defaultFileStoreDir();
      const file = createFileCasStore(path.join(root, sanitizeName(name)));
      blobsByName.set(name, file);
      return file;
    }
  }
  blobsByName.set(name, wrapped);
  return wrapped;
}
