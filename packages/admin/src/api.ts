import netlifyIdentity from "netlify-identity-widget";
import { compressImageForUpload } from "./compressImage";
import { identityAuthHeaders, identityForceRefresh, identitySessionExpired, SESSION_EXPIRED_MESSAGE } from "./identity-auth.mjs";

/** Unverified JWT shape accepted by `netlify/functions/lib/auth.mjs` when `VITE_DEV_AUTH=1`. */
const DEV_BEARER =
  "eyJhbGciOiJub25lIn0.eyJzdWIiOiJkZXYtbG9jYWwiLCJlbWFpbCI6ImRldkBsb2NhbC5wcmV2aWV3In0.dev";

/** Avoid dumping full Netlify/HTML 404 pages into UI `Error.message`. */
function formatApiErrorBody(text: string): string {
  const t = text.trim();
  if (
    t.startsWith("<!DOCTYPE") ||
    t.startsWith("<html") ||
    (t.includes("<head>") && t.includes("</body>"))
  ) {
    return "API error: got an HTML page instead of JSON (usually 404). Start Netlify dev on port 8888 so /api proxies correctly (npx netlify-cli dev).";
  }
  if (t.startsWith("{")) {
    try {
      const j = JSON.parse(t) as { error?: string };
      if (j.error) return j.error;
    } catch {
      /* fall through */
    }
  }
  if (t.length > 400) return `${t.slice(0, 400)}…`;
  return t;
}

function widgetRefresh(forceRefresh?: boolean): Promise<string> {
  if (typeof (netlifyIdentity as { refresh?: (force?: boolean) => Promise<string> }).refresh !== "function") {
    return Promise.resolve("");
  }
  if (!netlifyIdentity.currentUser()) return Promise.resolve("");
  return (netlifyIdentity as { refresh: (force?: boolean) => Promise<string> }).refresh(forceRefresh);
}

async function studioAuth(): Promise<{ headers: Record<string, string>; source: string }> {
  return identityAuthHeaders({
    devAuth: import.meta.env.VITE_DEV_AUTH === "1",
    devBearer: DEV_BEARER,
    currentUser: () => netlifyIdentity.currentUser(),
    widgetRefresh,
  });
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = r.result as string;
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function apiErrorMessage(status: number, body: string): string {
  if (status === 429) {
    return "Too many requests — please wait a moment and try again.";
  }
  const formatted = formatApiErrorBody(body);
  if (formatted) return formatted;
  return `Request failed (${status})`;
}

async function fetchWithRetry(path: string, init: RequestInit, retries = 3): Promise<Response> {
  let res = await fetch(path, init);
  for (let attempt = 0; attempt < retries && res.status === 429; attempt++) {
    const delay = Math.min(8000, 400 * 2 ** attempt + Math.random() * 200);
    await new Promise((r) => setTimeout(r, delay));
    res = await fetch(path, init);
  }
  return res;
}

async function fetchAuthed(path: string, init: RequestInit = {}, retries = 3): Promise<Response> {
  const { headers, source } = await studioAuth();
  if (identitySessionExpired(source)) {
    netlifyIdentity.open();
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }
  const merged = { ...headers, ...(init.headers || {}) };
  let res = await fetchWithRetry(path, { ...init, headers: merged }, retries);
  if (res.status === 401 && import.meta.env.VITE_DEV_AUTH !== "1") {
    try {
      const token = await identityForceRefresh({
        currentUser: () => netlifyIdentity.currentUser(),
        widgetRefresh,
      });
      if (token) {
        res = await fetchWithRetry(
          path,
          { ...init, headers: { ...merged, Authorization: `Bearer ${token}` } },
          retries,
        );
      }
    } catch {
      netlifyIdentity.open();
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
  }
  return res;
}

function denySession() {
  netlifyIdentity.open();
  throw new Error(SESSION_EXPIRED_MESSAGE);
}

const inflightGet = new Map<string, Promise<unknown>>();

export async function apiGet(path: string) {
  const existing = inflightGet.get(path);
  if (existing) return existing;

  const promise = (async () => {
    const res = await fetchAuthed(path);
    if (res.status === 401) denySession();
    if (!res.ok) throw new Error(apiErrorMessage(res.status, await res.text()));
    return res.json();
  })();

  inflightGet.set(path, promise);
  try {
    return await promise;
  } finally {
    inflightGet.delete(path);
  }
}

export async function apiDelete(path: string) {
  const res = await fetchAuthed(path, { method: "DELETE" });
  if (res.status === 401) denySession();
  if (res.status === 204) return;
  if (!res.ok) throw new Error(apiErrorMessage(res.status, await res.text()));
}

export async function apiSend(path: string, method: string, body?: unknown) {
  const res = await fetchAuthed(path, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) denySession();
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(apiErrorMessage(res.status, await res.text()));
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

/** Max JSON body size for Netlify Functions (~6MB); base64 adds ~33% overhead. */
const MAX_UPLOAD_BASE64_CHARS = 5_200_000;

export async function uploadFile(file: File): Promise<{ id: string; url: string }> {
  const prepared = file.type.startsWith("image/") ? await compressImageForUpload(file) : file;
  const base64 = await fileToBase64(prepared);
  if (base64.length > MAX_UPLOAD_BASE64_CHARS) {
    throw new Error(
      `File is too large to upload (${Math.round(prepared.size / 1024 / 1024)}MB). Use an image under ~3MB.`,
    );
  }
  const res = await fetchAuthed("/api/upload", {
    method: "POST",
    body: JSON.stringify({
      base64,
      contentType: prepared.type || file.type || "application/octet-stream",
      filename: prepared.name,
    }),
  });
  if (res.status === 401) denySession();
  if (!res.ok) throw new Error(formatApiErrorBody(await res.text()));
  return res.json();
}
