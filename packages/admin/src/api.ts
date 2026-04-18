import netlifyIdentity from "netlify-identity-widget";

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
  if (t.length > 400) return `${t.slice(0, 400)}…`;
  return t;
}

function authHeaders(): HeadersInit {
  if (import.meta.env.VITE_DEV_AUTH === "1") {
    return { "Content-Type": "application/json", Authorization: `Bearer ${DEV_BEARER}` };
  }
  const user = netlifyIdentity.currentUser();
  const token = (user as { token?: { access_token?: string } })?.token?.access_token;
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
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

export async function apiGet(path: string) {
  const res = await fetch(path, { headers: authHeaders() });
  if (res.status === 401) {
    netlifyIdentity.open();
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(formatApiErrorBody(await res.text()));
  return res.json();
}

export async function apiDelete(path: string) {
  const res = await fetch(path, { method: "DELETE", headers: authHeaders() });
  if (res.status === 401) {
    netlifyIdentity.open();
    throw new Error("Unauthorized");
  }
  if (res.status === 204) return;
  if (!res.ok) throw new Error(formatApiErrorBody(await res.text()));
}

export async function apiSend(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    netlifyIdentity.open();
    throw new Error("Unauthorized");
  }
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(formatApiErrorBody(await res.text()));
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

export async function uploadFile(file: File): Promise<{ id: string; url: string }> {
  const base64 = await fileToBase64(file);
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      base64,
      contentType: file.type || "application/octet-stream",
      filename: file.name,
    }),
  });
  if (!res.ok) throw new Error(formatApiErrorBody(await res.text()));
  return res.json();
}
