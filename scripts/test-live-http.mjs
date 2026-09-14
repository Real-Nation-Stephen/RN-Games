#!/usr/bin/env node
/**
 * Isolated HTTP full-flow: file CAS for BOTH platform seed and live state,
 * real handlers, built static files. Does not use production Blobs.
 */
import { startIsolatedQaServer, resolveIsolatedQaDir } from "./lib/isolated-qa-server.mjs";
import fs from "node:fs/promises";

const N = Number(process.env.LIVE_N || 15);
const DEV_BEARER =
  "eyJhbGciOiJub25lIn0.eyJzdWIiOiJkZXYtbG9jYWwiLCJlbWFpbCI6ImRldkBsb2NhbC5wcmV2aWV3In0.dev";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function json(url, init = {}) {
  const headers = { ...(init.headers || {}) };
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { status: res.status, data, text };
}

function mustOk(res, label) {
  if (res.status >= 400) throw new Error(`${label}: ${res.status} ${res.data.error || res.text}`);
  return res.data;
}

async function main() {
  const a = resolveIsolatedQaDir();
  const b = resolveIsolatedQaDir();
  if (a.qaDir === b.qaDir) throw new Error("QA dirs must be unique per run");
  const { server, base, dir, config } = await startIsolatedQaServer({ port: 0 });
  console.log("isolated QA", { base, dir, config });
  try {
    const seeded = mustOk(
      await json(`${base}/api/live-demo-seed`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEV_BEARER}` },
        body: "{}",
      }),
      "seed",
    );
    console.log("seeded", seeded.modules?.map((m) => m.slug) || seeded);

    const unauth = await json(`${base}/api/live-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "live-demo" }),
    });
    if (unauth.status !== 401) throw new Error(`expected unauth create 401, got ${unauth.status} ${unauth.data.error || ""}`);

    const created = mustOk(
      await json(`${base}/api/live-run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEV_BEARER}` },
        body: JSON.stringify({ slug: "live-demo" }),
      }),
      "create run",
    );
    const code = created.code;
    const hostKey = created.hostKey;
    const auth = { "Content-Type": "application/json", Authorization: `Bearer ${DEV_BEARER}` };

    const reopen = mustOk(
      await json(`${base}/api/live-run`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ slug: "live-demo" }),
      }),
      "reopen",
    );
    if (reopen.code !== code || reopen.hostKey !== hostKey || !reopen.reused) {
      throw new Error(`operator reopen should reuse ${code}, got ${reopen.code} reused=${reopen.reused}`);
    }
    console.log("ok  HTTP operator reopen existing run");

    const pollId = seeded.modules?.find((m) => m.slug === "live-demo-poll")?.id;
    const pollDoc = mustOk(await json(`${base}/api/wheels?id=${encodeURIComponent(pollId)}`, { headers: auth }), "load poll");
    const savedPoll = mustOk(
      await json(`${base}/api/wheels`, {
        method: "PUT",
        headers: auth,
        body: JSON.stringify({
          ...pollDoc,
          options: [
            { ...pollDoc.options[0], label: "", imageUrl: pollDoc.options[0].imageUrl || "https://example.test/a.png", accessibleLabel: "Left art" },
            { ...pollDoc.options[1], label: "Right", imageUrl: "", accessibleLabel: "Right" },
          ],
        }),
      }),
      "save image-only option",
    );
    const savedOpts = savedPoll.wheel?.options || [];
    if (savedOpts[0]?.label !== "") throw new Error(`image-only label overwritten: "${savedOpts[0]?.label}"`);
    const reopenedPoll = mustOk(await json(`${base}/api/wheels?id=${encodeURIComponent(pollDoc.id)}`, { headers: auth }), "reopen poll");
    if (reopenedPoll.options?.[0]?.label !== "") throw new Error(`reopened poll label became "${reopenedPoll.options?.[0]?.label}"`);
    console.log("ok  HTTP image-only poll save/reopen");

    const branded = mustOk(
      await json(`${base}/api/wheels`, {
        method: "PUT",
        headers: auth,
        body: JSON.stringify({
          ...reopenedPoll,
          clientName: "Any client",
          branding: {
            ...(reopenedPoll.branding || {}),
            headlineHex: "#ff00aa",
            presenterBackgroundImageUrl: "https://example.test/presenter.png",
            fontUploads: { heading: { url: "https://example.test/qa.woff2", family: "QAFont" } },
            headingFont: "'QAFont', system-ui, sans-serif",
          },
        }),
      }),
      "save poll branding",
    );
    const brand = branded.wheel?.branding || {};
    if (branded.wheel?.clientName !== "Any client" || brand.headlineHex !== "#ff00aa" || brand.fontUploads?.heading?.family !== "QAFont") {
      throw new Error(`poll branding round-trip failed ${JSON.stringify({ client: branded.wheel?.clientName, brand })}`);
    }
    const fillId = seeded.modules?.find((m) => m.slug === "live-demo-fill")?.id;
    const fillDoc = mustOk(await json(`${base}/api/wheels?id=${encodeURIComponent(fillId)}`, { headers: auth }), "load fill");
    const savedFill = mustOk(
      await json(`${base}/api/wheels`, {
        method: "PUT",
        headers: auth,
        body: JSON.stringify({
          ...fillDoc,
          clientName: "Bar ops",
          branding: { ...(fillDoc.branding || {}), accentHex: "#123456", buttonHex: "#abcdef", buttonTextHex: "#010101" },
        }),
      }),
      "save fill branding",
    );
    if (savedFill.wheel?.clientName !== "Bar ops" || savedFill.wheel?.branding?.accentHex !== "#123456") {
      throw new Error(`fill client/branding round-trip failed`);
    }
    console.log("ok  HTTP Mini Poll / Fill branding save/reopen");

    const pixelB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const uploaded = mustOk(
      await json(`${base}/api/upload`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ base64: pixelB64, contentType: "image/png", filename: "qa.png" }),
      }),
      "upload",
    );
    const fileRes = await fetch(`${base}${uploaded.url}`);
    if (fileRes.status !== 200) throw new Error(`file fetch ${fileRes.status}`);
    const fileBytes = Buffer.from(await fileRes.arrayBuffer());
    if (fileBytes[0] !== 0x89 || fileBytes[1] !== 0x50 || fileBytes.equals(Buffer.from("{}"))) {
      throw new Error(`uploaded file was not PNG bytes (hex=${fileBytes.slice(0, 8).toString("hex")})`);
    }
    console.log("ok  HTTP isolated binary upload");

    async function control(action, extra = {}) {
      return mustOk(
        await json(`${base}/api/live-control`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, hostKey, action, commandId: crypto.randomUUID(), ...extra }),
        }),
        `control ${action}`,
      );
    }
    async function getState(role, extra = {}) {
      const u = new URL(`${base}/api/live-run`);
      u.searchParams.set("code", code);
      u.searchParams.set("role", role);
      for (const [k, v] of Object.entries(extra.query || {})) if (v != null) u.searchParams.set(k, String(v));
      return mustOk(await json(u, { headers: extra.headers || {} }), `get ${role}`);
    }

    const joins = await Promise.all(
      Array.from({ length: N }, () =>
        json(`${base}/api/live-join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        }).then((r) => {
          if (r.status !== 200) throw new Error(`join ${r.status} ${r.data.error}`);
          return r.data;
        }),
      ),
    );
    if (new Set(joins.map((j) => j.participantId)).size !== N) throw new Error("HTTP join identities not unique");
    console.log(`ok  HTTP ${N} joins`);

    const reconnect = await json(`${base}/api/live-join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, participantId: joins[0].participantId, secret: joins[0].secret }),
    });
    if (reconnect.data.participantId !== joins[0].participantId) throw new Error("reconnect identity mismatch");

    const beforePreview = await getState("public");
    const previewPage = await fetch(`${base}/play/live-preview.html?preview=1`);
    if (previewPage.status !== 200) throw new Error(`live-preview.html ${previewPage.status}`);
    const previewHtml = await previewPage.text();
    const scriptMatch = previewHtml.match(/src="([^"]+\.js)"/);
    if (scriptMatch) {
      const jsUrl = scriptMatch[1].startsWith("http") ? scriptMatch[1] : `${base}${scriptMatch[1].startsWith("/") ? "" : "/"}${scriptMatch[1]}`;
      const js = await (await fetch(jsUrl)).text();
      if (/\/api\/live-(run|join|action|control)/.test(js)) {
        throw new Error("preview bundle references live run APIs");
      }
    }
    const afterPreview = await getState("public");
    if (JSON.stringify(afterPreview.state.activity) !== JSON.stringify(beforePreview.state.activity)) {
      throw new Error("fetching unsaved preview mutated live activity");
    }
    if (JSON.stringify(afterPreview.state.prizeLedger || {}) !== JSON.stringify(beforePreview.state.prizeLedger || {})) {
      throw new Error("fetching unsaved preview mutated prize ledger");
    }
    console.log("ok  HTTP unsaved preview does not touch live run");

    await control("next");
    await control("open");
    const open = await getState("public");
    const opt = open.state.component.options[0].id;
    const attempt = {
      runId: open.state.runId,
      nodeId: open.state.steps.find((s) => s.current)?.id,
      roundAttemptId: open.state.roundAttemptId,
    };
    const votes = await Promise.all(
      joins.map((j) =>
        json(`${base}/api/live-action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, action: "vote", optionId: opt, ...attempt, ...j }),
        }),
      ),
    );
    if (votes.filter((v) => v.status === 200).length !== N) throw new Error(`votes ${votes.filter((v) => v.status === 200).length}/${N}`);
    await control("tally");
    const tallying = await getState("public");
    if (tallying.state.activity.phase !== "tallying") throw new Error(`expected tallying, got ${tallying.state.activity.phase}`);
    const token = tallying.state.viewToken;
    const unchanged = await getState("public", { query: { rev: token } });
    if (unchanged.changed !== false) throw new Error("expected unchanged during tally cue");
    await sleep(1300);
    const revealed = await getState("public", { query: { rev: token } });
    if (!revealed.changed || revealed.state.activity.phase !== "revealed") {
      throw new Error(`HTTP poll reveal missed: changed=${revealed.changed} phase=${revealed.state?.activity?.phase}`);
    }
    console.log("ok  HTTP poll auto-reveal via viewToken");

    await control("next");
    await control("open");
    const fillGet = await getState("participant", {
      query: { participantId: joins[0].participantId },
      headers: { "x-live-secret": joins[0].secret },
    });
    const fq = fillGet.state.me.question;
    const fillAttempt = {
      runId: fillGet.state.runId,
      nodeId: fillGet.state.steps.find((s) => s.current)?.id,
      roundAttemptId: fillGet.state.roundAttemptId,
      questionId: fq.id,
      choiceId: fq.choices[0].id,
    };
    const fill = await json(`${base}/api/live-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, action: "answer", ...fillAttempt, ...joins[0] }),
    });
    if (fill.status !== 200) throw new Error(`fill ${fill.status} ${fill.data.error}`);
    console.log("ok  HTTP fill scoring");

    await control("next");
    await control("open");
    const quizGet = await getState("participant", {
      query: { participantId: joins[1].participantId },
      headers: { "x-live-secret": joins[1].secret },
    });
    const qq = quizGet.state.component.currentQuestion;
    const quiz = await json(`${base}/api/live-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        action: "answer",
        runId: quizGet.state.runId,
        nodeId: quizGet.state.steps.find((s) => s.current)?.id,
        roundAttemptId: quizGet.state.roundAttemptId,
        questionId: qq.id,
        choiceId: qq.choices[0].id,
        ...joins[1],
      }),
    });
    if (quiz.status !== 200) throw new Error(`quiz ${quiz.status} ${quiz.data.error}`);
    await control("reveal");
    console.log("ok  HTTP quiz reveal");

    await control("next");
    const pinGet = await getState("participant", {
      query: { participantId: joins[2].participantId },
      headers: { "x-live-secret": joins[2].secret },
    });
    const note = `<img src=x onerror="alert(1)">http-note`;
    const pin = await json(`${base}/api/live-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        action: "submit",
        kind: "note",
        text: note,
        runId: pinGet.state.runId,
        nodeId: pinGet.state.steps.find((s) => s.current)?.id,
        roundAttemptId: pinGet.state.roundAttemptId,
        ...joins[2],
      }),
    });
    if (pin.status !== 200) throw new Error(`pin ${pin.status} ${pin.data.error}`);
    const subId = pin.data.result.submissionId;
    await control("approve", { submissionId: subId });
    const pinPub = await getState("public");
    if (pinPub.state.activity.submissions?.[0]?.text !== note) throw new Error("pinboard text not literal after approve");
    console.log("ok  HTTP pinboard note/approve");

    await control("next");
    const spun = await control("spin");
    const spinState = await getState("public");
    const spinToken = spinState.state.viewToken;
    if (spinState.state.activity.phase === "spinning") {
      await sleep(Number(spinState.state.activity.durationMs || 2500) + 500);
      const done = await getState("public", { query: { rev: spinToken } });
      if (!done.changed || done.state.activity.phase !== "revealed") {
        throw new Error(`HTTP wheel reveal missed: ${done.state?.activity?.phase}`);
      }
    }
    console.log("ok  HTTP wheel winner", spun.result?.winnerNumber || spinState.state.activity.winnerNumber);

    await control("next");
    await control("release", { winnerCount: 1 });
    const scratch = await getState("moderator", { query: { hostKey } });
    const win = (scratch.state.activity.winners || []).find((w) => w.revealed === false) || scratch.state.activity.winners?.[0];
    const player = joins.find((j) => j.participantNumber === win?.participantNumber) || joins.find((j) => !scratch.state.awards?.some((a) => a.participantId === j.participantId && a.source === "wheel"));
    const me = await getState("participant", {
      query: { participantId: player.participantId },
      headers: { "x-live-secret": player.secret },
    });
    if (me.state.me.ticket) {
      const reveal = await json(`${base}/api/live-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          action: "reveal-ticket",
          ticketId: me.state.me.ticket.ticketId,
          runId: me.state.runId,
          nodeId: me.state.steps.find((s) => s.current)?.id,
          roundAttemptId: me.state.roundAttemptId,
          ...player,
        }),
      });
      if (reveal.status !== 200) throw new Error(`scratch reveal ${reveal.status} ${reveal.data.error}`);
    }
    console.log("ok  HTTP scratcher");

    const smokes = [
      "/play/mini-quiz.html",
      "/play/scratcher.html",
      "/play/index.html",
      "/play/experience.html",
      "/play/live-preview.html",
      "/play/live-present.html",
      "/play/live-master.html",
      "/play/live-join.html",
      "/admin/",
      "/mini-quiz/live-demo-quiz",
      "/scratcher/live-demo-scratcher",
      "/live-demo-wheel",
      "/x/live-demo",
    ];
    for (const p of smokes) {
      const res = await fetch(`${base}${p}`);
      if (res.status !== 200) throw new Error(`smoke ${p} -> ${res.status}`);
    }
    console.log("ok  standalone HTML smoke");

    console.log(
      JSON.stringify(
        {
          base,
          master: `${base}/x/live-demo/master#hk=${encodeURIComponent(hostKey)}`,
          present: `${base}/x/live-demo/present/${code}`,
          join: `${base}/x/live-demo/join`,
          shortJoin: `${base}/j/${code}`,
          code,
          httpClients: N,
        },
        null,
        2,
      ),
    );
    console.log("\nok  isolated HTTP full flow");
    return { base, code, hostKey, server, dir };
  } catch (e) {
    server.close();
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    throw e;
  }
}

const keep = process.argv.includes("--keep");
main()
  .then(async ({ server, dir }) => {
    if (!keep) {
      server.close();
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
      process.exit(0);
    }
    console.log("server kept (--keep); Ctrl+C to stop");
    console.log("qa dir", dir);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
