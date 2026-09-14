import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  CasConflict,
} from "./cas-store.mjs";
import {
  assertStorageAllowed,
  getRuntimeStore,
  hostedRemoteContext,
  inspectStorageConfig,
  liveStoreName,
  resetRuntimeStores,
} from "./blob-runtime.mjs";

const PREFIX = "liverun:";
const ACTIVE_PREFIX = "liverun-active:";
const MEDIA_PREFIX = "liverun-media:";
const PRESENCE_PREFIX = "liverun-seen:";
const MAX_RETRIES = 24;

export function setLiveTestHooks(next = {}) {
  globalThis.__RN_LIVE_TEST__ = next;
  resetRuntimeStores();
}

export function makeRoomCode() {
  return randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
}

export function nowIso() {
  return new Date().toISOString();
}

export function makeId() {
  return randomUUID();
}

export function makeSecret() {
  return randomBytes(24).toString("base64url");
}

export function secretsEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function isProductionNetlifyContext() {
  return hostedRemoteContext();
}

export { liveStoreName, inspectStorageConfig as inspectLiveStoreConfig };

export async function liveCasStore() {
  assertStorageAllowed();
  return getRuntimeStore(liveStoreName());
}

export async function liveStoreInfo() {
  const info = inspectStorageConfig();
  return { ...info, driver: info.driver, storeName: info.liveStoreName };
}

function runKey(code) {
  return `${PREFIX}${String(code || "").trim().toUpperCase()}`;
}

function activeKey(experienceId) {
  return `${ACTIVE_PREFIX}${experienceId}`;
}

function mediaKey(runId, mediaId) {
  return `${MEDIA_PREFIX}${runId}:${mediaId}`;
}

function presenceKey(code, participantId) {
  return `${PRESENCE_PREFIX}${String(code || "").trim().toUpperCase()}:${participantId}`;
}

export async function getLiveRun(code) {
  const st = await liveCasStore();
  return st.get(runKey(code), { type: "json" });
}

export async function getLiveRunWithRetry(code) {
  for (let i = 0; i < 12; i++) {
    const v = await getLiveRun(code);
    if (v) return v;
    if (i < 11) await sleep(45);
  }
  return null;
}

export async function getLiveRunRecord(code) {
  const st = await liveCasStore();
  return st.getWithMetadata(runKey(code), { type: "json" });
}

/**
 * Atomic read-modify-write. Mutator returning null skips the write.
 * Success is only acknowledged when the store accepts the conditional put.
 */
export async function updateLiveRun(code, mutator) {
  const norm = String(code || "").trim().toUpperCase();
  const key = runKey(norm);
  let lastErr = null;
  for (let i = 0; i < MAX_RETRIES; i++) {
    const st = await liveCasStore();
    const got = await st.getWithMetadata(key, { type: "json" });
    if (!got?.data) throw Object.assign(new Error("Run not found"), { statusCode: 404 });
    const current = JSON.parse(JSON.stringify(got.data));
    const expected = Number(current.revision || 0);
    const next = await mutator(current);
    if (!next) return got.data;
    next.revision = expected + 1;
    next.updatedAt = nowIso();
    const written = await st.setJSON(key, next, { onlyIfMatch: got.etag });
    if (written?.modified) return next;
    lastErr = new CasConflict("live run write conflict");
    await sleep(8 + Math.floor(Math.random() * 24));
  }
  throw lastErr || new CasConflict("live run update failed");
}

export async function createLiveRunRecord(code, data) {
  const st = await liveCasStore();
  const key = runKey(code);
  const written = await st.setJSON(key, data, { onlyIfNew: true });
  if (!written?.modified) throw new CasConflict("Live run code already exists");
  return data;
}

export async function createActivatedLiveRun(run, { experienceId, previousCode } = {}) {
  await createLiveRunRecord(run.code, run);
  try {
    await setActiveRunCode(experienceId, run.code, { expectedCode: previousCode || "" });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    err.statusCode = err.statusCode || 409;
    err.code = err.code || "active_pointer_conflict";
    err.preservedCode = previousCode || null;
    throw err;
  }
  if (previousCode && String(previousCode).toUpperCase() !== String(run.code).toUpperCase()) {
    await updateLiveRun(previousCode, (current) => {
      current.status = "superseded";
      return current;
    }).catch(() => undefined);
  }
  return run;
}

export async function getActiveRunCode(experienceId) {
  const st = await liveCasStore();
  const row = await st.get(activeKey(experienceId), { type: "json" });
  return row?.code ? String(row.code).toUpperCase() : null;
}

export async function setActiveRunCode(experienceId, code, { expectedCode } = {}) {
  const st = await liveCasStore();
  const key = activeKey(experienceId);
  const next = { code: String(code).toUpperCase(), updatedAt: nowIso() };
  for (let i = 0; i < MAX_RETRIES; i++) {
    const got = await st.getWithMetadata(key, { type: "json" });
    if (expectedCode != null) {
      const have = got?.data?.code ? String(got.data.code).toUpperCase() : "";
      if (have !== String(expectedCode || "").toUpperCase()) {
        throw new CasConflict("Active run pointer changed");
      }
    }
    const written = got?.etag
      ? await st.setJSON(key, next, { onlyIfMatch: got.etag })
      : await st.setJSON(key, next, { onlyIfNew: true });
    if (written?.modified) return next;
    await sleep(8 + Math.floor(Math.random() * 20));
  }
  throw new CasConflict("Could not update active run pointer");
}

export async function putLiveMedia(runId, mediaId, payload) {
  const st = await liveCasStore();
  const written = await st.setJSON(mediaKey(runId, mediaId), payload, { onlyIfNew: true });
  if (!written?.modified) {
    const retry = await st.setJSON(mediaKey(runId, mediaId), payload);
    if (!retry?.modified && retry?.modified !== undefined) {
      throw new CasConflict("Could not store live media");
    }
  }
}

export async function getLiveMedia(runId, mediaId) {
  const st = await liveCasStore();
  return st.get(mediaKey(runId, mediaId), { type: "json" });
}

export async function writePresence(code, participantId) {
  const st = await liveCasStore();
  await st.setJSON(presenceKey(code, participantId), { at: nowIso() });
}

export async function applyPresence(run) {
  if (!run?.participants) return run;
  const st = await liveCasStore();
  const ids = Object.keys(run.participants);
  await Promise.all(
    ids.map(async (id) => {
      const row = await st.get(presenceKey(run.code, id), { type: "json" });
      if (row?.at && run.participants[id]) run.participants[id].lastSeen = row.at;
    }),
  );
  return run;
}

export async function hydrateLiveRun(code) {
  const run = await getLiveRunWithRetry(code);
  if (!run) return null;
  const working = JSON.parse(JSON.stringify(run));
  await applyPresence(working);
  return working;
}

export { CasConflict };
