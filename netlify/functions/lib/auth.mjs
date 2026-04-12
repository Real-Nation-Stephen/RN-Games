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
