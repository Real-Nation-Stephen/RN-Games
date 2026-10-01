import { createHash } from "node:crypto";
import { liveCasStore, makeSecret, secretsEqual } from "./live-store.mjs";

const key = (id) => `live-operator:${id}`;
const digest = (token) => createHash("sha256").update(token).digest("hex");

// Separate from public experience configuration and per-run host credentials.
export async function issueOperatorAccess(experienceId) {
  const token = makeSecret();
  const store = await liveCasStore();
  await store.setJSON(key(experienceId), { digest: digest(token), updatedAt: new Date().toISOString() });
  return token;
}

export async function revokeOperatorAccess(experienceId) {
  const store = await liveCasStore();
  await store.delete(key(experienceId));
}

export async function verifyOperatorAccess(experienceId, token) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(token)) return false;
  const store = await liveCasStore();
  const row = await store.get(key(experienceId), { type: "json" });
  return !!row?.digest && secretsEqual(digest(token), row.digest);
}
