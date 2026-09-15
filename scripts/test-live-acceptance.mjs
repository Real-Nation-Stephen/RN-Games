#!/usr/bin/env node
/**
 * Isolated live-run CAS regressions + simulated-15 full-flow checks.
 * Uses an in-memory compare-and-set store so it cannot touch production Blobs.
 *
 *   LIVE_STORE_DRIVER=memory LIVE_DEV_AUTH=1 node scripts/test-live-acceptance.mjs
 */
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createMemoryCasStore, probeConditionalWrites, wrapBlobsCasFetch, wrapBlobsCasStore, CasUncertain } from "../netlify/functions/lib/cas-store.mjs";
import { getStore } from "@netlify/blobs";
import {
  blobsClientScopeKey,
  blobsHasUncachedEdge,
  blobsStoreOptions,
  blobsWrapOptions,
  connectBlobs,
  getRuntimeStore,
  hostedRemoteContext,
  isolationDriver,
  LIVE_BLOBS_CONSISTENCY,
  liveStoreName,
  resetRuntimeStores,
} from "../netlify/functions/lib/blob-runtime.mjs";
import { isUnsignedDevAuthAllowed, requireOperatorAuth, verifyIdentityBearer } from "../netlify/functions/lib/auth.mjs";
import { asNetlifyFunction } from "../netlify/functions/lib/netlify-v2.mjs";
import { identityAuthHeaders, identityForceRefresh, identitySessionExpired, SESSION_EXPIRED_MESSAGE } from "../packages/admin/src/identity-auth.mjs";
import { loadBinary, saveBinary } from "../netlify/functions/lib/files.mjs";
import {
  createActivatedLiveRun,
  createLiveRunRecord,
  getActiveRunCode,
  getLiveRun,
  inspectLiveStoreConfig,
  liveCasStore,
  setLiveTestHooks,
  updateLiveRun,
  writePresence,
} from "../netlify/functions/lib/live-store.mjs";
import { createRunDocument, joinParticipant } from "../netlify/functions/lib/live-run.mjs";
import liveRunDefault, { lambdaHandler as liveRun } from "../netlify/functions/live-run.mjs";
import { lambdaHandler as liveJoin } from "../netlify/functions/live-join.mjs";
import { lambdaHandler as liveControl } from "../netlify/functions/live-control.mjs";
import { lambdaHandler as liveAction } from "../netlify/functions/live-action.mjs";
import { handler as liveSeed } from "../netlify/functions/live-demo-seed.mjs";
import { normalizeMiniPollRecord, normalizeFillGameRecord, liveSurfaceBrandingFromComponent, resolveLiveSurfaceLayouts } from "../netlify/functions/lib/live-modules.mjs";
import { fillPinboardCard } from "./lib/fill-pinboard-card.mjs";

const N = Number(process.env.LIVE_N || 15);
const DEV_BEARER =
  "eyJhbGciOiJub25lIn0.eyJzdWIiOiJkZXYtbG9jYWwiLCJlbWFpbCI6ImRldkBsb2NhbC5wcmV2aWV3In0.dev";

let failures = 0;
function ok(name) {
  console.log(`ok  ${name}`);
}
function fail(name, detail) {
  failures += 1;
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}
function assert(name, cond, detail) {
  if (cond) ok(name);
  else fail(name, detail);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function event({ method = "GET", query = {}, body, headers = {} }) {
  return {
    httpMethod: method,
    queryStringParameters: query,
    body: body != null ? JSON.stringify(body) : undefined,
    headers: { "Content-Type": "application/json", ...headers },
  };
}

const operatorCtx = { clientContext: { user: { sub: "dev-local", email: "dev@local.preview" } } };

async function call(handler, evt, ctx = {}) {
  const res = await handler(evt, ctx);
  let data = {};
  try {
    data = res.body ? JSON.parse(res.body) : {};
  } catch {
    data = { raw: res.body };
  }
  return { status: res.statusCode, data };
}

async function must(handler, evt, ctx, expectStatus = 200) {
  const res = await call(handler, evt, ctx);
  if (res.status !== expectStatus) {
    throw new Error(`expected ${expectStatus} got ${res.status} ${res.data.error || ""}`);
  }
  return res.data;
}

function id() {
  return randomUUID();
}

const QA_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** Mimics @netlify/blobs Store: setJSON stringifies; set stores raw BlobInput. */
function createFakeNetlifyBlobsAdapter() {
  const map = new Map();
  const calls = { set: [], setJSON: [], get: [], getWithMetadata: [] };
  function toBuf(data) {
    if (Buffer.isBuffer(data)) return Buffer.from(data);
    if (data instanceof ArrayBuffer) return Buffer.from(data);
    if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    if (typeof data === "string") return Buffer.from(data);
    throw new Error(`fake blobs.set expected BlobInput, got ${data?.constructor?.name || typeof data}`);
  }
  return {
    calls,
    async set(key, data, opts = {}) {
      calls.set.push({ key, data, opts, ctor: data?.constructor?.name });
      const buf = toBuf(data);
      const etag = `"s${calls.set.length}"`;
      map.set(key, { buf, etag, metadata: opts.metadata || {} });
      return { modified: true, etag };
    },
    async setJSON(key, data, opts = {}) {
      calls.setJSON.push({ key, data, opts, ctor: data?.constructor?.name });
      const buf = Buffer.from(JSON.stringify(data));
      const etag = `"j${calls.setJSON.length}"`;
      map.set(key, { buf, etag, metadata: opts.metadata || {} });
      return { modified: true, etag };
    },
    async get(key, opts = {}) {
      calls.get.push({ key, opts: opts || {} });
      const row = map.get(key);
      if (!row) return null;
      if (opts?.type === "arrayBuffer") {
        return row.buf.buffer.slice(row.buf.byteOffset, row.buf.byteOffset + row.buf.byteLength);
      }
      if (opts?.type === "json") return JSON.parse(row.buf.toString("utf8"));
      return row.buf.toString("utf8");
    },
    async getWithMetadata(key, opts = {}) {
      calls.getWithMetadata.push({ key, opts: opts || {} });
      const data = await this.get(key, opts);
      const row = map.get(key);
      if (!row) return null;
      return { data, etag: row.etag, metadata: row.metadata };
    },
    async delete(key) {
      map.delete(key);
    },
  };
}

async function blobsAdapterBoundaryTests() {
  const fake = createFakeNetlifyBlobsAdapter();
  const wrapped = wrapBlobsCasStore(fake, "rngames-platform-local");
  setLiveTestHooks({ store: wrapped });
  try {
    const fileId = await saveBinary(QA_PNG, "image/png");
    const fileSets = fake.calls.set.filter((c) => c.key.startsWith("file:") && !c.key.startsWith("filemeta:"));
    const fileJson = fake.calls.setJSON.filter((c) => c.key.startsWith("file:") && !c.key.startsWith("filemeta:"));
    assert(
      "blobs adapter set used for binary, not setJSON",
      fileSets.length === 1 && fileJson.length === 0,
      `set=${fileSets.length} setJSON=${fileJson.length}`,
    );
    assert("blobs adapter set received ArrayBuffer", fileSets[0]?.data instanceof ArrayBuffer, `ctor=${fileSets[0]?.ctor}`);
    const loaded = await loadBinary(fileId);
    const body = loaded?.body ? Buffer.from(loaded.body) : Buffer.alloc(0);
    assert(
      "binary roundtrip is PNG bytes, not JSON {}",
      loaded?.contentType === "image/png" && body.equals(QA_PNG) && body[0] === 0x89 && !body.equals(Buffer.from("{}")),
      `len=${body.length} hex=${body.slice(0, 8).toString("hex")} type=${loaded?.contentType}`,
    );
  } finally {
    setLiveTestHooks({});
  }

  const liveName = liveStoreName();
  const liveOpts = blobsStoreOptions(liveName);
  const platformOpts = blobsStoreOptions("rngames-platform");
  assert(
    "live Blobs store requests strong consistency",
    liveOpts.consistency === LIVE_BLOBS_CONSISTENCY && liveOpts.name === liveName,
    JSON.stringify(liveOpts),
  );
  assert(
    "platform Blobs store stays eventual (no strong default)",
    platformOpts.consistency == null && platformOpts.name === "rngames-platform",
    JSON.stringify(platformOpts),
  );

  const liveFake = createFakeNetlifyBlobsAdapter();
  const liveWrapped = wrapBlobsCasStore(liveFake, liveName, blobsWrapOptions(liveName));
  await liveWrapped.setJSON("liverun:TEST01", { n: 1 });
  await liveWrapped.getWithMetadata("liverun:TEST01", { type: "json" });
  await liveWrapped.get("liverun:TEST01", { type: "json" });
  assert(
    "live wrap always requests strong consistency",
    liveFake.calls.getWithMetadata[0]?.opts?.consistency === LIVE_BLOBS_CONSISTENCY &&
      liveFake.calls.get[0]?.opts?.consistency === LIVE_BLOBS_CONSISTENCY,
    JSON.stringify({ get: liveFake.calls.get[0]?.opts, meta: liveFake.calls.getWithMetadata[0]?.opts }),
  );

  const staleProbe = {
    async setJSON(_key, _data, opts = {}) {
      if (opts.onlyIfNew) return { modified: true, etag: "etag-write" };
      if (opts.onlyIfMatch) return { modified: opts.onlyIfMatch === "etag-write", etag: "etag-2" };
      return { modified: true, etag: "etag-write" };
    },
    async getWithMetadata() {
      return { data: { n: 99 }, etag: "etag-stale" };
    },
    async delete() {},
  };
  const stale = await probeConditionalWrites(staleProbe);
  assert(
    "CAS probe fails closed when strong read misses the write",
    stale.ok === false && /read-after-write/i.test(stale.reason || ""),
    stale.reason,
  );

  const platformFake = createFakeNetlifyBlobsAdapter();
  const platformWrapped = wrapBlobsCasStore(platformFake, "rngames-platform", blobsWrapOptions("rngames-platform"));
  await platformWrapped.get("file:x", { type: "arrayBuffer" });
  assert(
    "platform reads do not force strong consistency",
    platformFake.calls.get[0]?.opts?.consistency == null,
    JSON.stringify(platformFake.calls.get[0]?.opts),
  );
}

function probeOkAdapter() {
  const map = new Map();
  let n = 0;
  return {
    async setJSON(key, data, opts = {}) {
      const cur = map.get(key);
      if (opts.onlyIfNew && cur) return { modified: false };
      if (opts.onlyIfMatch && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified: false };
      const etag = `"e${++n}"`;
      map.set(key, { data, etag });
      return { modified: true, etag };
    },
    async getWithMetadata(key) {
      const row = map.get(key);
      if (!row) return null;
      return { data: row.data, etag: row.etag, metadata: {} };
    },
    async get(key) {
      return map.get(key)?.data ?? null;
    },
    async delete(key) {
      map.delete(key);
    },
  };
}

async function sdkInjectedFetchCasTests() {
  const base = {
    name: "cas-sdk-test",
    siteID: "site",
    token: "tok",
    edgeURL: "https://blobs-edge.test",
    uncachedEdgeURL: "https://blobs-uncached.test",
    consistency: "strong",
  };
  const put =
    (status, etag, getBody = { n: 1 }, getEtag = '"got"') =>
    async (_url, init = {}) => {
      const method = String(init.method || "GET").toUpperCase();
      if (method === "GET" || method === "HEAD") {
        return new Response(JSON.stringify(getBody), {
          status: 200,
          headers: { etag: getEtag, "content-type": "application/json" },
        });
      }
      const headers = {};
      if (etag) headers.etag = etag;
      return new Response(null, { status, headers });
    };

  const raw409 = await getStore({ ...base, fetch: put(409, "") }).setJSON("k", { n: 1 }, { onlyIfMatch: '"old"' });
  assert(
    "installed SDK treats HTTP 409 as modified:true with empty etag",
    raw409.modified === true && !String(raw409.etag || "").trim(),
  );
  const raw403 = await getStore({ ...base, fetch: put(403, "") }).setJSON("k", { n: 1 }, { onlyIfMatch: '"old"' });
  assert(
    "installed SDK treats HTTP 403 as modified:true with empty etag",
    raw403.modified === true && !String(raw403.etag || "").trim(),
  );
  const raw412 = await getStore({ ...base, fetch: put(412, "") }).setJSON("k", { n: 1 }, { onlyIfMatch: '"old"' });
  assert("installed SDK treats HTTP 412 as modified:false", raw412.modified === false);
  const raw200 = await getStore({ ...base, fetch: put(200, '"ok"') }).setJSON("k", { n: 1 }, { onlyIfMatch: '"old"' });
  assert("installed SDK treats HTTP 200+etag as modified:true", raw200.modified === true && raw200.etag === '"ok"');

  const g409 = await wrapBlobsCasStore(
    getStore({ ...base, fetch: wrapBlobsCasFetch(put(409, "")) }),
    "cas-sdk-test",
    { readConsistency: "strong" },
  ).setJSON("k", { n: 1 }, { onlyIfMatch: '"old"' });
  assert("fetch guard maps HTTP 409 to conflict", g409.modified === false);
  const g412 = await wrapBlobsCasStore(
    getStore({ ...base, fetch: wrapBlobsCasFetch(put(412, "")) }),
    "cas-sdk-test",
    { readConsistency: "strong" },
  ).setJSON("k", { n: 1 }, { onlyIfMatch: '"old"' });
  assert("fetch guard maps HTTP 412 to conflict", g412.modified === false);

  try {
    await wrapBlobsCasStore(
      getStore({ ...base, fetch: wrapBlobsCasFetch(put(403, "")) }),
      "cas-sdk-test",
      { readConsistency: "strong" },
    ).setJSON("k", { n: 1 }, { onlyIfMatch: '"old"' });
    fail("HTTP 403 should reject");
  } catch (e) {
    assert("fetch guard rejects HTTP 403", e.code === "blobs_http_error" && Number(e.statusCode) === 403, e.message);
  }

  const verified = await wrapBlobsCasStore(
    getStore({ ...base, fetch: wrapBlobsCasFetch(put(200, "", { n: 1 }, '"got"')) }),
    "cas-sdk-test",
    { readConsistency: "strong" },
  ).setJSON("k", { n: 1 }, { onlyIfMatch: '"old"' });
  assert(
    "2xx without ETag is verified by strong read of matching content",
    verified.modified === true && verified.etag === '"got"',
    JSON.stringify({ modified: verified.modified, etag: verified.etag }),
  );

  try {
    await wrapBlobsCasStore(
      getStore({ ...base, fetch: wrapBlobsCasFetch(put(200, "", { n: 99 }, '"other"')) }),
      "cas-sdk-test",
      { readConsistency: "strong" },
    ).setJSON("k", { n: 1 }, { onlyIfMatch: '"old"' });
    fail("unverified 2xx without ETag should not look like a conflict");
  } catch (e) {
    assert(
      "2xx without ETag and mismatched content is uncertain, not a CAS retry",
      e instanceof CasUncertain && e.code === "blobs_cas_uncertain" && Number(e.statusCode) === 503,
      e && e.message,
    );
  }

  try {
    await wrapBlobsCasStore(probeOkAdapter(), "x").setJSON("k", { n: 1 }, { onlyIfMatch: undefined });
    fail("missing ETag should refuse unconditional write");
  } catch (e) {
    assert(
      "missing read ETag is refused before CAS",
      e.code === "cas_conflict" && /missing ETag/i.test(e.message || ""),
      e && e.message,
    );
  }
}

async function joinIdentityRetryTest() {
  const inner = createMemoryCasStore();
  let denied = 0;
  let matchAttempts = 0;
  const store = {
    driver: "memory",
    get: (...a) => inner.get(...a),
    getWithMetadata: (...a) => inner.getWithMetadata(...a),
    list: (...a) => inner.list(...a),
    delete: (...a) => inner.delete(...a),
    async setJSON(key, data, opts = {}) {
      if (opts.onlyIfMatch && /^liverun:[A-Z0-9]+$/.test(String(key))) {
        matchAttempts += 1;
        if (denied < 1) {
          denied += 1;
          return { modified: false };
        }
      }
      return inner.setJSON(key, data, opts);
    },
    set: (...a) => inner.set(...a),
  };
  const fixture = demoExperience();
  setLiveTestHooks({
    store,
    loadExperience: async (slug) => (slug === fixture.experience.slug ? fixture.experience : null),
    buildSnapshot: async () => fixture.snapshot,
  });
  try {
    const created = await must(liveRun, event({ method: "POST", body: { slug: "live-demo" } }), operatorCtx);
    const beforeJoin = matchAttempts;
    const joined = await must(liveJoin, event({ method: "POST", body: { code: created.code } }));
    const joinWrites = matchAttempts - beforeJoin;
    const stored = await getLiveRun(created.code);
    const ids = Object.keys(stored.participants || {});
    const row = stored.participants[joined.participantId];
    const resume = await must(
      liveJoin,
      event({ method: "POST", body: { code: created.code, participantId: joined.participantId, secret: joined.secret } }),
    );
    assert(
      "CAS retry reuses the same join identity",
      joinWrites >= 2 &&
        denied === 1 &&
        ids.length === 1 &&
        ids[0] === joined.participantId &&
        row &&
        Number(row.number) === Number(joined.participantNumber) &&
        String(row.secret) === String(joined.secret) &&
        resume.participantId === joined.participantId &&
        Number(resume.participantNumber) === Number(joined.participantNumber),
      `joinWrites=${joinWrites} denied=${denied} count=${ids.length} acknowledged=${!!joined.participantId}`,
    );
  } finally {
    setLiveTestHooks({});
  }
}

function encodeBlobsContext(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

function blobsContextToken(token) {
  return encodeBlobsContext({
    siteID: "site-rot",
    token,
    edgeURL: "https://blobs-edge.example",
    uncachedEdgeURL: "https://blobs-uncached.example",
    deployID: "deploy-rot",
  });
}

function tokenLabel(token) {
  if (token === "token-env-stale") return "stale";
  if (token === "token-global-fresh") return "fresh";
  if (token === "token-global-next") return "next";
  return "other";
}

async function blobsTokenRotationTests() {
  await withEnv(
    {
      AWS_LAMBDA_FUNCTION_NAME: "live-run",
      CONTEXT: "production",
      NETLIFY_DEV: undefined,
      RN_ISOLATED_QA: undefined,
      LIVE_BLOB_STORE: undefined,
      LIVE_STORE_DRIVER: undefined,
      NETLIFY_BLOBS_CONTEXT: blobsContextToken("token-env-stale"),
    },
    async () => {
      const prevGlobal = globalThis.netlifyBlobsContext;
      const created = [];
      try {
        setLiveTestHooks({
          getStore(opts) {
            created.push(tokenLabel(opts.token));
            return probeOkAdapter();
          },
        });

        globalThis.netlifyBlobsContext = blobsContextToken("token-global-fresh");
        const keyFresh = blobsClientScopeKey();
        delete globalThis.netlifyBlobsContext;
        const keyStaleEnv = blobsClientScopeKey();
        globalThis.netlifyBlobsContext = blobsContextToken("token-global-fresh");
        assert(
          "scope key prefers globalThis.netlifyBlobsContext over stale NETLIFY_BLOBS_CONTEXT",
          keyFresh !== keyStaleEnv,
        );

        resetRuntimeStores();
        created.length = 0;
        const liveName = liveStoreName();
        await getRuntimeStore(liveName);
        await getRuntimeStore("rngames-platform");
        assert(
          "stale env + fresh global uses the global token for live and platform clients",
          created.length === 2 && created.every((label) => label === "fresh"),
          `labels=${created.join(",")}`,
        );

        globalThis.netlifyBlobsContext = blobsContextToken("token-global-next");
        await getRuntimeStore(liveName);
        await getRuntimeStore("rngames-platform");
        assert(
          "token rotation recreates live and platform Blobs clients",
          created.filter((label) => label === "fresh").length === 2 &&
            created.filter((label) => label === "next").length === 2,
          `labels=${created.join(",")}`,
        );
        const reused = created.length;
        await getRuntimeStore(liveName);
        await getRuntimeStore("rngames-platform");
        assert("same token scope reuses cached clients", created.length === reused);

        let releaseStale;
        const holdStale = new Promise((resolve) => {
          releaseStale = resolve;
        });
        let staleEntered;
        const staleReady = new Promise((resolve) => {
          staleEntered = resolve;
        });
        const adapters = [];
        setLiveTestHooks({
          getStore(opts) {
            const label = tokenLabel(opts.token);
            const inner = probeOkAdapter();
            const rec = { label, writes: [] };
            adapters.push(rec);
            return {
              async setJSON(key, data, writeOpts = {}) {
                if (label === "stale") {
                  staleEntered();
                  await holdStale;
                }
                rec.writes.push(key);
                return inner.setJSON(key, data, writeOpts);
              },
              getWithMetadata: (...a) => inner.getWithMetadata(...a),
              get: (...a) => inner.get(...a),
              delete: (...a) => inner.delete(...a),
            };
          },
        });

        globalThis.netlifyBlobsContext = blobsContextToken("token-env-stale");
        const stalePending = getRuntimeStore(liveName);
        await staleReady;
        globalThis.netlifyBlobsContext = blobsContextToken("token-global-next");
        const nextStore = await getRuntimeStore(liveName);
        releaseStale();
        await stalePending;
        const afterRotate = await getRuntimeStore(liveName);
        await afterRotate.setJSON("whoami", { ok: true }, { onlyIfNew: true });
        const staleWrites = adapters.filter((a) => a.label === "stale").flatMap((a) => a.writes);
        const nextWrites = adapters.filter((a) => a.label === "next").flatMap((a) => a.writes);
        assert(
          "in-flight stale probe cannot overwrite the rotated client cache",
          nextWrites.includes("whoami") && !staleWrites.includes("whoami"),
          `stale=${staleWrites.length} next=${nextWrites.length}`,
        );
      } finally {
        if (prevGlobal === undefined) delete globalThis.netlifyBlobsContext;
        else globalThis.netlifyBlobsContext = prevGlobal;
        setLiveTestHooks({});
      }
    },
  );
}

async function withEnv(patch, fn) {
  const keys = Object.keys(patch);
  const prev = {};
  for (const key of keys) {
    prev[key] = Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : undefined;
    if (patch[key] === undefined) delete process.env[key];
    else process.env[key] = patch[key];
  }
  try {
    return await fn();
  } finally {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

async function hostedRuntimeTests() {
  const eventBlobs = Buffer.from(
    JSON.stringify({
      url: "https://blobs-edge.example",
      token: "blob-token",
    }),
  ).toString("base64");
  const priorContext = Buffer.from(
    JSON.stringify({
      edgeURL: "https://blobs-edge-old.example",
      token: "old-token",
      siteID: "from-context",
      uncachedEdgeURL: "https://blobs-uncached.example",
    }),
  ).toString("base64");
  const guessedUncachedContext = Buffer.from(
    JSON.stringify({
      url: "https://blobs-edge.example",
      token: "blob-token",
      uncachedURL: "https://blobs-uncached.example",
      uncached_url: "https://blobs-uncached.example",
    }),
  ).toString("base64");
  const v2Context = Buffer.from(
    JSON.stringify({
      apiURL: "https://api.netlify.com",
      edgeURL: "https://blobs-edge.example",
      uncachedEdgeURL: "https://blobs-uncached.example",
      token: "v2-token",
      siteID: "site-v2",
      deployID: "deploy-v2",
    }),
  ).toString("base64");

  await withEnv(
    {
      AWS_LAMBDA_FUNCTION_NAME: "live-run",
      LAMBDA_TASK_ROOT: "/var/task",
      CONTEXT: undefined,
      NETLIFY_DEV: undefined,
      RN_ISOLATED_QA: undefined,
      LIVE_STORE_DRIVER: "file",
      LIVE_DEV_AUTH: "1",
      LIVE_BLOB_STORE: undefined,
      NETLIFY_BLOBS_CONTEXT: undefined,
    },
    () => {
      resetRuntimeStores();
      assert("Lambda without CONTEXT is hosted", hostedRemoteContext() === true);
      assert("hosted Lambda isolation driver is empty", isolationDriver() === "");
      assert("unsigned JWT is refused on Lambda", isUnsignedDevAuthAllowed() === false);
    },
  );

  await withEnv(
    {
      AWS_LAMBDA_FUNCTION_NAME: "live-run",
      CONTEXT: undefined,
      NETLIFY_DEV: undefined,
      RN_ISOLATED_QA: undefined,
      LIVE_STORE_DRIVER: "file",
      LIVE_BLOB_STORE: undefined,
    },
    async () => {
      resetRuntimeStores();
      setLiveTestHooks({});
      try {
        await getRuntimeStore("rngames-live");
        fail("hosted Lambda file driver should be rejected");
      } catch (e) {
        assert(
          "hosted Lambda refuses file driver even without CONTEXT",
          /cannot be enabled on hosted/i.test(e.message || "") && !/Received undefined/i.test(e.message || ""),
          e.message,
        );
      }
    },
  );

  await withEnv(
    {
      AWS_LAMBDA_FUNCTION_NAME: "live-run",
      CONTEXT: undefined,
      NETLIFY_DEV: undefined,
      RN_ISOLATED_QA: undefined,
      LIVE_BLOB_STORE: undefined,
      LIVE_STORE_DRIVER: undefined,
      NETLIFY_BLOBS_CONTEXT: priorContext,
    },
    () => {
      connectBlobs({ blobs: { isolated: true }, headers: {} });
      connectBlobs({
        blobs: eventBlobs,
        headers: { "X-Nf-Site-Id": "site-1", "x-nf-deploy-id": "d1" },
      });
      assert(
        "connectBlobs restores prior EnvironmentContext.uncachedEdgeURL after event.blobs {token,url}",
        blobsHasUncachedEdge() === true,
      );
      const liveOpts = blobsStoreOptions(liveStoreName());
      assert(
        "live Blobs store always requests strong consistency",
        liveOpts.consistency === LIVE_BLOBS_CONSISTENCY && liveOpts.name === "rngames-live",
        JSON.stringify(liveOpts),
      );
      assert("platform Blobs store stays eventual", blobsStoreOptions("rngames-platform").consistency == null);
    },
  );

  await withEnv(
    {
      AWS_LAMBDA_FUNCTION_NAME: "live-run",
      CONTEXT: undefined,
      NETLIFY_DEV: undefined,
      RN_ISOLATED_QA: undefined,
      LIVE_BLOB_STORE: undefined,
      LIVE_STORE_DRIVER: undefined,
      NETLIFY_BLOBS_CONTEXT: guessedUncachedContext,
    },
    async () => {
      resetRuntimeStores();
      setLiveTestHooks({});
      connectBlobs({
        blobs: Buffer.from(
          JSON.stringify({
            url: "https://blobs-edge.example",
            token: "blob-token",
            uncachedURL: "https://blobs-uncached.example",
          }),
        ).toString("base64"),
        headers: {},
      });
      assert(
        "connectBlobs ignores uncachedURL aliases; only uncachedEdgeURL counts",
        blobsHasUncachedEdge() === false,
      );
      try {
        await getRuntimeStore(liveStoreName());
        fail("hosted Lambda without uncachedEdgeURL should fail closed");
      } catch (e) {
        const msg = String(e && e.message || e);
        assert(
          "hosted live store fails closed without uncachedEdgeURL (no eventual reads)",
          Number(e.statusCode) === 503 &&
            e.code === "live_blobs_strong_unavailable" &&
            /uncachedEdgeURL/i.test(msg) &&
            /strong consistency/i.test(msg) &&
            /will not fall back to eventual reads/i.test(msg) &&
            !/Received undefined/i.test(msg),
          `${msg} status=${e.statusCode} code=${e.code}`,
        );
      }
    },
  );

  await withEnv(
    {
      AWS_LAMBDA_FUNCTION_NAME: "live-run",
      CONTEXT: "production",
      NETLIFY_DEV: undefined,
      RN_ISOLATED_QA: undefined,
      LIVE_BLOB_STORE: undefined,
      LIVE_STORE_DRIVER: undefined,
      NETLIFY_BLOBS_CONTEXT: v2Context,
    },
    async () => {
      resetRuntimeStores();
      setLiveTestHooks({});
      connectBlobs({ headers: {} });
      assert(
        "Functions v2 context keeps uncachedEdgeURL when the event has no Lambda blobs payload",
        blobsHasUncachedEdge() === true,
      );
      const origFetch = globalThis.fetch;
      let fetchedUncached = false;
      globalThis.fetch = async (input) => {
        const href = String(input && input.url ? input.url : input);
        if (/blobs-uncached\.example/.test(href)) fetchedUncached = true;
        return new Response("unavailable", { status: 404, headers: { "content-type": "text/plain" } });
      };
      try {
        try {
          await getRuntimeStore(liveStoreName());
          fail("expected hosted strong-path probe failure");
        } catch (e) {
          const msg = String((e && e.message) || e);
          assert(
            "v2 live store uses strong Blobs access instead of fail-closed missing uncachedEdgeURL",
            fetchedUncached === true &&
              e.code !== "live_blobs_strong_unavailable" &&
              !/Live runs need Netlify Blobs strong consistency/.test(msg),
            `${msg} fetchedUncached=${fetchedUncached} code=${e.code}`,
          );
        }

        resetRuntimeStores();
        const posted = await liveRun(
          {
            httpMethod: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug: "live-demo" }),
          },
          { clientContext: { user: { sub: "nf-user-1", email: "host@example.com" } } },
        );
        const postedMsg = String(posted.body || "");
        assert(
          "hosted live-run POST with v2 Identity does not fail-closed on missing uncachedEdgeURL",
          posted.statusCode !== 401 &&
            !/Live runs need Netlify Blobs strong consistency/.test(postedMsg) &&
            !/live_blobs_strong_unavailable/.test(postedMsg),
          `status=${posted.statusCode} body=${postedMsg.slice(0, 300)}`,
        );
      } finally {
        globalThis.fetch = origFetch;
      }
    },
  );

  await blobsTokenRotationTests();
  await nativeRuntimeAuthTests();
  nodeEngineTests();
}

async function nativeRuntimeAuthTests() {
  assert("live-run default export is the Functions v2 withLambda wrapper", typeof liveRunDefault === "function");
  const wrapped = asNetlifyFunction(async (event, context) => {
    const op = await requireOperatorAuth(event, context);
    if (op.error) return op.error;
    return { statusCode: 200, body: JSON.stringify({ sub: op.user.sub, email: op.user.email }) };
  });

  await withEnv(
    {
      AWS_LAMBDA_FUNCTION_NAME: "live-run",
      CONTEXT: "production",
      NETLIFY_DEV: undefined,
      RN_ISOLATED_QA: undefined,
      LIVE_DEV_AUTH: undefined,
    },
    async () => {
      const prevIdentity = globalThis.netlifyIdentityContext;
      globalThis.netlifyIdentityContext = {
        user: { sub: "nf-user-1", email: "host@example.com" },
      };
      try {
        const res = await wrapped(
          new Request("https://example.netlify.app/.netlify/functions/live-run", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
          }),
          { requestId: "native-auth" },
        );
        const body = await res.json();
        assert(
          "Functions v2 getUser maps Identity claims onto operator clientContext (no unsigned JWT)",
          res.status === 200 && body.sub === "nf-user-1" && body.email === "host@example.com",
          JSON.stringify(body),
        );
      } finally {
        if (prevIdentity === undefined) delete globalThis.netlifyIdentityContext;
        else globalThis.netlifyIdentityContext = prevIdentity;
      }

      const denied = await wrapped(
        new Request("https://example.netlify.app/.netlify/functions/live-run", {
          method: "POST",
          headers: {
            authorization: `Bearer ${DEV_BEARER}`,
            "content-type": "application/json",
          },
          body: "{}",
        }),
        { requestId: "native-auth-unsigned" },
      );
      const deniedBody = await denied.text();
      assert(
        "hosted Functions v2 refuses unsigned JWT when Identity context is absent",
        denied.status === 401 && /Unauthorized/i.test(deniedBody),
        `status=${denied.status} body=${deniedBody.slice(0, 200)}`,
      );
    },
  );

  await studioWidgetRefreshTests();
  await hostedBearerVerificationTests();
}

async function studioWidgetRefreshTests() {
  let jwtCalls = 0;
  const stale = "stale-cached-access-token";
  const fresh = "fresh-refreshed-access-token";
  const result = await identityAuthHeaders({
    currentUser: () => ({
      token: { access_token: stale, expires_at: Date.now() - 60_000 },
      jwt: async () => {
        jwtCalls += 1;
        return fresh;
      },
    }),
  });
  assert(
    "Studio authHeaders uses user.jwt() instead of cached access_token",
    jwtCalls === 1 &&
      result.source === "jwt" &&
      result.headers.Authorization === `Bearer ${fresh}` &&
      !String(result.headers.Authorization).includes(stale),
    JSON.stringify(result),
  );

  let forceCalls = 0;
  const forced = await identityForceRefresh({
    currentUser: () => ({
      jwt: async (force) => {
        forceCalls += 1;
        assert("401 retry asks user.jwt(true)", force === true);
        return "forced-token";
      },
    }),
  });
  assert("Studio 401 retry force-refreshes via user.jwt(true)", forceCalls === 1 && forced === "forced-token");

  const failedRefreshCalls = { n: 0 };
  const failed = await identityAuthHeaders({
    currentUser: () => ({
      jwt: async () => {
        throw new Error("refresh failed");
      },
    }),
    widgetRefresh: async () => {
      failedRefreshCalls.n += 1;
      return "should-not-run";
    },
  });
  assert(
    "failed jwt() refresh does not send a stale token or call widget.refresh",
    failed.source === "jwt-failed" &&
      failed.headers.Authorization == null &&
      failedRefreshCalls.n === 0 &&
      identitySessionExpired(failed.source) === true,
    JSON.stringify(failed),
  );
  assert(
    "rejected refresh uses a session-expired message, not generic Unauthorized",
    SESSION_EXPIRED_MESSAGE.includes("expired") && !/Unauthorized/.test(SESSION_EXPIRED_MESSAGE),
  );

  let refreshCalls = 0;
  const present = await identityAuthHeaders({
    currentUser: () => ({
      jwt: async (force) => {
        assert("normal header path calls jwt() without forceRefresh", force == null || force === false);
        return "ok-token";
      },
    }),
    widgetRefresh: async () => {
      refreshCalls += 1;
      return "from-refresh";
    },
  });
  assert(
    "currentUser.jwt() is used when present; widget.refresh is not a different signature",
    present.source === "jwt" &&
      present.headers.Authorization === "Bearer ok-token" &&
      refreshCalls === 0,
    JSON.stringify(present),
  );
}

async function hostedBearerVerificationTests() {
  const site = "https://site.example.netlify.app";
  const goodToken = "widget-access-token";
  const unsigned = DEV_BEARER;

  await withEnv(
    {
      AWS_LAMBDA_FUNCTION_NAME: "live-run",
      CONTEXT: "production",
      NETLIFY_DEV: undefined,
      RN_ISOLATED_QA: undefined,
      LIVE_DEV_AUTH: undefined,
      URL: site,
    },
    async () => {
      const origFetch = globalThis.fetch;
      const fetched = [];
      globalThis.fetch = async (input, init = {}) => {
        const href = String(input && input.url ? input.url : input);
        fetched.push({
          href,
          auth: String(init.headers?.Authorization || init.headers?.authorization || ""),
        });
        if (href === `${site}/.netlify/identity/user` && init.headers?.Authorization === `Bearer ${goodToken}`) {
          return new Response(JSON.stringify({ id: "verified-user", email: "host@example.com" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (href.includes("/.netlify/identity/user")) {
          return new Response(JSON.stringify({ error: "invalid token" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("unexpected", { status: 500 });
      };
      try {
        const ok = await verifyIdentityBearer({
          headers: {
            authorization: `Bearer ${goodToken}`,
            host: "evil.example",
            origin: "https://evil.example",
          },
        });
        assert(
          "valid widget Bearer is verified via trusted Identity /user",
          ok?.sub === "verified-user" && ok?.email === "host@example.com",
          JSON.stringify(ok),
        );
        assert(
          "Identity /user URL comes from site URL, not Host/Origin/JWT iss",
          fetched.length === 1 && fetched[0].href === `${site}/.netlify/identity/user`,
          JSON.stringify(fetched),
        );

        const denied = await verifyIdentityBearer({
          headers: { authorization: `Bearer ${unsigned}` },
        });
        assert("invalid/unsigned Bearer is rejected by Identity /user", denied === null);

        const wrapped = asNetlifyFunction(async (event, context) => {
          const op = await requireOperatorAuth(event, context);
          if (op.error) return op.error;
          return { statusCode: 200, body: JSON.stringify({ sub: op.user.sub }) };
        });
        const allowed = await wrapped(
          new Request("https://example.netlify.app/.netlify/functions/live-run", {
            method: "POST",
            headers: {
              authorization: `Bearer ${goodToken}`,
              host: "evil.example",
              "content-type": "application/json",
            },
            body: "{}",
          }),
          { requestId: "bearer-ok" },
        );
        const allowedBody = await allowed.json();
        assert(
          "Functions v2 accepts verified widget Bearer without runtime getUser",
          allowed.status === 200 && allowedBody.sub === "verified-user",
          JSON.stringify(allowedBody),
        );

        const blocked = await wrapped(
          new Request("https://example.netlify.app/.netlify/functions/live-run", {
            method: "POST",
            headers: {
              authorization: `Bearer ${unsigned}`,
              "content-type": "application/json",
            },
            body: "{}",
          }),
          { requestId: "bearer-bad" },
        );
        assert(
          "Functions v2 still 401s an unverified widget Bearer",
          blocked.status === 401,
          await blocked.text(),
        );
      } finally {
        globalThis.fetch = origFetch;
      }
    },
  );
}

function nodeEngineTests() {
  const need = ">=22.12.0";
  for (const name of ["@netlify/aws-lambda-compat", "@netlify/identity", "@netlify/blobs"]) {
    const pkg = JSON.parse(readFileSync(new URL(`../node_modules/${name}/package.json`, import.meta.url), "utf8"));
    assert(`${name} engines.node is ${need}`, pkg.engines?.node === need, JSON.stringify(pkg.engines));
  }
  const [major, minor] = String(process.versions.node)
    .split(".")
    .map((n) => Number(n));
  assert(
    "local Node satisfies Functions v2 packages (>=22.12)",
    major > 22 || (major === 22 && minor >= 12),
    process.version,
  );
  const nvmrc = readFileSync(new URL("../.nvmrc", import.meta.url), "utf8").trim();
  const toml = readFileSync(new URL("../netlify.toml", import.meta.url), "utf8");
  const rootPkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert(
    "repo pins Node 22 so hosted build/functions match package engines",
    nvmrc === "22" &&
      /NODE_VERSION\s*=\s*"22"/.test(toml) &&
      rootPkg.engines?.node === need,
    `nvmrc=${nvmrc} engines=${rootPkg.engines?.node}`,
  );
}

async function hostedBundleTests() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dir = await mkdtemp(path.join(os.tmpdir(), "rn-hosted-bundle-"));
  try {
    const esbuild = await import("esbuild");
    const casOut = path.join(dir, "cas-store.cjs");
    const runtimeOut = path.join(dir, "blob-runtime.cjs");
    await esbuild.build({
      absWorkingDir: root,
      entryPoints: [path.join(root, "netlify/functions/lib/cas-store.mjs")],
      bundle: true,
      format: "cjs",
      platform: "node",
      outfile: casOut,
      define: { "import.meta.url": "undefined" },
    });
    await esbuild.build({
      absWorkingDir: root,
      entryPoints: [path.join(root, "netlify/functions/lib/blob-runtime.mjs")],
      bundle: true,
      format: "cjs",
      platform: "node",
      outfile: runtimeOut,
      define: { "import.meta.url": "undefined" },
    });

    const bundled = readFileSync(runtimeOut, "utf8");
    assert(
      "CJS blob-runtime bundle inlines @netlify/blobs (no unresolved external require)",
      !/require\(["']@netlify\/blobs["']\)/.test(bundled),
      bundled.slice(0, 200),
    );

    const spawnCjs = (source) =>
      spawnSync(process.execPath, ["-e", source], {
        encoding: "utf8",
        cwd: root,
        env: { ...process.env, NODE_PATH: path.join(root, "node_modules") },
      });

    const cas = spawnCjs(
      `const m = require(${JSON.stringify(casOut)});
         try { m.defaultFileStoreDir(); process.exit(2); }
         catch (e) {
           const msg = String(e && e.message || e);
           if (/Received undefined/.test(msg)) process.exit(3);
           if (/File CAS|file driver|hosted/i.test(msg)) process.exit(0);
           console.error(msg);
           process.exit(4);
         }`,
    );
    assert(
      "CJS bundle defaultFileStoreDir does not call fileURLToPath(undefined)",
      cas.status === 0,
      cas.stderr || cas.stdout || `status=${cas.status}`,
    );

    const runtime = spawnCjs(
      `process.env.AWS_LAMBDA_FUNCTION_NAME = "live-run";
         delete process.env.CONTEXT;
         delete process.env.NETLIFY_DEV;
         delete process.env.RN_ISOLATED_QA;
         process.env.LIVE_STORE_DRIVER = "file";
         const m = require(${JSON.stringify(runtimeOut)});
         (async () => {
           try {
             await m.getRuntimeStore(m.liveStoreName());
             console.error("expected throw");
             process.exit(2);
           } catch (e) {
             const msg = String(e && e.message || e);
             if (/Received undefined/.test(msg)) process.exit(3);
             if (/cannot be enabled on hosted|File CAS|unavailable/i.test(msg)) process.exit(0);
             console.error(msg);
             process.exit(4);
           }
         })();`,
    );
    assert(
      "CJS hosted Lambda never falls back to fileURLToPath(undefined)",
      runtime.status === 0,
      runtime.stderr || runtime.stdout || `status=${runtime.status}`,
    );

    const runtimeStrong = spawnCjs(
      `process.env.AWS_LAMBDA_FUNCTION_NAME = "live-run";
         delete process.env.CONTEXT;
         delete process.env.NETLIFY_DEV;
         delete process.env.RN_ISOLATED_QA;
         delete process.env.LIVE_STORE_DRIVER;
         delete process.env.NETLIFY_BLOBS_CONTEXT;
         const m = require(${JSON.stringify(runtimeOut)});
         (async () => {
           try {
             await m.getRuntimeStore(m.liveStoreName());
             console.error("expected throw");
             process.exit(2);
           } catch (e) {
             const msg = String(e && e.message || e);
             if (/Received undefined/.test(msg)) process.exit(3);
             if (/uncachedEdgeURL/i.test(msg) && /will not fall back to eventual reads/i.test(msg) && e.statusCode === 503) process.exit(0);
             console.error(msg);
             process.exit(4);
           }
         })();`,
    );
    assert(
      "CJS hosted Lambda without uncachedEdgeURL fails closed (no fileURLToPath)",
      runtimeStrong.status === 0,
      runtimeStrong.stderr || runtimeStrong.stdout || `status=${runtimeStrong.status}`,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function demoExperience() {
  const pollA = id();
  const pollB = id();
  const fillC1 = id();
  const fillC2 = id();
  const fillQ = id();
  const fillQ2 = id();
  const fillC3 = id();
  const fillC4 = id();
  const quizC1 = id();
  const quizC2 = id();
  const quizQ = id();
  const steps = [
    { id: "step-poll", moduleInstanceId: "m-poll", moduleType: "mini-poll", label: "Poll", liveCapable: true },
    { id: "step-fill", moduleInstanceId: "m-fill", moduleType: "fill-game", label: "Fill", liveCapable: true },
    { id: "step-quiz", moduleInstanceId: "m-quiz", moduleType: "mini-quiz", label: "Quiz", liveCapable: true },
    { id: "step-pin", moduleInstanceId: "m-pin", moduleType: "pinboard", label: "Pinboard", liveCapable: true },
    { id: "step-wheel", moduleInstanceId: "m-wheel", moduleType: "spinning-wheel", label: "Wheel", liveCapable: true },
    { id: "step-scratch", moduleInstanceId: "m-scratch", moduleType: "scratcher", label: "Scratcher", liveCapable: true },
  ];
  const snapshot = {
    title: "Live test flow",
    joinScreen: { headline: "Join" },
    steps,
    configs: {
      "step-poll": {
        id: "m-poll",
        gameType: "mini-poll",
        question: "Left or right?",
        options: [
          { id: pollA, label: "Left" },
          { id: pollB, label: "Right" },
        ],
        revealDurationMs: 1200,
      },
      "step-fill": {
        id: "m-fill",
        gameType: "fill-game",
        teams: [
          { id: "team-a", name: "Lager", target: 20, colorHex: "#c4a35a" },
          { id: "team-b", name: "Stout", target: 20, colorHex: "#2b2118" },
        ],
        questions: [
          {
            id: fillQ,
            prompt: "Fill 1?",
            choices: [
              { id: fillC1, label: "Yes" },
              { id: fillC2, label: "No" },
            ],
            correctChoiceId: fillC1,
          },
          {
            id: fillQ2,
            prompt: "Fill 2?",
            choices: [
              { id: fillC3, label: "Yes" },
              { id: fillC4, label: "No" },
            ],
            correctChoiceId: fillC3,
          },
        ],
      },
      "step-quiz": {
        id: "m-quiz",
        gameType: "mini-quiz",
        questions: [
          {
            id: quizQ,
            prompt: "Quiz?",
            choices: [
              { id: quizC1, label: "Correct" },
              { id: quizC2, label: "Wrong" },
            ],
            correctChoiceId: quizC1,
          },
        ],
      },
      "step-pin": { id: "m-pin", gameType: "pinboard", title: "Pin" },
      "step-wheel": {
        id: "m-wheel",
        gameType: "spinning-wheel",
        spin: { durationMs: 2500, minFullRotations: 4, maxFullRotations: 5 },
      },
      "step-scratch": { id: "m-scratch", gameType: "scratcher" },
    },
    secrets: {
      "step-fill": {
        questions: [
          { id: fillQ, correctChoiceId: fillC1, choices: [{ id: fillC1 }, { id: fillC2 }] },
          { id: fillQ2, correctChoiceId: fillC3, choices: [{ id: fillC3 }, { id: fillC4 }] },
        ],
      },
      "step-quiz": {
        questions: [{ id: quizQ, correctChoiceId: quizC1, choices: [{ id: quizC1 }, { id: quizC2 }] }],
      },
    },
  };
  const experience = {
    id: "exp-live-test",
    slug: "live-demo",
    title: "Live test flow",
    foundation: { interactive: true },
  };
  return { experience, snapshot, pollA, pollB, fillQ, fillC1, quizQ, quizC1 };
}

function attemptFields(state) {
  const step = (state.steps || []).find((s) => s.current);
  const kind = state.activity?.kind || "lobby";
  return {
    runId: state.runId,
    nodeId: step?.id || kind,
    roundAttemptId: state.roundAttemptId,
  };
}

class FakeEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.attributes = {};
    this.textContent = "";
    this.innerHTML = "";
    this.src = "";
    this.alt = "";
  }
  replaceChildren() {
    this.children = [];
    this.innerHTML = "";
    this.textContent = "";
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
}

async function isolatedCasJoin() {
  const store = createMemoryCasStore();
  setLiveTestHooks({ store });
  const run = {
    revision: 0,
    runId: "r1",
    code: "CAS001",
    hostKey: "hk",
    status: "lobby",
    held: false,
    currentStepIndex: -1,
    roundAttemptId: "a1",
    snapshot: { steps: [], configs: {} },
    nextParticipantNumber: 1,
    participants: {},
    prizeLedger: { awards: {} },
    node: { kind: "lobby", phase: "idle" },
    commandLog: {},
  };
  await createLiveRunRecord("CAS001", run);
  const results = await Promise.allSettled([
    updateLiveRun("CAS001", (current) => {
      joinParticipant(current, "", "");
      return current;
    }),
    updateLiveRun("CAS001", (current) => {
      joinParticipant(current, "", "");
      return current;
    }),
  ]);
  const stored = await getLiveRun("CAS001");
  const ids = Object.keys(stored.participants || {});
  const acked = results.filter((r) => r.status === "fulfilled").length;
  assert(
    "isolated concurrent updateLiveRun persists both participants",
    acked === 2 && ids.length === 2,
    `acknowledged=${acked} stored=${ids.join(",") || "(none)"} revision=${stored.revision}`,
  );
  if (acked !== 2 || ids.length !== 2) {
    throw new Error("CAS isolated join failed; aborting remaining checks");
  }
}

async function pinboardDomRegression() {
  const src = readFileSync(new URL("../packages/player/src/live/master.ts", import.meta.url), "utf8");
  assert(
    "master.ts does not interpolate pinboard text into innerHTML",
    !/innerHTML[\s\S]{0,240}s\.text/.test(src) && !/s\.text[\s\S]{0,80}innerHTML/.test(src) && src.includes("fillPinboardCard"),
    "source still looks like HTML interpolation",
  );
  const card = new FakeEl("div");
  const payload = {
    text: `<img src=x onerror="alert(1)"><script>document.title="pwned"</script>`,
    participantNumber: 7,
    status: "pending",
  };
  const fakeDoc = { createElement: (tag) => new FakeEl(tag) };
  const prev = globalThis.document;
  globalThis.document = fakeDoc;
  try {
    fillPinboardCard(card, payload, { code: "ABC", hostKey: "hk" });
  } finally {
    globalThis.document = prev;
  }
  const texts = [card, ...card.children].map((el) => el.textContent);
  const htmlJoined = [card, ...card.children].map((el) => el.innerHTML).join("");
  const scriptKids = card.children.filter((c) => String(c.tagName).toLowerCase() === "script");
  assert(
    "HTML-like pinboard note displays as textContent",
    texts.includes(payload.text) && !scriptKids.length && !/onerror/i.test(htmlJoined),
    `texts=${JSON.stringify(texts)} innerHTML=${htmlJoined}`,
  );
}

async function fullFlow() {
  const store = createMemoryCasStore();
  const fixture = demoExperience();
  setLiveTestHooks({
    store,
    loadExperience: async (slug) => (slug === fixture.experience.slug ? fixture.experience : null),
    buildSnapshot: async () => fixture.snapshot,
  });

  const unauth = await call(liveRun, event({ method: "POST", body: { slug: "live-demo" } }));
  assert("unauthenticated live-run create is 401", unauth.status === 401, `status=${unauth.status}`);

  const created = await must(liveRun, event({ method: "POST", body: { slug: "live-demo" } }), operatorCtx);
  const code = created.code;
  const hostKey = created.hostKey;
  assert("operator create returns hostKey", !!(code && hostKey));

  const reopen = await must(liveRun, event({ method: "POST", body: { slug: "live-demo" } }), operatorCtx);
  assert(
    "operator reopen returns the existing run and hostKey",
    reopen.code === code && reopen.hostKey === hostKey && reopen.reused === true,
    `code=${reopen.code} reused=${reopen.reused}`,
  );
  const stranger = await call(liveRun, event({ method: "POST", body: { slug: "live-demo" } }));
  assert("unauthenticated reopen of an active run is 409", stranger.status === 409, `status=${stranger.status}`);

  const forceUnauth = await call(liveRun, event({ method: "POST", body: { slug: "live-demo", forceNew: true } }));
  assert("unauthenticated forceNew is 403", forceUnauth.status === 403, `status=${forceUnauth.status}`);

  const joins = await Promise.all(
    Array.from({ length: N }, () =>
      must(liveJoin, event({ method: "POST", body: { code } })),
    ),
  );
  const ids = joins.map((j) => j.participantId);
  const numbers = joins.map((j) => j.participantNumber).sort((a, b) => a - b);
  const uniqueIds = new Set(ids);
  const uniqueNumbers = new Set(numbers);
  assert("15 unique participant identities persisted", uniqueIds.size === N && uniqueNumbers.size === N, `ids=${uniqueIds.size} numbers=${uniqueNumbers.size}`);

  const storedAfterJoin = await getLiveRun(code);
  assert(
    "stored participant count matches 15 acknowledged joins",
    Object.keys(storedAfterJoin.participants || {}).length === N,
    `stored=${Object.keys(storedAfterJoin.participants || {}).length}`,
  );

  const reconnects = await Promise.all(
    joins.map((j) =>
      must(liveJoin, event({ method: "POST", body: { code, participantId: j.participantId, secret: j.secret } })),
    ),
  );
  assert(
    "reconnect returns the same identities",
    reconnects.every((r, i) => r.participantId === joins[i].participantId && r.participantNumber === joins[i].participantNumber),
  );

  const resumeNoSecret = await call(
    liveJoin,
    event({ method: "POST", body: { code, participantId: joins[0].participantId } }),
  );
  assert("resume without secret is 403", resumeNoSecret.status === 403, `status=${resumeNoSecret.status}`);

  const readNoSecret = await call(
    liveRun,
    event({ method: "GET", query: { code, role: "participant", participantId: joins[0].participantId } }),
  );
  assert("participant GET without secret is 403", readNoSecret.status === 403, `status=${readNoSecret.status}`);

  const publicGet = await must(liveRun, event({ method: "GET", query: { code, role: "public" } }));
  assert("public projection has no me/secret", !publicGet.state.me && !JSON.stringify(publicGet.state).includes(joins[0].secret));

  const credGet = await must(
    liveRun,
    event({
      method: "GET",
      query: { code, role: "participant", participantId: joins[0].participantId },
      headers: { "x-live-secret": joins[0].secret },
    }),
  );
  assert("authenticated participant GET includes me", credGet.state.me?.participantId === joins[0].participantId);

  const presenceToken = credGet.state.viewToken;
  const aged = new Date(Date.now() - 120_000).toISOString();
  const cas = await liveCasStore();
  await cas.setJSON(`liverun-seen:${code}:${joins[0].participantId}`, { at: aged });
  const afterAge = await must(
    liveRun,
    event({
      method: "GET",
      query: { code, role: "participant", rev: presenceToken, participantId: joins[0].participantId },
      headers: { "x-live-secret": joins[0].secret },
    }),
  );
  assert(
    "presence change is visible without a run revision bump",
    afterAge.changed === true && Number(afterAge.state.connectedCount) === N - 1,
    `changed=${afterAge.changed} connected=${afterAge.state?.connectedCount} rev=${afterAge.state?.revision} tokenWas=${presenceToken}`,
  );
  await writePresence(code, joins[0].participantId);

  async function control(action, extra = {}) {
    return must(liveControl, event({ method: "POST", body: { code, hostKey, action, commandId: id(), ...extra } }));
  }
  async function act(j, action, extra = {}) {
    const state =
      extra.state ||
      (
        await must(
          liveRun,
          event({
            method: "GET",
            query: { code, role: "participant", participantId: j.participantId },
            headers: { "x-live-secret": j.secret },
          }),
        )
      ).state;
    return call(
      liveAction,
      event({
        method: "POST",
        body: {
          code,
          participantId: j.participantId,
          secret: j.secret,
          action,
          commandId: extra.commandId || id(),
          ...attemptFields(state),
          ...extra,
          state: undefined,
        },
      }),
    );
  }

  await control("next");
  await control("open");
  await control("hold");
  const heldVote = await act(joins[0], "vote", { optionId: fixture.pollA });
  assert("hold blocks votes", heldVote.status === 423, `status=${heldVote.status}`);
  await control("resume");

  const voteCmd0 = id();
  const votes = await Promise.all(
    joins.map((j, i) => act(j, "vote", { optionId: fixture.pollA, commandId: i === 0 ? voteCmd0 : id() })),
  );
  const voteOk = votes.filter((v) => v.status === 200);
  assert("all 15 poll votes acknowledged", voteOk.length === N, `ok=${voteOk.length}`);
  const afterVotes = await getLiveRun(code);
  const storedVotes = Object.keys(afterVotes.node?.votes || {}).length;
  assert("stored vote count equals 15 acknowledged votes", storedVotes === N, `stored=${storedVotes}`);
  const ackIds = voteOk.map((v, i) => (v.status === 200 ? joins[i].participantId : null)).filter(Boolean);
  // Promise.all preserves order
  const orderedAck = joins.filter((_, i) => votes[i].status === 200).map((j) => j.participantId);
  assert(
    "every acknowledged voter is persisted",
    orderedAck.every((pid) => afterVotes.node.votes[pid] === fixture.pollA) && orderedAck.length === N,
  );

  const retryVote = await act(joins[0], "vote", { optionId: fixture.pollA, commandId: voteCmd0 });
  assert(
    "duplicate vote command returns stored outcome without a second vote",
    retryVote.status === 200 && retryVote.data.result?.duplicate && retryVote.data.result?.optionId === fixture.pollA,
    `status=${retryVote.status} ${JSON.stringify(retryVote.data.result || retryVote.data)}`,
  );
  const still15 = await getLiveRun(code);
  assert("duplicate command did not add a vote", Object.keys(still15.node.votes).length === N);

  const staleVote = await act(joins[0], "vote", {
    optionId: fixture.pollA,
    roundAttemptId: "not-this-round",
    nodeId: "step-poll",
    runId: still15.runId,
    commandId: id(),
  });
  assert("stale round vote is rejected", staleVote.status === 409, `status=${staleVote.status} ${staleVote.data.error || ""}`);

  await control("tally");
  const tallying = await must(liveRun, event({ method: "GET", query: { code, role: "public" } }));
  assert("poll is tallying before the cue completes", tallying.state.activity.phase === "tallying", `phase=${tallying.state.activity.phase}`);
  assert("public tally stays hidden while tallying", tallying.state.activity.tally == null);
  const tallyToken = tallying.state.viewToken;
  const storedRevAtTally = (await getLiveRun(code)).revision;
  const tallyUnchanged = await must(liveRun, event({ method: "GET", query: { code, role: "public", rev: tallyToken } }));
  assert("tallying GET with viewToken is unchanged", tallyUnchanged.changed === false);

  await sleep(1300);

  async function pollAfterCue(role, extra = {}) {
    return must(liveRun, event({ method: "GET", query: { code, role, rev: tallyToken, ...extra.query }, headers: extra.headers || {} }));
  }
  const pubReveal = await pollAfterCue("public");
  const partReveal = await pollAfterCue("participant", {
    query: { participantId: joins[0].participantId },
    headers: { "x-live-secret": joins[0].secret },
  });
  const modReveal = await pollAfterCue("moderator", { query: { hostKey } });
  assert(
    "public poll GET with stale viewToken reveals after timer without a write",
    pubReveal.changed === true && pubReveal.state.activity.phase === "revealed" && pubReveal.state.activity.tally?.total === N,
    `changed=${pubReveal.changed} phase=${pubReveal.state?.activity?.phase}`,
  );
  assert("participant poll GET reveals after timer", partReveal.changed === true && partReveal.state.activity.phase === "revealed");
  assert("moderator poll GET reveals after timer", modReveal.changed === true && modReveal.state.activity.phase === "revealed");
  assert(
    "stored revision unchanged across automatic poll reveal",
    (await getLiveRun(code)).revision === storedRevAtTally,
    `rev=${(await getLiveRun(code)).revision} expected=${storedRevAtTally}`,
  );

  const cmdNextA = id();
  await control("next", { commandId: cmdNextA }); // fill
  await control("open");
  const fillState = (
    await must(
      liveRun,
      event({
        method: "GET",
        query: { code, role: "participant", participantId: joins[0].participantId },
        headers: { "x-live-secret": joins[0].secret },
      }),
    )
  ).state;
  assert(
    "fill phone projection uses configured team name and colour",
    (fillState.me?.teamName === "Lager" || fillState.me?.teamName === "Stout") &&
      (fillState.me?.teamColorHex === "#c4a35a" || fillState.me?.teamColorHex === "#2b2118") &&
      fillState.me?.teamName !== fillState.me?.teamId,
    `teamName=${fillState.me?.teamName} teamId=${fillState.me?.teamId} hex=${fillState.me?.teamColorHex}`,
  );
  const fillAnswers = await Promise.all(
    joins.slice(0, 6).map((j) => act(j, "answer", { questionId: fixture.fillQ, choiceId: fixture.fillC1, state: fillState })),
  );
  assert(
    "fill answers accepted",
    fillAnswers.every((v) => v.status === 200),
    fillAnswers.map((v) => v.status + (v.data.error || "")).join(","),
  );
  const staleFill = await act(joins[6], "answer", {
    questionId: "old-question",
    choiceId: fixture.fillC1,
    state: fillState,
  });
  assert("stale fill questionId is rejected", staleFill.status === 409, `status=${staleFill.status}`);

  const cmdNextB = id();
  await control("next", { commandId: cmdNextB }); // quiz
  const retryA = await call(
    liveControl,
    event({ method: "POST", body: { code, hostKey, action: "next", commandId: cmdNextA } }),
  );
  const afterRetry = await getLiveRun(code);
  const quizIndex = afterRetry.snapshot.steps.findIndex((s) => s.moduleType === "mini-quiz");
  assert(
    "retrying command A after B does not re-apply A",
    retryA.status === 200 && retryA.data.result?.duplicate && afterRetry.currentStepIndex === quizIndex,
    `index=${afterRetry.currentStepIndex} expected=${quizIndex} dup=${retryA.data.result?.duplicate}`,
  );

  await control("open");
  const quizState = (
    await must(
      liveRun,
      event({
        method: "GET",
        query: { code, role: "participant", participantId: joins[0].participantId },
        headers: { "x-live-secret": joins[0].secret },
      }),
    )
  ).state;
  const quizAnswers = await Promise.all(joins.map((j) => act(j, "answer", { questionId: fixture.quizQ, choiceId: fixture.quizC1, state: quizState })));
  const quizOk = quizAnswers.filter((v) => v.status === 200);
  assert("all 15 quiz answers acknowledged", quizOk.length === N, `ok=${quizOk.length}`);
  const quizStored = await getLiveRun(code);
  assert("stored quiz answers equal 15", Object.keys(quizStored.node.answers || {}).length === N);

  await control("next"); // pinboard
  const pinState = (
    await must(
      liveRun,
      event({
        method: "GET",
        query: { code, role: "participant", participantId: joins[2].participantId },
        headers: { "x-live-secret": joins[2].secret },
      }),
    )
  ).state;
  const xss = `<img src=x onerror="alert(1)">hello`;
  const pin = await act(joins[2], "submit", { kind: "note", text: xss, state: pinState });
  assert("pinboard note stored", pin.status === 200, `status=${pin.status} ${pin.data.error || ""}`);
  const masterPin = await must(liveRun, event({ method: "GET", query: { code, role: "moderator", hostKey } }));
  const note = (masterPin.state.activity.submissions || [])[0];
  assert("moderator projection keeps pinboard text literal", note?.text === xss, `text=${note?.text}`);

  await control("next"); // wheel
  const agedIso = new Date(Date.now() - 120_000).toISOString();
  await updateLiveRun(code, (current) => {
    for (const p of Object.values(current.participants || {})) p.lastSeen = agedIso;
    return current;
  });
  await Promise.all(joins.map((j) => writePresence(code, j.participantId)));
  const spin = await control("spin");
  assert("wheel spin reserves a prize", spin.result?.winnerNumber != null || spin.state?.activity?.winnerNumber != null);
  const storedAfterSpin = await getLiveRun(code);
  assert(
    "command presence does not overwrite stored lastSeen",
    Object.values(storedAfterSpin.participants || {}).every((p) => p.lastSeen === agedIso),
  );
  const spinning = await must(liveRun, event({ method: "GET", query: { code, role: "public" } }));
  const spinToken = spinning.state.viewToken;
  const storedRevAtSpin = (await getLiveRun(code)).revision;
  if (spinning.state.activity.phase === "spinning") {
    const spinUnchanged = await must(liveRun, event({ method: "GET", query: { code, role: "public", rev: spinToken } }));
    assert("spinning GET with viewToken is unchanged", spinUnchanged.changed === false);
    await sleep(Number(spinning.state.activity.durationMs || 2500) + 500);
    const spun = await must(liveRun, event({ method: "GET", query: { code, role: "public", rev: spinToken } }));
    assert(
      "public wheel GET reveals after spin timer without a write",
      spun.changed === true && spun.state.activity.phase === "revealed",
      `changed=${spun.changed} phase=${spun.state?.activity?.phase}`,
    );
    const partSpin = await must(
      liveRun,
      event({
        method: "GET",
        query: { code, role: "participant", rev: spinToken, participantId: joins[0].participantId },
        headers: { "x-live-secret": joins[0].secret },
      }),
    );
    assert("participant wheel GET reveals after timer", partSpin.changed === true && partSpin.state.activity.phase === "revealed");
    assert("stored revision unchanged across automatic wheel reveal", (await getLiveRun(code)).revision === storedRevAtSpin);
  }

  const afterWheel = await getLiveRun(code);
  const wheelWinner = afterWheel.node.winnerParticipantId;
  const awards = Object.keys(afterWheel.prizeLedger.awards || {});
  assert("wheel prize ledger has exactly one winner", awards.length === 1 && awards[0] === wheelWinner);

  await control("next"); // scratcher
  const release = await control("release", { winnerCount: 1 });
  assert("scratcher release succeeds", Number(release.result?.recipientCount) === N - 1, `recipients=${release.result?.recipientCount}`);
  const afterRelease = await getLiveRun(code);
  const tickets = afterRelease.node.tickets || {};
  assert("wheel winner is excluded from scratcher tickets", !tickets[wheelWinner], "winner still received a ticket");
  assert("scratcher tickets issued to remaining eligible", Object.keys(tickets).length === N - 1, `tickets=${Object.keys(tickets).length}`);
  const winnerTicket = Object.values(tickets).find((t) => t.isWin);
  assert("scratcher reserved a win at release", !!winnerTicket);
  const scratchPlayer = joins.find((j) => j.participantId === winnerTicket.participantId);
  const oldTicketReveal = await act(scratchPlayer, "reveal-ticket", {
    ticketId: "stale-ticket",
    state: (
      await must(
        liveRun,
        event({
          method: "GET",
          query: { code, role: "participant", participantId: scratchPlayer.participantId },
          headers: { "x-live-secret": scratchPlayer.secret },
        }),
      )
    ).state,
  });
  assert("delayed scratch with stale ticketId is rejected", oldTicketReveal.status === 409, `status=${oldTicketReveal.status}`);
  const goodReveal = await act(scratchPlayer, "reveal-ticket", {
    ticketId: winnerTicket.ticketId,
    state: (
      await must(
        liveRun,
        event({
          method: "GET",
          query: { code, role: "participant", participantId: scratchPlayer.participantId },
          headers: { "x-live-secret": scratchPlayer.secret },
        }),
      )
    ).state,
  });
  assert("matching ticket reveal succeeds", goodReveal.status === 200 && goodReveal.data.result?.isWin === true);

  const final = await getLiveRun(code);
  assert(
    "final run still has 15 participants",
    Object.keys(final.participants).length === N,
    `count=${Object.keys(final.participants).length}`,
  );

  const activeBefore = await getActiveRunCode(fixture.experience.id);
  try {
    await createActivatedLiveRun(
      createRunDocument({
        experience: fixture.experience,
        snapshot: fixture.snapshot,
        hostKey: "orphan-key",
        code: `F${id().replace(/-/g, "").slice(0, 5).toUpperCase()}`,
      }),
      { experienceId: fixture.experience.id, previousCode: "NOPE01" },
    );
    fail("failed reset pointer mismatch should throw");
  } catch {
    ok("failed reset throws when the active pointer does not match");
  }
  assert("failed reset leaves the previous active code", (await getActiveRunCode(fixture.experience.id)) === activeBefore);
  assert("failed reset does not supersede the live run", (await getLiveRun(activeBefore)).status !== "superseded");

  const concurrent = await Promise.all([
    call(liveRun, event({ method: "POST", body: { slug: "live-demo", forceNew: true } }), operatorCtx),
    call(liveRun, event({ method: "POST", body: { slug: "live-demo", forceNew: true } }), operatorCtx),
  ]);
  const won = concurrent.filter((r) => r.status === 200);
  const lost = concurrent.filter((r) => r.status !== 200);
  assert("concurrent reset acknowledges exactly one winner", won.length === 1, `wins=${won.length} statuses=${concurrent.map((r) => r.status).join(",")}`);
  assert("concurrent reset loser is a conflict", lost.length === 1 && (lost[0].status === 409 || lost[0].status === 500), `lost=${lost[0]?.status}`);
  const afterReset = await getActiveRunCode(fixture.experience.id);
  const afterRun = await getLiveRun(afterReset);
  assert("active run after concurrent reset is not superseded", afterRun.status !== "superseded");
  assert("winning reset is the active pointer", won[0].data.code === afterReset);
}

async function guardAndSeedTests() {
  const prevCtx = process.env.CONTEXT;
  const prevDriver = process.env.LIVE_STORE_DRIVER;
  setLiveTestHooks({});
  process.env.CONTEXT = "deploy-preview";
  process.env.LIVE_STORE_DRIVER = "memory";
  try {
    await getRuntimeStore("rngames-live-local");
    fail("hosted memory driver should be rejected");
  } catch (e) {
    assert(
      "hosted deploy-preview refuses memory/file drivers",
      /cannot be enabled on hosted/i.test(e.message || ""),
      e.message,
    );
  }
  process.env.CONTEXT = prevCtx || "";
  if (!prevCtx) delete process.env.CONTEXT;
  process.env.LIVE_STORE_DRIVER = prevDriver || "memory";

  const seedStore = createMemoryCasStore();
  setLiveTestHooks({ store: seedStore });
  const unauthSeed = await call(liveSeed, event({ method: "POST", body: {} }));
  assert("live-demo-seed without operator is 401", unauthSeed.status === 401, `status=${unauthSeed.status}`);

  process.env.CONTEXT = "branch-deploy";
  const hostedSeed = await call(liveSeed, event({ method: "POST", body: {} }), operatorCtx);
  assert("live-demo-seed is disabled on hosted deploys", hostedSeed.status === 403, `status=${hostedSeed.status}`);
  if (!prevCtx) delete process.env.CONTEXT;
  else process.env.CONTEXT = prevCtx;

  const seeded = await call(liveSeed, event({ method: "POST", body: {} }), operatorCtx);
  assert("local operator can seed into isolated platform store", seeded.status === 200, `status=${seeded.status} ${seeded.data.error || ""}`);

  const imageOnly = normalizeMiniPollRecord({
    id: "img-poll",
    slug: "img-poll",
    question: "Pick a side",
    options: [
      { id: "a", label: "", imageUrl: "https://example.test/a.png", accessibleLabel: "Left art" },
      { id: "b", label: "", imageUrl: "https://example.test/b.png", accessibleLabel: "Right art" },
    ],
  });
  assert("image-only poll keeps blank visible labels", imageOnly.options[0].label === "" && imageOnly.options[1].label === "");
  assert(
    "image-only poll keeps accessible names",
    imageOnly.options[0].accessibleLabel === "Left art" && imageOnly.options[1].accessibleLabel === "Right art",
  );
  const mixed = normalizeMiniPollRecord({
    id: "mix-poll",
    slug: "mix-poll",
    options: [
      { id: "a", label: "Text side", imageUrl: "", accessibleLabel: "Text side" },
      { id: "b", label: "", imageUrl: "https://example.test/b.png", accessibleLabel: "Photo side" },
    ],
  });
  assert("asymmetric poll keeps text on A and blank on B", mixed.options[0].label === "Text side" && mixed.options[1].label === "");

  const brandedPoll = normalizeMiniPollRecord({
    id: "brand-poll",
    slug: "brand-poll",
    clientName: "Any client",
    branding: {
      headlineHex: "#ff00aa",
      presenterBackgroundImageUrl: "https://example.test/presenter.png",
      fontUploads: { heading: { url: "https://example.test/qa.woff2", family: "QAFont" } },
      headingFont: "'QAFont', system-ui, sans-serif",
    },
  });
  assert("mini poll branding round-trips client + presenter art + font upload", brandedPoll.clientName === "Any client" && brandedPoll.branding.headlineHex === "#ff00aa" && brandedPoll.branding.presenterBackgroundImageUrl.endsWith("presenter.png") && brandedPoll.branding.fontUploads.heading?.family === "QAFont");

  const brandedFill = normalizeFillGameRecord({
    id: "brand-fill",
    slug: "brand-fill",
    clientName: "Bar ops",
    branding: { accentHex: "#123456", buttonHex: "#abcdef", buttonTextHex: "#010101" },
  });
  assert("fill game keeps Client and branding hexes", brandedFill.clientName === "Bar ops" && brandedFill.branding.accentHex === "#123456" && brandedFill.branding.buttonHex === "#abcdef");
  assert(
    "fill default window is full-bleed",
    brandedFill.maskPlacement.xPercent === 0 &&
      brandedFill.maskPlacement.yPercent === 0 &&
      brandedFill.maskPlacement.widthPercent === 100 &&
      brandedFill.maskPlacement.heightPercent === 100,
  );

  const zeroFill = normalizeFillGameRecord({
    id: "zero-fill",
    slug: "zero-fill",
    maskPlacement: { xPercent: 0, yPercent: 0, widthPercent: 53.33, heightPercent: 60.375 },
    overlayUrl: "https://example.test/overlay.png",
  });
  assert(
    "fill keeps zero X/Y and overlay alias",
    zeroFill.maskPlacement.xPercent === 0 &&
      zeroFill.maskPlacement.yPercent === 0 &&
      zeroFill.maskPlacement.widthPercent === 53.33 &&
      zeroFill.foregroundUrl.endsWith("overlay.png"),
  );

  const previewSrc = readFileSync(new URL("../packages/player/src/live/preview.ts", import.meta.url), "utf8");
  assert(
    "unsaved preview source never calls live run APIs",
    !/\/api\/live-(run|join|action|control)|liveEndpoint\(|liveJson\(/.test(previewSrc),
  );

  const flowLayout = {
    presenter: { alignX: "left", alignY: "top", paddingPx: 40, contentMaxWidthPx: 900, gapPx: 12, headingSizePx: 0, bodySizePx: 0 },
    phone: { alignX: "center", alignY: "top", paddingPx: 16, contentMaxWidthPx: 400, gapPx: 10, headingSizePx: 0, bodySizePx: 0 },
  };
  const inherited = resolveLiveSurfaceLayouts(flowLayout, { layoutMode: "inherit" });
  assert("inherit-flow layout uses joinScreen presenter align", inherited.presenter.alignX === "left" && inherited.presenter.paddingPx === 40);
  const custom = resolveLiveSurfaceLayouts(flowLayout, {
    layoutMode: "custom",
    layout: {
      presenter: { alignX: "right", alignY: "middle", paddingPx: 8, contentMaxWidthPx: 700, gapPx: 20, headingSizePx: 32, bodySizePx: 16 },
      phone: { alignX: "left", alignY: "bottom", paddingPx: 24, contentMaxWidthPx: 360, gapPx: 8, headingSizePx: 0, bodySizePx: 0 },
    },
  });
  assert(
    "custom component layout overrides flow presenter",
    custom.presenter.alignX === "right" && custom.presenter.headingSizePx === 32 && custom.phone.alignX === "left",
  );
  const implied = resolveLiveSurfaceLayouts(flowLayout, {
    layout: { presenter: { alignX: "center" }, phone: {} },
  });
  assert("saved layout without mode still overrides flow (custom implied)", implied.presenter.alignX === "center");

  const customPoll = normalizeMiniPollRecord({
    id: "layout-poll",
    slug: "layout-poll",
    branding: {
      layoutMode: "custom",
      layout: {
        presenter: { alignX: "right", paddingPx: 48, contentMaxWidthPx: 800, gapPx: 18, alignY: "middle", headingSizePx: 0, bodySizePx: 0 },
        phone: { alignX: "center", alignY: "top", paddingPx: 12, contentMaxWidthPx: 380, gapPx: 8, headingSizePx: 0, bodySizePx: 0 },
      },
    },
  });
  assert(
    "poll branding round-trips custom layoutMode",
    customPoll.branding.layoutMode === "custom" && customPoll.branding.layout?.presenter.alignX === "right",
  );

  const wheelBrand = liveSurfaceBrandingFromComponent({
    gameType: "spinning-wheel",
    assets: { logo: "https://example.test/logo.png", background: "https://example.test/bg.png" },
  });
  assert(
    "wheel mapping is partial (no default headingFont override)",
    wheelBrand.logoUrl?.endsWith("logo.png") &&
      wheelBrand.presenterBackgroundImageUrl?.endsWith("bg.png") &&
      wheelBrand.headingFont == null &&
      wheelBrand.bodyFont == null &&
      wheelBrand.backgroundHex == null,
  );
  const scratchBrand = liveSurfaceBrandingFromComponent({
    gameType: "scratcher",
    backgroundColor: "#112233",
    assets: { backgroundImage: "https://example.test/scratch-bg.png", top: "https://example.test/cover.png" },
  });
  assert(
    "scratcher maps page background only, not default fonts",
    scratchBrand.backgroundHex === "#112233" &&
      scratchBrand.backgroundImageUrl?.endsWith("scratch-bg.png") &&
      scratchBrand.headingFont == null,
  );
  const pinBrand = liveSurfaceBrandingFromComponent({
    gameType: "pinboard",
    board: {
      header: "Wall",
      brandLogoUrl: "https://example.test/pin-logo.png",
      useBackgroundImage: true,
      backgroundImage: "https://example.test/pin-bg.png",
      headerHex: "#abcdef",
      fontUploads: {
        heading: { url: "https://example.test/pin-head.woff2", family: "PinHeading" },
        subheading: { url: "https://example.test/pin-sub.woff2", family: "PinSubhead" },
      },
    },
    mobile: { buttonHex: "#d93ddb", buttonTextHex: "#ffffff" },
  });
  assert(
    "pinboard maps subheading upload to live body font",
    pinBrand.headingFont?.includes("PinHeading") &&
      pinBrand.bodyFont?.includes("PinSubhead") &&
      pinBrand.fontUploads?.body?.family === "PinSubhead" &&
      pinBrand.fontUploads?.heading?.family === "PinHeading" &&
      pinBrand.logoUrl?.endsWith("pin-logo.png"),
  );

  const quizCustom = liveSurfaceBrandingFromComponent({
    gameType: "mini-quiz",
    layoutMode: "custom",
    layout: {
      presenter: { alignX: "right", paddingPx: 48, contentMaxWidthPx: 720, gapPx: 16, alignY: "middle", headingSizePx: 40, bodySizePx: 18 },
      phone: { alignX: "left", alignY: "top", paddingPx: 12, contentMaxWidthPx: 360, gapPx: 8, headingSizePx: 0, bodySizePx: 0 },
    },
    typography: { fonts: { heading: "QuizHead" } },
  });
  const quizResolved = resolveLiveSurfaceLayouts(flowLayout, quizCustom);
  assert(
    "mini-quiz custom layout overrides flow and keeps native fonts",
    quizCustom.layoutMode === "custom" &&
      quizCustom.headingFont === "QuizHead" &&
      quizResolved.presenter.alignX === "right" &&
      quizResolved.presenter.headingSizePx === 40,
  );
  const quizInherit = liveSurfaceBrandingFromComponent({
    gameType: "mini-quiz",
    layoutMode: "inherit",
    typography: { fonts: { heading: "QuizHead" } },
  });
  const quizInherited = resolveLiveSurfaceLayouts(flowLayout, quizInherit);
  assert(
    "mini-quiz inherit-flow uses joinScreen layout",
    quizInherit.layoutMode === "inherit" &&
      quizInherited.presenter.alignX === "left" &&
      quizInherited.presenter.paddingPx === 40,
  );
  const scratchCustom = liveSurfaceBrandingFromComponent({
    gameType: "scratcher",
    backgroundColor: "#112233",
    layoutMode: "custom",
    layout: {
      presenter: { alignX: "center", paddingPx: 24, contentMaxWidthPx: 640, gapPx: 12, alignY: "top", headingSizePx: 0, bodySizePx: 0 },
      phone: { alignX: "center", alignY: "top", paddingPx: 16, contentMaxWidthPx: 400, gapPx: 10, headingSizePx: 0, bodySizePx: 0 },
    },
  });
  assert(
    "scratcher custom layout is mapped without default fonts",
    scratchCustom.layoutMode === "custom" &&
      scratchCustom.layout?.presenter.contentMaxWidthPx === 640 &&
      scratchCustom.headingFont == null,
  );
  const pollPartial = liveSurfaceBrandingFromComponent({
    gameType: "mini-poll",
    branding: { layoutMode: "inherit", headlineHex: "#ff00aa" },
  });
  assert(
    "poll inherit stays partial (flow fonts not replaced by Barlow defaults)",
    pollPartial.layoutMode === "inherit" &&
      pollPartial.headlineHex === "#ff00aa" &&
      pollPartial.headingFont == null,
  );

  const expSrc = readFileSync(new URL("../packages/player/src/experience/main.ts", import.meta.url), "utf8");
  assert(
    "interactive /x shell redirects to shared Presenter",
    /foundation\?\.interactive/.test(expSrc) && /\/present/.test(expSrc) && /stepFooter\.hidden = true/.test(expSrc),
  );
  const editorSrc = readFileSync(new URL("../packages/admin/src/pages/ExperienceEditor.tsx", import.meta.url), "utf8");
  assert(
    "interactive preview uses Presenter URL and opens Flow Master synchronously",
    /experiencePresenterUrl/.test(editorSrc) &&
      /openBlankWindow\(/.test(editorSrc) &&
      /assignWindowLocation\(/.test(editorSrc) &&
      !/window\.open\(`\$\{origin\}\/x\/\$\{game\.slug\}\/master/.test(editorSrc),
  );
  const scratchSrc = readFileSync(new URL("../packages/player/src/live/scratch.ts", import.meta.url), "utf8");
  assert(
    "scratch cover assigns img.src and paints an opaque placeholder before load",
    /img\.src = src/.test(scratchSrc) &&
      /paintOpaquePlaceholder/.test(scratchSrc) &&
      /coverSrc/.test(scratchSrc) &&
      /coverReady/.test(scratchSrc),
  );
  assert(
    "live scratcher wipes with round-cap strokes, pointer capture lifecycle, and throttled sampling",
    /lineCap = "round"/.test(scratchSrc) &&
      /lineJoin = "round"/.test(scratchSrc) &&
      /lastPoint/.test(scratchSrc) &&
      /pointerup/.test(scratchSrc) &&
      /pointercancel/.test(scratchSrc) &&
      /requestAnimationFrame/.test(scratchSrc) &&
      !/e\.buttons/.test(scratchSrc.replace(/pointerleave[\s\S]*e\.buttons === 0/, "")),
  );
  const joinSrc = readFileSync(new URL("../packages/player/src/live/join.ts", import.meta.url), "utf8");
  assert(
    "fill phone renders configured teamName/colour and keeps scratch canvas across polls",
    /teamNameHtml/.test(joinSrc) &&
      /teamColorHex/.test(joinSrc) &&
      /lastTicketKey === key && scratchHandle && root\.querySelector\("#scratch-host"\)/.test(joinSrc) &&
      !/replaceChildren\(shell\);\s*\n\s*const key =/.test(joinSrc),
  );
  const wheelSrc = readFileSync(new URL("../packages/player/src/live/wheel-draw.ts", import.meta.url), "utf8");
  const n1 = wheelSrc.indexOf("if (n === 1)");
  const n1Return = wheelSrc.indexOf("return { angle, number: pool[0]", n1);
  const hub = wheelSrc.indexOf("r * 0.16");
  assert(
    "single-player wheel paints the number and skips the hub drawn afterwards",
    n1 >= 0 && n1Return > n1 && hub > n1Return && /fillText\(labelFor/.test(wheelSrc),
  );
  const themeSrc = readFileSync(new URL("../packages/player/src/live/theme.ts", import.meta.url), "utf8");
  assert(
    "Presenter live-logo box is 160–200px and layout vars include logo sizing",
    /"--live-logo-width"/.test(themeSrc) &&
      /"--live-logo-max-height"/.test(themeSrc) &&
      /setProperty\("--live-logo-width", "184px"\)/.test(themeSrc) &&
      /setProperty\("--live-logo-max-height", "168px"\)/.test(themeSrc),
  );
  const runtimeSrc = readFileSync(new URL("../netlify/functions/lib/blob-runtime.mjs", import.meta.url), "utf8");
  assert(
    "Blobs context matches SDK precedence: globalThis.netlifyBlobsContext before env",
    /globalThis\.netlifyBlobsContext \|\| process\.env\.NETLIFY_BLOBS_CONTEXT/.test(runtimeSrc) &&
      /blobsStoresByScope/.test(runtimeSrc),
  );
  const liveCss = readFileSync(new URL("../packages/player/src/css/live.css", import.meta.url), "utf8");
  assert(
    "presenter option labels use a room-scale clamp above 1.35rem",
    /3\.5rem/.test(liveCss) && /data-live-surface="presenter"/.test(liveCss) && /position:\s*fixed/.test(liveCss),
  );
  assert(
    "#live-main is a flex child so Presenter alignY can center",
    /#live-main\s*\{[^}]*display:\s*flex/s.test(liveCss) && /#live-main\s*\{[^}]*flex:\s*1/s.test(liveCss),
  );
  assert("live option cards use border-box so DIV padding stays in-track", /html \*,[\s\S]*box-sizing:\s*border-box/.test(liveCss) && /min-width:\s*0/.test(liveCss));
  assert(
    "live-logo width is a CSS variable with object-fit contain so enlarging the box enlarges the mark",
    /width:\s*var\(--live-logo-width/.test(liveCss) && /object-fit:\s*contain/.test(liveCss),
  );
  assert(
    "live scratch canvas CSS is transparent so destination-out shows the under-image",
    /live-scratch-stage canvas[\s\S]*background:\s*transparent/.test(liveCss),
  );
  const renderSrc = readFileSync(new URL("../packages/player/src/live/render.ts", import.meta.url), "utf8");
  assert(
    "Presenter poll cards are DIV .live-option, not buttons",
    /<div class="live-option/.test(renderSrc) && !/<button class="live-option/.test(renderSrc),
  );
  const wheelsSrc = readFileSync(new URL("../netlify/functions/wheels.mjs", import.meta.url), "utf8");
  assert(
    "adapted editor layout fields persist on pinboard/wheel/scratcher PUT",
    wheelsSrc.includes('"layoutMode"') && /isPinboard[\s\S]*layoutMode[\s\S]*isLeaderboard/.test(wheelsSrc),
  );
  const pageModSrc = readFileSync(new URL("../netlify/functions/lib/page-modules.mjs", import.meta.url), "utf8");
  assert("mini-quiz normalize persists live layout", /gameType: "mini-quiz"[\s\S]*layoutMode[\s\S]*layout:/.test(pageModSrc));
  for (const name of ["live-run", "live-join", "live-control", "live-action", "live-media"]) {
    const src = readFileSync(new URL(`../netlify/functions/${name}.mjs`, import.meta.url), "utf8");
    assert(
      `${name} is a Functions v2 default export (not Lambda handler)`,
      /asNetlifyFunction\(lambdaHandler\)/.test(src) &&
        /export default asNetlifyFunction/.test(src) &&
        !/export const handler/.test(src),
    );
  }
  const v2Src = readFileSync(new URL("../netlify/functions/lib/netlify-v2.mjs", import.meta.url), "utf8");
  assert(
    "v2 wrapper uses withLambda + getUser and verifies widget Bearer without decoding JWTs",
    /withLambda/.test(v2Src) && /getUser/.test(v2Src) && /verifyIdentityBearer/.test(v2Src) && !/decodeBearer|base64url/.test(v2Src),
  );
  const authSrc = readFileSync(new URL("../netlify/functions/lib/auth.mjs", import.meta.url), "utf8");
  assert(
    "operator Bearer is verified at Identity /user using trusted site URL",
    /\/user/.test(authSrc) && /getIdentityConfig/.test(authSrc) && /process\.env\.URL/.test(authSrc) && !/\.iss\b/.test(authSrc),
  );
  const apiSrc = readFileSync(new URL("../packages/admin/src/api.ts", import.meta.url), "utf8");
  assert(
    "Studio API headers refresh with user.jwt() and show session-expired when refresh rejects",
    /identityAuthHeaders/.test(apiSrc) &&
      /identityForceRefresh/.test(apiSrc) &&
      /SESSION_EXPIRED_MESSAGE/.test(apiSrc) &&
      /studioAuth/.test(apiSrc) &&
      !/access_token/.test(apiSrc),
  );
  const identityAuthSrc = readFileSync(new URL("../packages/admin/src/identity-auth.mjs", import.meta.url), "utf8");
  assert("identity-auth calls user.jwt() and never reads access_token", /user\.jwt\(/.test(identityAuthSrc) && !/access_token/.test(identityAuthSrc));
  const toml = readFileSync(new URL("../netlify.toml", import.meta.url), "utf8");
  assert(
    "Identity stays an external Functions module so v2 runtime context is not bundled away",
    /external_node_modules[\s\S]*@netlify\/identity/.test(toml),
  );
}

async function main() {
  process.env.LIVE_STORE_DRIVER = process.env.LIVE_STORE_DRIVER || "memory";
  process.env.LIVE_BLOB_STORE = process.env.LIVE_BLOB_STORE || "rngames-live-local";
  process.env.LIVE_DEV_AUTH = process.env.LIVE_DEV_AUTH || "1";
  const cfg = inspectLiveStoreConfig();
  console.log("live store inspect", cfg);
  if (cfg.blocked) {
    fail("storage inspect blocked production/platform namespace", cfg.blockReason);
    process.exit(1);
  }
  if (cfg.storeName === "rngames-platform") {
    fail("refusing to run against rngames-platform");
    process.exit(1);
  }

  await blobsAdapterBoundaryTests();
  await sdkInjectedFetchCasTests();
  await joinIdentityRetryTest();
  await hostedRuntimeTests();
  await hostedBundleTests();
  await isolatedCasJoin();
  await pinboardDomRegression();
  await fullFlow();
  await guardAndSeedTests();

  if (failures) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log("\nok  isolated CAS + simulated-15 full flow");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
