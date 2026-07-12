import { getDatabase, getConnectionString } from "@netlify/database";

let dbPromise = null;

function resolveConnectionString() {
  if (process.env.NETLIFY_DB_URL) return process.env.NETLIFY_DB_URL;
  try {
    return getConnectionString();
  } catch {
    return undefined;
  }
}

export async function getDb() {
  if (!dbPromise) {
    const connectionString = resolveConnectionString();
    dbPromise = Promise.resolve(
      connectionString ? getDatabase({ connectionString }) : getDatabase(),
    );
  }
  return dbPromise;
}

export function isMeasurementDbEnabled() {
  return process.env.MEASUREMENT_DB_ENABLED !== "0" && process.env.MEASUREMENT_DB_ENABLED !== "false";
}
