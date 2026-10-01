import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

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
