import { blobStore } from "./store.mjs";

const PREFIX = "quizsession:";

export function makeSessionCode() {
  return Math.random().toString(16).slice(2, 8).toUpperCase();
}

export function nowIso() {
  return new Date().toISOString();
}

export async function getSession(code) {
  const st = await blobStore();
  return st.get(`${PREFIX}${code}`, { type: "json" });
}

/**
 * Same as getSession but retries briefly when null. Lambda blob context does not expose
 * uncachedEdgeURL, so strong consistency reads are unavailable; POST→GET can lag on eventual reads.
 * Keep attempts small — every poll uses this on the host.
 */
export async function getSessionWithBriefRetry(code) {
  const st = await blobStore();
  const key = `${PREFIX}${code}`;
  const attempts = 6;
  const pauseMs = 28;
  for (let i = 0; i < attempts; i++) {
    const v = await st.get(key, { type: "json" });
    if (v) return v;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, pauseMs));
  }
  return null;
}

export async function setSession(code, data) {
  const st = await blobStore();
  await st.setJSON(`${PREFIX}${code}`, data);
}

