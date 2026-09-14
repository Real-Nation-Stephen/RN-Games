/**
 * Unified blob/CAS runtime for live runs AND platform config/seed/media.
 * Local isolation uses memory or file stores for every named namespace.
 * Hosted deploy contexts cannot enable memory/file drivers or unsigned probes.
 */

import path from "node:path";
import { getStore } from "@netlify/blobs";
import {
  createFileCasStore,
  createMemoryCasStore,
  defaultFileStoreDir,
  probeConditionalWrites,
  wrapBlobsCasStore,
} from "./cas-store.mjs";

const PLATFORM = "rngames-platform";
const memoryByName = new Map();
const fileByName = new Map();
const blobsByName = new Map();

function hooks() {
  return globalThis.__RN_LIVE_TEST__ || {};
}

export function hostedRemoteContext() {
  const ctx = String(process.env.CONTEXT || "");
  return ctx === "production" || ctx === "deploy-preview" || ctx === "branch-deploy";
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

  const wrapped = wrapBlobsCasStore(getStore({ name }), name);
  const liveName = liveStoreName();
  if (name === liveName) {
    const cas = await probeConditionalWrites(wrapped);
    if (!cas.ok) {
      if (hostedRemoteContext()) {
        const err = new Error(
          `Netlify Blobs conditional writes are unavailable (${cas.reason || "unknown"}). Live runs refuse unsafe overwrites.`,
        );
        err.statusCode = 503;
        throw err;
      }
      const root = process.env.LIVE_CAS_DIR || defaultFileStoreDir();
      const file = createFileCasStore(path.join(root, sanitizeName(name)));
      blobsByName.set(name, file);
      return file;
    }
  }
  blobsByName.set(name, wrapped);
  return wrapped;
}
