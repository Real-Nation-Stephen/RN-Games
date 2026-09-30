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
    if (process.env.LIVE_DEDICATED_SERVER === "1") {
      dbPromise = import("pg").then(({ Pool }) => {
        if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the dedicated live service");
        return { pool: new Pool({ connectionString: process.env.DATABASE_URL, max: 12,
          connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 }) };
      });
      return dbPromise;
    }
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
