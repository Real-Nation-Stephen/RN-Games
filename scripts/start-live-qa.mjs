#!/usr/bin/env node
/**
 * Long-lived isolated QA server with a unique storage directory.
 * Does not wipe other QA sessions. Prints Studio and live review URLs.
 *
 *   npm run build:preview
 *   npm run qa:live
 */
import { startIsolatedQaServer } from "./lib/isolated-qa-server.mjs";

const DEV_BEARER =
  "eyJhbGciOiJub25lIn0.eyJzdWIiOiJkZXYtbG9jYWwiLCJlbWFpbCI6ImRldkBsb2NhbC5wcmV2aWV3In0.dev";

async function json(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  if (res.status >= 400) throw new Error(`${url} ${res.status} ${data.error || text}`);
  return data;
}

async function main() {
  const { server, base, dir, config } = await startIsolatedQaServer({ port: 0 });
  const auth = { "Content-Type": "application/json", Authorization: `Bearer ${DEV_BEARER}` };
  const seeded = await json(`${base}/api/live-demo-seed`, { method: "POST", headers: auth, body: "{}" });
  const created = await json(`${base}/api/live-run`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ slug: "live-demo" }),
  });
  const hk = encodeURIComponent(created.hostKey);
  const code = created.code;
  const localhost = base.replace("127.0.0.1", "localhost");
  console.log(
    JSON.stringify(
      {
        base,
        dir,
        config: { driver: config.driver, live: config.liveStoreName, platform: config.platformStoreName },
        studio: `${base}/admin/`,
        experience: `${base}/admin/experiences`,
        master: `${base}/x/live-demo/master#hk=${hk}`,
        present: `${base}/x/live-demo/present/${code}`,
        joinA: `${base}/j/${code}`,
        joinB: `${localhost}/j/${code}`,
        standaloneWheel: `${base}/live-demo-wheel`,
        standaloneScratcher: `${base}/scratcher/live-demo-scratcher`,
        standaloneQuiz: `${base}/mini-quiz/live-demo-quiz`,
        selfDirectedFlow: `${base}/x/live-demo`,
        seeded: seeded.modules?.map((m) => m.slug) || seeded,
        code,
      },
      null,
      2,
    ),
  );
  console.log("isolated QA kept; Ctrl+C to stop. Unique dir will not be deleted automatically.");
  await new Promise(() => undefined);
  server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
