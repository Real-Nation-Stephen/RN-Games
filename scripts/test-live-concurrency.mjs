#!/usr/bin/env node
/**
 * Live-run acceptance now lives in test-live-acceptance.mjs so skipped
 * phases cannot print ok. This wrapper keeps the old command working.
 */
import { spawn } from "node:child_process";

const child = spawn(
  process.execPath,
  ["scripts/test-live-acceptance.mjs", ...process.argv.slice(2)],
  { stdio: "inherit", env: { ...process.env, LIVE_STORE_DRIVER: process.env.LIVE_STORE_DRIVER || "memory", LIVE_DEV_AUTH: process.env.LIVE_DEV_AUTH || "1", LIVE_BLOB_STORE: process.env.LIVE_BLOB_STORE || "rngames-live-local" } },
);
child.on("exit", (code) => process.exit(code ?? 1));
