import { hostedRemoteContext } from "./blob-runtime.mjs";

const IDENTITY_PATH = "/.netlify/identity";

/**
 * Netlify Identity user from JWT (Authorization: Bearer) or context.clientContext
 * @param {import('@netlify/functions').HandlerEvent} event
 * @param {import('@netlify/functions').HandlerContext} context
 * @returns {{ sub: string; email?: string } | null}
 */
export function getIdentityUser(event, context) {
  const cc = context?.clientContext;
  if (cc?.user) {
    return { sub: cc.user.sub, email: cc.user.email };
  }
  const auth = event.headers.authorization || event.headers.Authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (payload.sub) return { sub: payload.sub, email: payload.email };
  } catch {
    return null;
  }
  return null;
}

export function requireAuth(event, context) {
  const user = getIdentityUser(event, context);
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }
  return null;
}

function headerValue(headers, name) {
  if (!headers || typeof headers !== "object") return "";
  const want = String(name).toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === want) return String(value || "");
  }
  return "";
}

export function readBearerToken(event) {
  const auth = headerValue(event?.headers, "authorization");
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice(7).trim();
}

function decodeBearer(event) {
  const token = readBearerToken(event);
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (payload.sub) return { sub: payload.sub, email: payload.email };
  } catch {
    return null;
  }
  return null;
}

function identityUserEndpoint(base) {
  if (!base) return "";
  try {
    const url = new URL(String(base));
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    url.search = "";
    url.hash = "";
    const path = url.pathname.replace(/\/+$/, "") || "";
    if (path !== IDENTITY_PATH) url.pathname = IDENTITY_PATH;
    return `${url.origin}${IDENTITY_PATH}/user`;
  } catch {
    return "";
  }
}

/**
 * Identity API origin from Netlify runtime/site configuration only.
 * Never request Host/Origin or JWT `iss` — those are attacker-controlled.
 */
export async function resolveTrustedIdentityUrl() {
  try {
    const { getIdentityConfig } = await import("@netlify/identity");
    const cfg = getIdentityConfig();
    if (cfg?.url) return String(cfg.url);
  } catch {
    /* Identity helper unavailable outside Functions v2. */
  }
  const siteUrl = String(process.env.URL || "").trim();
  if (!siteUrl) return "";
  try {
    return new URL(IDENTITY_PATH, siteUrl).href;
  } catch {
    return "";
  }
}

export function identityUserUrlFromTrustedBase(base) {
  return identityUserEndpoint(base);
}

/**
 * Verify Studio's netlify-identity-widget Bearer against GoTrue GET /user.
 * Signature/expiry are enforced by the Identity API; we never decode the JWT.
 */
export async function verifyIdentityBearer(event) {
  const token = readBearerToken(event);
  if (!token) return null;
  const identityUrl = await resolveTrustedIdentityUrl();
  const userUrl = identityUserEndpoint(identityUrl);
  if (!userUrl) return null;
  try {
    const res = await fetch(userUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const id = data?.id || data?.sub;
    if (!id) return null;
    return { sub: String(id), email: data.email };
  } catch {
    return null;
  }
}

/** Unsigned JWTs are only accepted on local/dev functions, never hosted deploys. */
export function isUnsignedDevAuthAllowed() {
  if (hostedRemoteContext()) return false;
  return (
    process.env.LIVE_DEV_AUTH === "1" ||
    process.env.VITE_DEV_AUTH === "1" ||
    process.env.NETLIFY_DEV === "true"
  );
}

/**
 * Studio/operator authority for creating or recovering live runs.
 * Production: verified Identity (clientContext, getUser, or GET /user with
 * the widget Bearer). Local: unsigned preview bearer only when allowed.
 */
export async function requireOperatorAuth(event, context) {
  const cc = context?.clientContext;
  if (cc?.user?.sub) {
    return { user: { sub: cc.user.sub, email: cc.user.email } };
  }
  if (isUnsignedDevAuthAllowed()) {
    const user = decodeBearer(event);
    if (user?.sub) return { user };
  }
  const verified = await verifyIdentityBearer(event);
  if (verified?.sub) return { user: verified };
  return {
    error: { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) },
  };
}
