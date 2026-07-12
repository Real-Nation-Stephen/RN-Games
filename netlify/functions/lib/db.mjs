import { getDatabase } from "@netlify/database";

let dbPromise = null;

export async function getDb() {
  if (!dbPromise) {
    dbPromise = Promise.resolve(getDatabase());
  }
  return dbPromise;
}

export function isMeasurementDbEnabled() {
  return process.env.MEASUREMENT_DB_ENABLED !== "0" && process.env.MEASUREMENT_DB_ENABLED !== "false";
}
