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

export async function setSession(code, data) {
  const st = await blobStore();
  await st.setJSON(`${PREFIX}${code}`, data);
}

