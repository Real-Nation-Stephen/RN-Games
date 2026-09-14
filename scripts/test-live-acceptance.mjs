#!/usr/bin/env node
/**
 * Isolated live-run CAS regressions + simulated-15 full-flow checks.
 * Uses an in-memory compare-and-set store so it cannot touch production Blobs.
 *
 *   LIVE_STORE_DRIVER=memory LIVE_DEV_AUTH=1 node scripts/test-live-acceptance.mjs
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createMemoryCasStore, wrapBlobsCasStore } from "../netlify/functions/lib/cas-store.mjs";
import {
  blobsStoreOptions,
  blobsWrapOptions,
  getRuntimeStore,
  LIVE_BLOBS_CONSISTENCY,
  liveStoreName,
} from "../netlify/functions/lib/blob-runtime.mjs";
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
import { handler as liveRun } from "../netlify/functions/live-run.mjs";
import { handler as liveJoin } from "../netlify/functions/live-join.mjs";
import { handler as liveControl } from "../netlify/functions/live-control.mjs";
import { handler as liveAction } from "../netlify/functions/live-action.mjs";
import { handler as liveSeed } from "../netlify/functions/live-demo-seed.mjs";
import { normalizeMiniPollRecord, normalizeFillGameRecord } from "../netlify/functions/lib/live-modules.mjs";
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
    "live CAS reads request strong consistency",
    liveFake.calls.getWithMetadata[0]?.opts?.consistency === "strong" &&
      liveFake.calls.get[0]?.opts?.consistency === "strong",
    JSON.stringify({ get: liveFake.calls.get[0]?.opts, meta: liveFake.calls.getWithMetadata[0]?.opts }),
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
          { id: "team-a", name: "A", target: 20 },
          { id: "team-b", name: "B", target: 20 },
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
  const spin = await control("spin");
  assert("wheel spin reserves a prize", spin.result?.winnerNumber != null || spin.state?.activity?.winnerNumber != null);
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
