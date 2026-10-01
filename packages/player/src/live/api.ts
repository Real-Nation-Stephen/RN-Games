type LiveConnection = { mode: "standard" | "dedicated"; apiBase?: string; code?: string; runId?: string; socketPresence?: boolean };
let connection: LiveConnection = { mode: "standard" };
const sockets = new Set<string>();
export const setLiveSocketConnected = (code: string, connected: boolean) => connected ? sockets.add(code.toUpperCase()) : sockets.delete(code.toUpperCase());
export const hasLiveSocketPresence = (code: string) => !!getLiveConnection(code).socketPresence && sockets.has(code.toUpperCase());
const connections = new Map<string, LiveConnection>();
export const platformLiveEndpoint = (name: string) => import.meta.env.DEV ? `/api/${name}` : `/.netlify/functions/${name}`;
export function getLiveConnection(code: string): LiveConnection {
  return connections.get(code.toUpperCase()) || { mode: "standard" };
}
export function liveEndpoint(name: string): string {
  return connection.mode === "dedicated" ? `${connection.apiBase}/api/${name}` : platformLiveEndpoint(name);
}
export function liveGetUrl(name: string, params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") q.set(k, String(v));
  const route = getLiveConnection(String(params.code || ""));
  const base = route.mode === "dedicated" ? `${route.apiBase}/api/${name}` : platformLiveEndpoint(name);
  return `${base}?${q.toString()}`;
}
function adopt(data: Record<string, unknown>) {
  const route = data.connection as LiveConnection | undefined;
  if (!route) return;
  if (route.mode === "dedicated") {
    const url = new URL(String(route.apiBase));
    const local = ["localhost", "127.0.0.1"].includes(location.hostname) && ["localhost", "127.0.0.1"].includes(url.hostname);
    if ((!local && url.protocol !== "https:") || url.origin !== route.apiBase) throw new Error("Invalid live service connection");
  }
  connection = route;
  const code = String(route.code || data.code || "").toUpperCase();
  if (code) connections.set(code, route);
}
export async function liveJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, { ...init, signal: init?.signal || AbortSignal.timeout(15000) });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) : {}; }
  catch {
    throw Object.assign(new Error("The live service returned an unexpected response. Please reconnect."), {status: res.status >= 400 ? res.status : 502});
  }
  if (!res.ok) {
    const err = new Error(String(data.error || `HTTP ${res.status}`));
    Object.assign(err, { status: res.status, payload: data });
    throw err;
  }
  adopt(data);
  if (data.routeOnly && connection.mode === "dedicated") {
    const original = new URL(url, location.origin);
    const name = original.pathname.split("/").pop();
    const target = new URL(`${connection.apiBase}/api/${name}`);
    target.search = original.search;
    target.searchParams.delete("slug");
    if (original.search) target.searchParams.set("code", String(connection.code));
    const headers = new Headers(init?.headers);
    headers.delete("Authorization"); // Studio identity tokens stay on the Studio origin.
    let body = init?.body;
    if (typeof body === "string") body = JSON.stringify({ ...JSON.parse(body), code: connection.code });
    return liveJson(target.toString(), { ...init, headers, body, credentials: "omit" });
  }
  return data;
}
