/**
 * Isolated local QA HTTP server.
 * Serves the assembled dist plus the real Netlify function handlers.
 * Platform config/seed and live run state both use the local file CAS adapter.
 */
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { inspectStorageConfig, resetRuntimeStores } from "../../netlify/functions/lib/blob-runtime.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const QA_ROOT = path.join(ROOT, ".netlify/isolated-qa");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".ico": "image/x-icon",
};

const PAGE_MODULE_ROUTES = [
  ["landing", "landing.html"],
  ["form", "form.html"],
  ["certificate", "certificate.html"],
  ["badge", "badge.html"],
  ["consent", "consent.html"],
  ["email-signup", "email-signup.html"],
  ["redemption", "redemption.html"],
  ["mini-quiz", "mini-quiz.html"],
  ["mini-poll", "live-preview.html"],
  ["fill-game", "live-preview.html"],
];

const RESERVED = new Set([
  "admin",
  "api",
  "assets",
  "play",
  "report",
  "static",
  "quiz",
  "scratcher",
  "flip-cards",
  "pinboard",
  "leaderboard",
  "catch",
  "runner",
  "matching",
  "landing",
  "form",
  "certificate",
  "badge",
  "consent",
  "email-signup",
  "redemption",
  "mini-quiz",
  "mini-poll",
  "fill-game",
  "j",
  "x",
  "course",
]);

export function applyIsolatedQaEnv(dir) {
  process.env.RN_ISOLATED_QA = "1";
  process.env.LIVE_STORE_DRIVER = "file";
  process.env.LIVE_CAS_DIR = dir;
  process.env.LIVE_BLOB_STORE = "rngames-live-local";
  process.env.PLATFORM_BLOB_STORE = "rngames-platform-local";
  process.env.LIVE_DEV_AUTH = "1";
  delete process.env.CONTEXT;
  delete process.env.NETLIFY_BLOBS_CONTEXT;
  delete process.env.NETLIFY_BLOBS_URL;
}

export function resolveIsolatedQaDir({ dir, reset = false } = {}) {
  if (dir) {
    const qaDir = path.resolve(dir);
    return { qaDir, reset: !!reset, supplied: true };
  }
  const unique = `run-${process.pid}-${Date.now()}-${randomBytes(3).toString("hex")}`;
  return { qaDir: path.join(QA_ROOT, unique), reset: false, supplied: false };
}

function operatorContext(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization || "";
  if (auth.startsWith("Bearer ")) {
    return { clientContext: { user: { sub: "dev-local", email: "dev@local.preview" } } };
  }
  return {};
}

async function invoke(name, req, url, bodyBuf) {
  const mod = await import(`../../netlify/functions/${name}.mjs`);
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = v;
  if (typeof mod.default === "function") {
    const init = { method: req.method, headers };
    if (bodyBuf && bodyBuf.length && req.method !== "GET" && req.method !== "HEAD") init.body = bodyBuf;
    const request = new Request(url.href, init);
    const response = await mod.default(request, { requestId: "isolated-qa" });
    const buf = Buffer.from(await response.arrayBuffer());
    const outHeaders = {};
    response.headers.forEach((value, key) => {
      outHeaders[key] = value;
    });
    const binary = /^\s*(image|audio|video|application\/octet-stream)/i.test(String(outHeaders["content-type"] || ""));
    return {
      statusCode: response.status,
      headers: outHeaders,
      body: binary ? buf.toString("base64") : buf.toString("utf8"),
      isBase64Encoded: binary,
    };
  }
  const event = {
    httpMethod: req.method,
    path: url.pathname,
    rawUrl: url.href,
    headers,
    queryStringParameters: Object.fromEntries(url.searchParams),
    body: bodyBuf && bodyBuf.length ? bodyBuf.toString("utf8") : undefined,
    isBase64Encoded: false,
    blobs: { isolated: true },
  };
  return mod.handler(event, operatorContext(event));
}

function apiName(pathname) {
  const m = pathname.match(/^\/(?:api|\.netlify\/functions)\/([a-z0-9-]+)/i);
  return m ? m[1] : null;
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

async function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const body = await fs.readFile(filePath);
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

export function rewriteLivePath(pathname) {
  const seg = pathname.split("/").filter(Boolean);
  if (seg[0] === "admin") {
    if (/\.[a-zA-Z0-9]+$/.test(pathname)) return null;
    return "/admin/index.html";
  }
  if (seg[0] === "x" && seg[1]) {
    const surface = seg[2] || "";
    if (surface === "present") return "/play/live-present.html";
    if (surface === "master") return "/play/live-master.html";
    if (surface === "join") return "/play/live-join.html";
    return "/play/experience.html";
  }
  if (seg[0] === "j") return "/play/live-join.html";
  for (const [segment, html] of PAGE_MODULE_ROUTES) {
    if (seg[0] === segment && seg[1]) return `/play/${html}`;
  }
  if (seg[0] === "scratcher" && seg[1]) return "/play/scratcher.html";
  if (seg[0] === "pinboard" && seg[1]) {
    if (seg[2] === "submit") return "/play/pinboard-submit.html";
    if (seg[2] === "moderate") return "/play/pinboard-moderate.html";
    return "/play/pinboard-board.html";
  }
  if (seg.length === 1 && !RESERVED.has(seg[0]) && !/\.[a-zA-Z0-9]+$/.test(seg[0])) {
    return "/play/index.html";
  }
  return null;
}

export async function startIsolatedQaServer({ port = 0, dir, reset = false } = {}) {
  const resolved = resolveIsolatedQaDir({ dir, reset });
  const qaDir = resolved.qaDir;
  if (resolved.reset) {
    const allowed = qaDir.startsWith(QA_ROOT + path.sep) || qaDir === QA_ROOT;
    if (!allowed) {
      throw new Error("Refusing to reset a directory outside .netlify/isolated-qa");
    }
    await fs.rm(qaDir, { recursive: true, force: true });
  }
  await fs.mkdir(qaDir, { recursive: true });
  applyIsolatedQaEnv(qaDir);
  resetRuntimeStores();
  const cfg = inspectStorageConfig();
  if (cfg.blocked) {
    throw new Error(`Isolated QA storage blocked: ${cfg.blockReason}`);
  }
  if (cfg.platformStoreName === "rngames-platform" || cfg.liveStoreName === "rngames-platform") {
    throw new Error("Isolated QA refused to use rngames-platform");
  }
  const dist = path.join(ROOT, "dist");
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Authorization, Content-Type, x-live-secret",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        });
        res.end();
        return;
      }
      const name = apiName(url.pathname);
      if (name) {
        try {
          const body = await readBody(req);
          const result = await invoke(name, req, url, body);
          const outHeaders = { "Cache-Control": "no-store", ...(result.headers || {}) };
          res.writeHead(result.statusCode || 500, outHeaders);
          if (result.isBase64Encoded) res.end(Buffer.from(result.body || "", "base64"));
          else res.end(result.body || "");
          return;
        } catch (e) {
          if (String(e.message || e).includes("Cannot find module")) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Not found" }));
            return;
          }
          throw e;
        }
      }
      let fileRel = rewriteLivePath(url.pathname) || url.pathname;
      if (fileRel === "/" || fileRel === "") fileRel = "/admin/index.html";
      const disk = path.join(dist, fileRel.replace(/^\/+/, ""));
      const resolvedDisk = path.resolve(disk);
      if (!resolvedDisk.startsWith(path.resolve(dist))) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      try {
        const st = await fs.stat(resolvedDisk);
        if (st.isDirectory()) {
          await sendFile(res, path.join(resolvedDisk, "index.html"));
          return;
        }
        await sendFile(res, resolvedDisk);
        return;
      } catch {
        if (fileRel.endsWith(".html")) throw Object.assign(new Error("Not found"), { statusCode: 404 });
        const slugHtml = path.join(dist, "play/index.html");
        await sendFile(res, slugHtml);
        return;
      }
    } catch (e) {
      const status = e.statusCode || 500;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : "Failed" }));
    }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const addr = server.address();
  const base = `http://127.0.0.1:${addr.port}`;
  return { server, base, dir: qaDir, config: cfg };
}
