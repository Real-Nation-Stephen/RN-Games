/**
 * Compare-and-set JSON store used by live runs.
 * Memory and file drivers honor onlyIfMatch / onlyIfNew.
 * Blobs driver requires the installed @netlify/blobs conditional-write API.
 *
 * Installed SDK setJSON treats every non-412 (including 409 and 403) as
 * `{ modified: true, etag: "" }`. wrapBlobsCasFetch is the supported custom
 * `getStore({ fetch })` boundary that maps 409/412 to conflicts and rejects
 * other non-2xx before that branch can acknowledge a lost write.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const blobsCasWriteContext = new AsyncLocalStorage();

export class CasConflict extends Error {
  constructor(message = "Write conflict") {
    super(message);
    this.name = "CasConflict";
    this.code = "cas_conflict";
    this.statusCode = 409;
  }
}

export class CasUncertain extends Error {
  constructor(message = "Conditional Blobs write is uncertain") {
    super(message);
    this.name = "CasUncertain";
    this.code = "blobs_cas_uncertain";
    this.statusCode = 503;
  }
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function nextEtag() {
  return `"${randomUUID()}"`;
}

function asBuffer(data) {
  if (data == null) return null;
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

function fromBinaryRow(row, type) {
  if (!row?.binary) return type === "json" ? clone(row.data) : clone(row.data);
  const buf = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
  if (type === "arrayBuffer") {
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  return buf;
}

export function createMemoryCasStore() {
  const map = new Map();
  return {
    driver: "memory",
    name: "memory",
    async get(key, { type } = {}) {
      const row = map.get(key);
      if (!row) return null;
      return fromBinaryRow(row, type);
    },
    async getWithMetadata(key, { type } = {}) {
      const row = map.get(key);
      if (!row) return null;
      return {
        data: fromBinaryRow(row, type),
        etag: row.etag,
        metadata: row.metadata || {},
      };
    },
    async setJSON(key, data, { onlyIfMatch, onlyIfNew, metadata } = {}) {
      const cur = map.get(key);
      if (onlyIfNew && cur) return { modified: false };
      if (onlyIfMatch) {
        if (!cur || cur.etag !== onlyIfMatch) return { modified: false };
      }
      const etag = nextEtag();
      map.set(key, { data: clone(data), etag, metadata: metadata || {} });
      return { modified: true, etag };
    },
    async set(key, data, opts = {}) {
      const buf = asBuffer(data);
      if (!buf) return this.setJSON(key, data, opts);
      const cur = map.get(key);
      if (opts.onlyIfNew && cur) return { modified: false };
      if (opts.onlyIfMatch) {
        if (!cur || cur.etag !== opts.onlyIfMatch) return { modified: false };
      }
      const etag = nextEtag();
      map.set(key, { data: Buffer.from(buf), etag, metadata: opts.metadata || {}, binary: true });
      return { modified: true, etag };
    },
    async delete(key) {
      map.delete(key);
    },
    async list({ prefix = "" } = {}) {
      const blobs = [];
      for (const [key, row] of map.entries()) {
        if (!prefix || key.startsWith(prefix)) blobs.push({ key, etag: row.etag });
      }
      return { blobs, directories: [] };
    },
  };
}

function encodeKey(key) {
  return createHash("sha256").update(String(key)).digest("hex");
}

export function createFileCasStore(dir) {
  const root = path.resolve(dir);
  async function ensureRoot() {
    await fs.mkdir(root, { recursive: true });
  }
  async function withLock(key, fn) {
    await ensureRoot();
    const lockPath = path.join(root, `${encodeKey(key)}.lock`);
    for (let i = 0; i < 80; i++) {
      try {
        const fh = await fs.open(lockPath, "wx");
        try {
          return await fn();
        } finally {
          await fh.close();
          await fs.unlink(lockPath).catch(() => undefined);
        }
      } catch (e) {
        if (e && e.code === "EEXIST") {
          await new Promise((r) => setTimeout(r, 5 + Math.floor(Math.random() * 15)));
          continue;
        }
        throw e;
      }
    }
    throw new CasConflict("Live store lock timeout");
  }
  async function readRow(key) {
    const file = path.join(root, `${encodeKey(key)}.json`);
    try {
      const raw = await fs.readFile(file, "utf8");
      return JSON.parse(raw);
    } catch (e) {
      if (e && e.code === "ENOENT") return null;
      throw e;
    }
  }
  async function writeRow(key, row) {
    const file = path.join(root, `${encodeKey(key)}.json`);
    const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ ...row, key }), "utf8");
    await fs.rename(tmp, file);
  }
  function binPath(key) {
    return path.join(root, `${encodeKey(key)}.bin`);
  }
  return {
    driver: "file",
    name: root,
    async get(key, { type } = {}) {
      const row = await readRow(key);
      if (!row) return null;
      if (row.binary) {
        const buf = await fs.readFile(binPath(key));
        if (type === "arrayBuffer") return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        return buf;
      }
      return type === "json" || type === undefined ? clone(row.data) : clone(row.data);
    },
    async getWithMetadata(key, { type } = {}) {
      const row = await readRow(key);
      if (!row) return null;
      let data;
      if (row.binary) {
        const buf = await fs.readFile(binPath(key));
        data = type === "arrayBuffer" ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : buf;
      } else {
        data = clone(row.data);
      }
      return { data, etag: row.etag, metadata: row.metadata || {} };
    },
    async setJSON(key, data, { onlyIfMatch, onlyIfNew, metadata } = {}) {
      return withLock(key, async () => {
        const cur = await readRow(key);
        if (onlyIfNew && cur) return { modified: false };
        if (onlyIfMatch) {
          if (!cur || cur.etag !== onlyIfMatch) return { modified: false };
        }
        const etag = nextEtag();
        await writeRow(key, { data: clone(data), etag, metadata: metadata || {}, binary: false });
        await fs.unlink(binPath(key)).catch(() => undefined);
        return { modified: true, etag };
      });
    },
    async set(key, data, opts = {}) {
      const buf = asBuffer(data);
      if (!buf) return this.setJSON(key, data, opts);
      return withLock(key, async () => {
        const cur = await readRow(key);
        if (opts.onlyIfNew && cur) return { modified: false };
        if (opts.onlyIfMatch) {
          if (!cur || cur.etag !== opts.onlyIfMatch) return { modified: false };
        }
        const etag = nextEtag();
        await writeRow(key, { etag, metadata: opts.metadata || {}, binary: true });
        const tmp = `${binPath(key)}.${randomBytes(6).toString("hex")}.tmp`;
        await fs.writeFile(tmp, buf);
        await fs.rename(tmp, binPath(key));
        return { modified: true, etag };
      });
    },
    async delete(key) {
      const file = path.join(root, `${encodeKey(key)}.json`);
      await fs.unlink(file).catch(() => undefined);
      await fs.unlink(binPath(key)).catch(() => undefined);
    },
    async list({ prefix = "" } = {}) {
      await ensureRoot();
      const names = await fs.readdir(root);
      const blobs = [];
      for (const name of names) {
        if (!name.endsWith(".json") || name.includes(".tmp")) continue;
        try {
          const row = JSON.parse(await fs.readFile(path.join(root, name), "utf8"));
          const key = row.key;
          if (!key) continue;
          if (prefix && !key.startsWith(prefix)) continue;
          blobs.push({ key, etag: row.etag });
        } catch {
          /* skip */
        }
      }
      return { blobs, directories: [] };
    },
  };
}

function isPreconditionFailed(err) {
  const status = Number(err?.statusCode || err?.status || 0);
  if (status === 412 || status === 409) return true;
  const msg = String(err?.message || err || "");
  return /412|precondition|if-match|onlyifmatch|not modified/i.test(msg);
}

function headerMap(headers) {
  const out = {};
  if (!headers) return out;
  if (typeof headers.forEach === "function") {
    headers.forEach((value, key) => {
      out[String(key).toLowerCase()] = String(value);
    });
    return out;
  }
  for (const [key, value] of Object.entries(headers)) {
    out[String(key).toLowerCase()] = String(value);
  }
  return out;
}

function hasEtag(value) {
  return typeof value === "string" && !!value.trim();
}

export function assertConditionalWriteOpts(opts = {}) {
  if (Object.prototype.hasOwnProperty.call(opts, "onlyIfMatch") && !hasEtag(opts.onlyIfMatch)) {
    throw new CasConflict("Conditional write refused: missing ETag");
  }
}

function blobsWriteOpts({ onlyIfMatch, onlyIfNew, metadata } = {}) {
  const opts = {};
  if (metadata) opts.metadata = metadata;
  if (hasEtag(onlyIfMatch)) opts.onlyIfMatch = onlyIfMatch;
  else if (onlyIfNew) opts.onlyIfNew = true;
  return opts;
}

function blobsHttpError(status) {
  const err = new Error(`Netlify Blobs write failed with HTTP ${status}`);
  err.statusCode = status;
  err.code = "blobs_http_error";
  return err;
}

/**
 * Supported `getStore({ fetch })` interceptor. The SDK's conditional setJSON
 * branch treats every non-412 as success, including HTTP 409/403 with an empty
 * ETag. Rewrite 409/412 to 412 (safe conflict). Pass 2xx through even without
 * an ETag so an applied write is verified or marked uncertain, never turned
 * into a CAS retry. Reject other non-2xx so they cannot be acknowledged.
 */
export function wrapBlobsCasFetch(fetchImpl) {
  const base = fetchImpl || globalThis.fetch.bind(globalThis);
  return async function blobsCasFetch(input, init = {}) {
    const res = await base(input, init);
    const method = String(init?.method || "GET").toUpperCase();
    if (method !== "PUT") return res;
    const status = Number(res.status);
    const etag = String(res.headers.get("etag") || "").trim();
    const headers = headerMap(init?.headers);
    const conditional = !!(headers["if-match"] || headers["if-none-match"]);
    const ctx = blobsCasWriteContext.getStore();
    if (ctx) {
      ctx.httpStatus = status;
      ctx.etag = etag;
      ctx.conditional = conditional;
    }
    if (status === 409 || status === 412) {
      return new Response(null, {
        status: 412,
        statusText: "Precondition Failed",
        headers: res.headers,
      });
    }
    if (status >= 200 && status < 300) {
      if (ctx && conditional && !etag) ctx.missingEtag = true;
      return res;
    }
    if (ctx) {
      ctx.reject = true;
      return new Response(null, { status: 412, statusText: "Precondition Failed" });
    }
    throw blobsHttpError(status);
  };
}

function jsonEqual(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function blobsUncertain(detail) {
  return new CasUncertain(
    detail || "Conditional Blobs write returned no ETag; stored content could not be verified",
  );
}

async function confirmConditionalAck(blobs, method, key, data, result, opts, readConsistency, missingEtag = false) {
  const conditional = !!(opts.onlyIfMatch || opts.onlyIfNew);
  if (!conditional) return result;
  if (result?.modified === true && hasEtag(result.etag)) return result;
  if (!missingEtag && result?.modified !== true) return result;

  const metaOpts = { consistency: readConsistency || undefined };
  if (method === "setJSON") {
    const got = await blobs.getWithMetadata(key, { type: "json", ...metaOpts });
    if (got?.data != null && jsonEqual(got.data, data) && hasEtag(got.etag)) {
      return { modified: true, etag: got.etag };
    }
    throw blobsUncertain();
  }
  const got = await blobs.getWithMetadata(key, { type: "arrayBuffer", ...metaOpts });
  const wrote = asBuffer(data);
  const have = got?.data ? asBuffer(got.data) : null;
  if (wrote && have && Buffer.from(wrote).equals(Buffer.from(have)) && hasEtag(got.etag)) {
    return { modified: true, etag: got.etag };
  }
  throw blobsUncertain();
}

async function blobsConditionalWrite(write, { onlyIfMatch, onlyIfNew } = {}) {
  const conditional = !!(onlyIfMatch || onlyIfNew);
  try {
    const result = await write();
    if (result && typeof result.modified === "boolean") return result;
    if (conditional) {
      throw new Error("Netlify Blobs did not return a conditional-write result");
    }
    return { modified: true, etag: result?.etag };
  } catch (e) {
    if (e instanceof CasUncertain) throw e;
    if (conditional && isPreconditionFailed(e)) {
      return { modified: false };
    }
    throw e;
  }
}

async function runBlobsWrite(blobs, method, key, data, opts = {}, readConsistency) {
  assertConditionalWriteOpts(opts);
  const writeOpts = blobsWriteOpts(opts);
  const ctx = { httpStatus: 0, reject: false, missingEtag: false };
  return blobsCasWriteContext.run(ctx, async () => {
    const result = await blobsConditionalWrite(() => blobs[method](key, data, writeOpts), opts);
    if (ctx.reject) throw blobsHttpError(ctx.httpStatus || 502);
    return confirmConditionalAck(blobs, method, key, data, result, opts, readConsistency, ctx.missingEtag);
  });
}

/**
 * Adapter over the installed @netlify/blobs Store.
 * `set` must call blobs.set (raw bytes). JSON.stringify(ArrayBuffer) is "{}" and
 * would replace uploaded images/fonts with an empty object on hosted deploys.
 */
export function wrapBlobsCasStore(blobs, name, { readConsistency } = {}) {
  function withReadConsistency(opts) {
    if (!readConsistency) return opts;
    return { ...(opts || {}), consistency: opts?.consistency ?? readConsistency };
  }
  return {
    driver: "blobs",
    name,
    readConsistency: readConsistency || null,
    async get(key, opts) {
      return blobs.get(key, withReadConsistency(opts));
    },
    async getWithMetadata(key, opts) {
      return blobs.getWithMetadata(key, withReadConsistency(opts));
    },
    async setJSON(key, data, opts = {}) {
      return runBlobsWrite(blobs, "setJSON", key, data, opts, readConsistency);
    },
    async set(key, data, opts = {}) {
      return runBlobsWrite(blobs, "set", key, data, opts, readConsistency);
    },
    async delete(key) {
      if (typeof blobs.delete === "function") await blobs.delete(key);
    },
    async list(opts) {
      if (typeof blobs.list === "function") return blobs.list(withReadConsistency(opts));
      return { blobs: [], directories: [] };
    },
  };
}

export async function probeConditionalWrites(store) {
  const key = `__cas-probe/${randomUUID()}`;
  try {
    const created = await store.setJSON(key, { n: 1 }, { onlyIfNew: true });
    if (!created || created.modified !== true) return { ok: false, reason: "onlyIfNew did not create" };
    const got = await store.getWithMetadata(key, { type: "json" });
    if (!got || got.data?.n !== 1 || !got.etag) {
      return { ok: false, reason: "read-after-write missed (strong getWithMetadata did not see the write)" };
    }
    const denied = await store.setJSON(key, { n: 2 }, { onlyIfMatch: `"${randomUUID()}"` });
    if (!denied || denied.modified !== false) {
      return { ok: false, reason: "mismatched onlyIfMatch was accepted" };
    }
    const okWrite = await store.setJSON(key, { n: 3 }, { onlyIfMatch: got.etag });
    if (!okWrite || okWrite.modified !== true) return { ok: false, reason: "matching onlyIfMatch failed" };
    const got2 = await store.getWithMetadata(key, { type: "json" });
    if (!got2 || got2.data?.n !== 3) {
      return { ok: false, reason: "strong read did not see matching write" };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  } finally {
    try {
      await store.delete(key);
    } catch {
      /* ignore */
    }
  }
}

export function defaultFileStoreDir() {
  const metaUrl = typeof import.meta === "object" ? import.meta.url : undefined;
  if (typeof metaUrl !== "string" || !metaUrl) {
    const err = new Error(
      "File CAS directory is unavailable in this runtime. Hosted functions cannot use the file driver.",
    );
    err.statusCode = 503;
    throw err;
  }
  const here = path.dirname(fileURLToPath(metaUrl));
  return path.resolve(here, "../../../.netlify/live-cas");
}
